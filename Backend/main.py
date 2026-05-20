from __future__ import annotations

import csv
import io
import json
import time as _time
import uuid
from pathlib import Path
from typing import Literal

import os

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from pypdf import PdfReader

from chunking import normalize_whitespace
import analytics
import knowledge_domains
import rag_qa
import retrieval
from cache import answer_cache

app = FastAPI(title="DocPilot AI — GenAI-Powered Knowledge Management System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path("data/fastapi_docs")
UPLOAD_DIR = DATA_DIR / "uploads"
SUPPORTED_UPLOADS = {
    ".pdf",   # PDF documents
    ".txt",   # Plain text
    ".md",    # Markdown
    ".docx",  # Microsoft Word
    ".doc",   # Legacy Word (treated as text)
    ".pptx",  # Microsoft PowerPoint
    ".ppt",   # Legacy PowerPoint (treated as text)
    ".xlsx",  # Microsoft Excel
    ".xls",   # Legacy Excel (treated as text)
    ".csv",   # Comma-separated values
    ".json",  # JSON data files
}
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")


# ─── Request / Response Models ──────────────────────────────────────

class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1)
    session_id: str | None = None
    top_k: int = 4
    threshold: float = 0.15
    retrieval_mode: str = "hybrid"
    domain: str | None = None


class SourceItem(BaseModel):
    document: str
    text: str


class RetrievalScore(BaseModel):
    document: str
    score: float


class TimingInfo(BaseModel):
    rewrite_ms: float = 0
    retrieve_ms: float = 0
    generate_ms: float = 0


class QueryResponse(BaseModel):
    answer: str
    sources: list[SourceItem]
    confidence: float
    session_id: str
    rewritten_query: str
    intent: str
    cached: bool = False
    response_time_ms: float = 0
    timing: TimingInfo = TimingInfo()
    retrieval_scores: list[RetrievalScore] = []
    domain: str = "all"


class FeedbackRequest(BaseModel):
    session_id: str
    helpful: bool
    message_id: str | None = None
    query: str | None = None
    answer: str | None = None


class DomainCreateRequest(BaseModel):
    id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    color: str = "#64748b"
    icon: str = "📁"


class UrlIngestRequest(BaseModel):
    url: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)
    domain: str | None = None


# ─── Helpers ────────────────────────────────────────────────────────

def ensure_directories() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _extract_pdf(file_path: Path) -> str:
    """Extract text from a PDF file."""
    try:
        reader = PdfReader(str(file_path))
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(pages)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"PDF extraction failed: {exc}") from exc


def _extract_docx(file_path: Path) -> str:
    """Extract text from a DOCX file, preserving headings and paragraphs."""
    try:
        import docx  # python-docx
        doc = docx.Document(str(file_path))
        lines: list[str] = []
        for para in doc.paragraphs:
            text = para.text.strip()
            if not text:
                continue
            # Tag headings for better chunking context
            if para.style and para.style.name.startswith("Heading"):
                level = para.style.name.replace("Heading ", "")
                lines.append(f"{'#' * int(level) if level.isdigit() else '#'} {text}")
            else:
                lines.append(text)
        # Also extract text from tables
        for table in doc.tables:
            for row in table.rows:
                cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if cells:
                    lines.append(" | ".join(cells))
        return "\n".join(lines)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"DOCX extraction failed: {exc}") from exc


def _extract_pptx(file_path: Path) -> str:
    """Extract text from a PPTX file, slide by slide."""
    try:
        from pptx import Presentation
        prs = Presentation(str(file_path))
        lines: list[str] = []
        for slide_num, slide in enumerate(prs.slides, start=1):
            lines.append(f"--- Slide {slide_num} ---")
            for shape in slide.shapes:
                if hasattr(shape, "text") and shape.text.strip():
                    lines.append(shape.text.strip())
        return "\n".join(lines)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"PPTX extraction failed: {exc}") from exc


def _extract_xlsx(file_path: Path) -> str:
    """Extract text from an XLSX file, sheet by sheet."""
    try:
        import openpyxl
        wb = openpyxl.load_workbook(str(file_path), data_only=True)
        lines: list[str] = []
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            lines.append(f"--- Sheet: {sheet_name} ---")
            for row in ws.iter_rows(values_only=True):
                cells = [str(c) for c in row if c is not None and str(c).strip()]
                if cells:
                    lines.append(" | ".join(cells))
        return "\n".join(lines)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"XLSX extraction failed: {exc}") from exc


def _extract_csv(file_path: Path) -> str:
    """Extract text from a CSV file."""
    try:
        content = file_path.read_text(encoding="utf-8", errors="ignore")
        reader = csv.reader(io.StringIO(content))
        rows = [" | ".join(cell.strip() for cell in row if cell.strip()) for row in reader]
        return "\n".join(r for r in rows if r)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"CSV extraction failed: {exc}") from exc


def _extract_json(file_path: Path) -> str:
    """Extract readable text from a JSON file."""
    try:
        data = json.loads(file_path.read_text(encoding="utf-8", errors="ignore"))
        return json.dumps(data, indent=2, ensure_ascii=False)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"JSON extraction failed: {exc}") from exc


def read_uploaded_text(file_path: Path) -> str:
    """Dispatch to the correct extractor based on file extension."""
    suffix = file_path.suffix.lower()

    if suffix in {".txt", ".md", ".doc", ".ppt", ".xls"}:
        # Legacy binary formats served as plain text (best-effort)
        return file_path.read_text(encoding="utf-8", errors="ignore")

    if suffix == ".pdf":
        return _extract_pdf(file_path)

    if suffix == ".docx":
        return _extract_docx(file_path)

    if suffix == ".pptx":
        return _extract_pptx(file_path)

    if suffix == ".xlsx":
        return _extract_xlsx(file_path)

    if suffix == ".csv":
        return _extract_csv(file_path)

    if suffix == ".json":
        return _extract_json(file_path)

    raise HTTPException(status_code=400, detail=f"Unsupported file type: '{suffix}'.")


# ─── Lifecycle ──────────────────────────────────────────────────────

@app.on_event("startup")
def startup_event() -> None:
    ensure_directories()
    retrieval.refresh_index()
    rag_qa.init_feedback_store()
    knowledge_domains.init_domains_db()
    analytics.init_analytics_db()


# ─── Core Q&A ───────────────────────────────────────────────────────

@app.post("/api/ask", response_model=QueryResponse)
def ask_question(request: QueryRequest):
    session_id = request.session_id or str(uuid.uuid4())

    try:
        return rag_qa.generate_answer(
            query=request.query.strip(),
            session_id=session_id,
            top_k=request.top_k,
            threshold=request.threshold,
            mode=request.retrieval_mode,
            domain=request.domain,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unexpected backend error: {exc}") from exc


@app.post("/api/ask/stream")
def ask_question_stream(request: QueryRequest):
    """Stream answer tokens via Server-Sent Events."""
    session_id = request.session_id or str(uuid.uuid4())

    history_window = rag_qa.build_history_window(session_id)
    rewritten_query = rag_qa.rewrite_query(request.query.strip(), history_window)
    results, retrieve_ms = retrieval.retrieve(
        rewritten_query,
        top_k=request.top_k,
        threshold=request.threshold,
        mode=request.retrieval_mode,
        domain=request.domain,
    )
    confidence = rag_qa.compute_confidence(results)
    intent = rag_qa.detect_intent(request.query)
    sources = rag_qa.format_sources(results)
    retrieval_scores = rag_qa.format_retrieval_scores(results)

    def event_stream():
        full_answer = []
        # Send metadata first
        meta = {
            "type": "meta",
            "confidence": confidence,
            "intent": intent,
            "sources": sources,
            "retrieval_scores": retrieval_scores,
            "rewritten_query": rewritten_query,
            "session_id": session_id,
            "retrieve_ms": retrieve_ms,
            "domain": request.domain or "all",
        }
        yield f"data: {json.dumps(meta)}\n\n"

        t0 = _time.perf_counter()
        for token in rag_qa.generate_answer_stream(
            request.query.strip(), rewritten_query, results, session_id
        ):
            full_answer.append(token)
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
        generate_ms = (_time.perf_counter() - t0) * 1000

        answer_text = "".join(full_answer)
        rag_qa.append_to_history(session_id, "user", request.query.strip())
        rag_qa.append_to_history(session_id, "assistant", answer_text)

        done = {"type": "done", "generate_ms": round(generate_ms, 1)}
        yield f"data: {json.dumps(done)}\n\n"

        # Log analytics
        try:
            analytics.log_query(
                query=request.query.strip(),
                answer=answer_text,
                confidence=confidence,
                response_time_ms=round(retrieve_ms + generate_ms, 1),
                sources=[r["document"] for r in results],
                domain=request.domain,
                intent=intent,
                cached=False,
                session_id=session_id,
            )
        except Exception:
            pass

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ─── Document Management ───────────────────────────────────────────

@app.post("/api/upload")
async def upload_document(
    file: UploadFile = File(...),
    password: str = Query(..., min_length=1),
    domain: str = Query("general"),
):
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Invalid admin password.")

    ensure_directories()

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in SUPPORTED_UPLOADS:
        supported = ", ".join(sorted(SUPPORTED_UPLOADS))
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix}'. Supported: {supported}"
        )

    upload_path = UPLOAD_DIR / file.filename
    upload_path.write_bytes(await file.read())

    extracted_text = normalize_whitespace(read_uploaded_text(upload_path))
    normalized_path = DATA_DIR / f"{upload_path.stem}.txt"
    normalized_path.write_text(extracted_text, encoding="utf-8")

    # Assign domain
    knowledge_domains.assign_document_domain(normalized_path.name, domain)

    # Generate AI summary
    summary = ""
    try:
        from summarization import generate_summary
        summary = generate_summary(extracted_text)
        knowledge_domains.save_document_summary(normalized_path.name, summary)
    except Exception:
        pass

    retrieval.refresh_index()
    answer_cache.invalidate_all()

    return {
        "filename": normalized_path.name,
        "status": "Indexed successfully",
        "documents_indexed": len(retrieval.get_documents()),
        "domain": domain,
        "summary": summary,
    }


@app.get("/api/documents")
def get_documents():
    docs = retrieval.get_document_inventory()
    domains = knowledge_domains.get_all_document_domains()
    summaries = knowledge_domains.get_all_summaries()
    for doc in docs:
        doc["domain"] = domains.get(doc["name"], "general")
        doc["summary"] = summaries.get(doc["name"], "")
    return {"documents": docs}


@app.delete("/api/documents/{filename}")
def delete_document(filename: str, password: str = Query(..., min_length=1)):
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Invalid admin password.")

    file_path = DATA_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    file_path.unlink()

    for f in UPLOAD_DIR.glob(f"{file_path.stem}.*"):
        f.unlink()

    retrieval.refresh_index()
    answer_cache.invalidate_all()
    return {"status": "deleted", "filename": filename}


@app.get("/api/documents/{doc_id}/summary")
def get_document_summary(doc_id: str):
    summary = knowledge_domains.get_document_summary(f"{doc_id}.txt")
    return {"document": doc_id, "summary": summary or "No summary available."}


# ─── URL Ingestion ──────────────────────────────────────────────────

@app.post("/api/ingest-url")
def ingest_url(request: UrlIngestRequest):
    if request.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Invalid admin password.")

    try:
        from ingestion import ingest_url as _ingest, save_ingested
        filename, text = _ingest(request.url)
        save_ingested(filename, text)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to ingest URL: {exc}") from exc

    # Assign domain
    knowledge_domains.assign_document_domain(filename, request.domain or "general")

    # Generate summary
    try:
        from summarization import generate_summary
        summary = generate_summary(text)
        knowledge_domains.save_document_summary(filename, summary)
    except Exception:
        pass

    retrieval.refresh_index()
    answer_cache.invalidate_all()

    return {
        "filename": filename,
        "status": "Indexed successfully",
        "documents_indexed": len(retrieval.get_documents()),
        "domain": request.domain or "general",
    }


# ─── Knowledge Domains ─────────────────────────────────────────────

@app.get("/api/domains")
def list_domains():
    domains = knowledge_domains.list_domains()
    doc_domains = knowledge_domains.get_all_document_domains()
    for d in domains:
        d["document_count"] = sum(1 for v in doc_domains.values() if v == d["id"])
    return {"domains": domains}


@app.post("/api/domains")
def create_domain(request: DomainCreateRequest):
    domain = knowledge_domains.create_domain(request.id, request.name, request.color, request.icon)
    return {"domain": domain}


@app.put("/api/documents/{doc_name}/domain")
def assign_domain(doc_name: str, domain: str = Query(..., min_length=1)):
    knowledge_domains.assign_document_domain(doc_name, domain)
    return {"status": "assigned", "document": doc_name, "domain": domain}


# ─── Chat History ───────────────────────────────────────────────────

@app.get("/api/history")
def get_history(session_id: str = Query(..., min_length=1)):
    return {"session_id": session_id, "history": rag_qa.get_history(session_id)}

@app.delete("/api/history/{session_id}")
def clear_history(session_id: str):
    rag_qa.clear_history(session_id)
    return {"status": "cleared"}


# ─── Feedback ───────────────────────────────────────────────────────

@app.post("/api/feedback")
def submit_feedback(request: FeedbackRequest):
    rag_qa.save_feedback(
        session_id=request.session_id,
        helpful=request.helpful,
        message_id=request.message_id,
        query=request.query,
        answer=request.answer,
    )
    return {"status": "saved"}


@app.get("/api/feedback")
def list_feedback():
    return {"feedback": rag_qa.export_feedback()}


# ─── Analytics ──────────────────────────────────────────────────────

@app.get("/api/analytics/dashboard")
def get_analytics_dashboard():
    data = analytics.get_dashboard_data()
    data["cache_stats"] = answer_cache.stats()
    return data


# ─── Export ─────────────────────────────────────────────────────────

@app.get("/api/export/chat/{session_id}")
def export_chat(session_id: str):
    history = rag_qa.get_history(session_id)
    if not history:
        return {"markdown": "# Chat Export\n\nNo messages in this session."}

    lines = ["# DocPilot AI — Chat Export", f"**Session:** {session_id}\n", "---\n"]
    for msg in history:
        role = "**You**" if msg["role"] == "user" else "**Assistant**"
        lines.append(f"{role}:\n{msg['content']}\n")
    return {"markdown": "\n".join(lines)}


@app.get("/api/export/knowledge-base")
def export_knowledge_base():
    docs = retrieval.get_document_inventory()
    summaries = knowledge_domains.get_all_summaries()
    domains_map = knowledge_domains.get_all_document_domains()

    lines = ["# DocPilot AI — Knowledge Base Export\n"]
    for doc in docs:
        lines.append(f"## {doc['name']}")
        lines.append(f"- **Size:** {doc['size']}")
        lines.append(f"- **Domain:** {domains_map.get(doc['name'], 'general')}")
        summary = summaries.get(doc["name"], "No summary available.")
        lines.append(f"- **Summary:** {summary}\n")
    return {"markdown": "\n".join(lines)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
