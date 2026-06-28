from __future__ import annotations

import os
import time as _time
from datetime import datetime
from pathlib import Path
from typing import Any

from sentence_transformers import SentenceTransformer
from supabase_client import supabase

from chunking import smart_chunk_text, iter_source_files, normalize_whitespace

DATA_DIR = Path("data/fastapi_docs")
MODEL_NAME = "all-MiniLM-L6-v2"
TOP_K = 4
SIMILARITY_THRESHOLD = 0.15
MAX_SNIPPET_CHARS = 320

# ─── Policy Date Prioritization ──────────────────────────────────────────────

def _get_document_upload_dates() -> dict[str, datetime]:
    """Fetch upload timestamps for all indexed documents from audit_logs."""
    dates: dict[str, datetime] = {}
    if not supabase:
        return dates
    try:
        res = supabase.table("audit_logs") \
            .select("created_at, details") \
            .eq("action_type", "upload_document") \
            .order("created_at", desc=False) \
            .execute()
        for row in res.data:
            details = row.get("details") or {}
            filename = details.get("filename") or details.get("original_filename")
            created_at = row.get("created_at")
            if filename and created_at:
                try:
                    dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                    # Always keep the LATEST upload for a given filename
                    if filename not in dates or dt > dates[filename]:
                        dates[filename] = dt
                except Exception:
                    pass
    except Exception as e:
        print(f"[PolicyPriority] Could not fetch upload dates: {e}")
    return dates


def apply_date_priority_boost(results: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], str | None]:
    """
    Re-weight retrieved chunks so that documents uploaded more recently
    receive a small score boost over older conflicting documents.

    Returns (reordered_results, policy_note) where policy_note is a UI
    notification string if a conflict was detected, else None.
    """
    if len(results) < 2:
        return results, None

    upload_dates = _get_document_upload_dates()
    if not upload_dates:
        return results, None

    MAX_BOOST = 0.05  # Cap boost so relevance still dominates

    newest_ts: datetime | None = None
    oldest_ts: datetime | None = None

    # Find newest & oldest among results to normalise
    for r in results:
        doc_ts = upload_dates.get(r["document"])
        if doc_ts:
            if newest_ts is None or doc_ts > newest_ts:
                newest_ts = doc_ts
            if oldest_ts is None or doc_ts < oldest_ts:
                oldest_ts = doc_ts

    policy_note: str | None = None

    if newest_ts and oldest_ts and newest_ts != oldest_ts:
        date_range_seconds = (newest_ts - oldest_ts).total_seconds()
        for r in results:
            doc_ts = upload_dates.get(r["document"])
            if doc_ts:
                age_ratio = (doc_ts - oldest_ts).total_seconds() / date_range_seconds
                boost = round(age_ratio * MAX_BOOST, 5)
                r["score"] = round(r["score"] + boost, 5)

        # Build policy note for the frontend
        newest_doc = max(results, key=lambda r: upload_dates.get(r["document"], oldest_ts))
        newest_date_str = newest_ts.strftime("%B %d, %Y")
        policy_note = (
            f"**[VERSION & CONTINUATION GUARD]** Multiple related documents detected. "
            f"The AI context includes both historical and recent files (prioritizing **{newest_doc['document']}**, "
            f"uploaded {newest_date_str}) to seamlessly resolve active rules, continuations, and past references."
        )

    # Re-sort by boosted score
    results.sort(key=lambda r: -r["score"])
    return results, policy_note

_model: SentenceTransformer | None = None

def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        print("Loading embedding model...")
        _model = SentenceTransformer(MODEL_NAME)
    return _model

def snippet_from_chunk(text: str, limit: int = MAX_SNIPPET_CHARS) -> str:
    compact = " ".join(text.split())
    return compact if len(compact) <= limit else f"{compact[:limit].rstrip()}..."

def refresh_index() -> int:
    """Sync local documents to Supabase if they are not already there."""
    if not supabase: return 0
    if not DATA_DIR.exists(): return 0
    
    # Check what is already in Supabase
    resp = supabase.table("document_chunks").select("document_name").execute()
    existing_docs = {r["document_name"] for r in resp.data}
    
    inserted = 0
    for file_path in iter_source_files(DATA_DIR):
        if file_path.name in existing_docs:
            continue
            
        print(f"Syncing {file_path.name} to Supabase...")
        text = normalize_whitespace(file_path.read_text(encoding="utf-8"))
        index_document(file_path.name, text)
        inserted += 1
            
    return inserted

def index_document(filename: str, text: str) -> None:
    if not supabase: return
    # Delete existing chunks for this document if any
    supabase.table("document_chunks").delete().eq("document_name", filename).execute()
    
    # DLP: Redact sensitive information before indexing
    from dlp import redact_pii
    safe_text = redact_pii(text)
    
    chunks = list(smart_chunk_text(safe_text))
    rows = []
    import numpy as np
    for chunk_index, chunk in enumerate(chunks, start=1):
        embedding = get_model().encode(chunk)
        embedding = embedding / np.linalg.norm(embedding)
        rows.append({
            "document_name": filename,
            "chunk_index": chunk_index,
            "text": chunk,
            "snippet": snippet_from_chunk(chunk),
            "embedding": embedding.tolist()
        })
    if rows:
        supabase.table("document_chunks").insert(rows).execute()

def delete_document_from_index(filename: str) -> None:
    if not supabase: return
    stem = Path(filename).stem
    supabase.table("document_chunks").delete().ilike("document_name", f"{stem}%").execute()


def get_documents() -> list[dict[str, Any]]:
    # In cloud setup, we don't return all raw documents chunks in memory.
    # Return a fake list to avoid crashing code that expects length > 0 for sanity checks.
    return [{"text": "dummy"}]

def get_document_inventory(data_dir: Path = DATA_DIR) -> list[dict[str, Any]]:
    if not supabase: return []
    resp = supabase.table("document_chunks").select("document_name").execute()
    unique_docs = set(r["document_name"] for r in resp.data)
    
    inventory = []
    for doc in unique_docs:
        inventory.append({
            "id": doc.split('.')[0],
            "name": doc,
            "size": "Cloud Storage",
            "status": "Indexed"
        })
    return inventory

def generate_hypothetical_document(query: str) -> str:
    try:
        from llm_client import generate_completion
        prompt = f"Please write a passage that answers the following question. Do not explain, just write the passage as if it were a snippet from a technical documentation.\n\nQuestion: {query}"
        return generate_completion([{"role": "user", "content": prompt}], max_tokens=250)
    except Exception as e:
        print(f"HyDE generation failed: {e}")
        return query

def _semantic_search(query: str, top_k: int, threshold: float, user_id: str, user_role: str, domain: str | None = None, use_hyde: bool = False) -> list[dict[str, Any]]:
    if not supabase: return []
    
    search_text = query
    if use_hyde:
        hypo_doc = generate_hypothetical_document(query)
        search_text = f"{query}\n\n{hypo_doc}"
        
    query_embedding = get_model().encode(search_text)
    import numpy as np
    query_embedding = query_embedding / np.linalg.norm(query_embedding)
    
    resp = supabase.rpc("match_document_chunks", {
        "query_embedding": query_embedding.tolist(),
        "match_threshold": threshold,
        "match_count": top_k,
        "p_user_id": user_id,
        "p_user_role": user_role,
        "domain_filter": domain or "all"
    }).execute()
    
    results = []
    for rank, item in enumerate(resp.data):
        results.append({
            "idx": item["id"],
            "score": round(item["similarity"], 4),
            "rank": rank,
            "document": item["document_name"],
            "chunk_index": item["chunk_index"],
            "text": item["text"],
            "snippet": item["snippet"]
        })
    return results

def _keyword_search(query: str, top_k: int, user_id: str, user_role: str, domain: str | None = None) -> list[dict[str, Any]]:
    if not supabase: return []
    
    resp = supabase.rpc("keyword_search_chunks", {
        "search_query": query,
        "match_count": top_k,
        "p_user_id": user_id,
        "p_user_role": user_role,
        "domain_filter": domain or "all"
    }).execute()
    
    results = []
    for rank, item in enumerate(resp.data):
        results.append({
            "idx": item["id"],
            "score": round(item["similarity"], 4),
            "rank": rank,
            "document": item["document_name"],
            "chunk_index": item["chunk_index"],
            "text": item["text"],
            "snippet": item["snippet"]
        })
    return results

def retrieve(
    query: str,
    user_id: str,
    user_role: str,
    top_k: int = TOP_K,
    threshold: float = SIMILARITY_THRESHOLD,
    mode: str = "hybrid",
    domain: str | None = None,
) -> tuple[list[dict[str, Any]], float, str | None]:
    """Retrieve relevant chunks. Returns (results, elapsed_ms, policy_note)."""
    start = _time.perf_counter()
    if not supabase: return [], 0.0, None

    results: list[dict[str, Any]] = []

    if mode == "semantic":
        results = _semantic_search(query, top_k, threshold, user_id, user_role, domain)
    elif mode == "keyword":
        results = _keyword_search(query, top_k, user_id, user_role, domain)
    else:  # hybrid — RRF fusion
        semantic_results = _semantic_search(query, top_k, threshold, user_id, user_role, domain)
        keyword_results = _keyword_search(query, top_k, user_id, user_role, domain)

        k = 60
        rrf_scores: dict[int, float] = {}
        items_map = {}

        for r in semantic_results:
            rrf_scores[r["idx"]] = rrf_scores.get(r["idx"], 0) + 1.0 / (k + r["rank"])
            items_map[r["idx"]] = r

        for r in keyword_results:
            rrf_scores[r["idx"]] = rrf_scores.get(r["idx"], 0) + 1.0 / (k + r["rank"])
            items_map[r["idx"]] = r

        sorted_items = sorted(rrf_scores.items(), key=lambda x: -x[1])
        for idx, score in sorted_items[:top_k]:
            result = items_map[idx]
            result["score"] = round(score, 4)
            results.append(result)

    # Apply date-priority boost for conflicting policy documents
    results, policy_note = apply_date_priority_boost(results)

    elapsed = (_time.perf_counter() - start) * 1000
    return results, round(elapsed, 1), policy_note

if os.getenv("DISABLE_AUTO_INDEX") != "1":
    # Optional: Automatically sync local files to Supabase on startup
    pass

if __name__ == "__main__":
    question = "How do I create a FastAPI route?"
    hits, ms = retrieve(question)
    for result in hits:
        print(f"Source: {result['document']} | Score: {result['score']}")
