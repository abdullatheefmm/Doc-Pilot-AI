from __future__ import annotations

import os
import pickle
import time as _time
from pathlib import Path
from typing import Any

import faiss
import numpy as np
from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer

from chunking import smart_chunk_text, iter_source_files, normalize_whitespace

DATA_DIR = Path("data/fastapi_docs")
MODEL_NAME = "all-MiniLM-L6-v2"
TOP_K = 4
SIMILARITY_THRESHOLD = 0.15
MAX_SNIPPET_CHARS = 320

INDEX_PATH = DATA_DIR / "faiss.index"
DOCS_PATH = DATA_DIR / "documents.pkl"

_model: SentenceTransformer | None = None
_documents: list[dict[str, Any]] = []
_faiss_index: faiss.Index | None = None
_bm25_index: BM25Okapi | None = None


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        print("Loading embedding model...")
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def snippet_from_chunk(text: str, limit: int = MAX_SNIPPET_CHARS) -> str:
    compact = " ".join(text.split())
    return compact if len(compact) <= limit else f"{compact[:limit].rstrip()}..."


def load_documents(data_dir: Path = DATA_DIR) -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    for file_path in iter_source_files(data_dir):
        text = normalize_whitespace(file_path.read_text(encoding="utf-8"))
        for chunk_index, chunk in enumerate(smart_chunk_text(text), start=1):
            documents.append(
                {
                    "document": file_path.name,
                    "path": str(file_path),
                    "chunk_index": chunk_index,
                    "text": chunk,
                    "snippet": snippet_from_chunk(chunk),
                }
            )
    return documents


def refresh_index() -> int:
    global _documents, _faiss_index, _bm25_index

    _documents = load_documents()
    texts = [document["text"] for document in _documents]

    if not texts:
        _faiss_index = None
        _bm25_index = None
        if INDEX_PATH.exists():
            INDEX_PATH.unlink()
        if DOCS_PATH.exists():
            DOCS_PATH.unlink()
        return 0

    # FAISS vector index
    embeddings = get_model().encode(texts)
    embeddings = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)
    embeddings = np.asarray(embeddings, dtype=np.float32)

    dimension = embeddings.shape[1]
    _faiss_index = faiss.IndexFlatIP(dimension)
    _faiss_index.add(embeddings)

    # BM25 keyword index
    tokenized_corpus = [t.lower().split() for t in texts]
    _bm25_index = BM25Okapi(tokenized_corpus)

    faiss.write_index(_faiss_index, str(INDEX_PATH))
    with open(DOCS_PATH, "wb") as f:
        pickle.dump(_documents, f)

    return len(_documents)


def get_documents() -> list[dict[str, Any]]:
    global _documents, _faiss_index
    if _faiss_index is None:
        if INDEX_PATH.exists() and DOCS_PATH.exists():
            _faiss_index = faiss.read_index(str(INDEX_PATH))
            with open(DOCS_PATH, "rb") as f:
                _documents = pickle.load(f)
        else:
            refresh_index()
    return _documents


def get_document_inventory(data_dir: Path = DATA_DIR) -> list[dict[str, Any]]:
    inventory: list[dict[str, Any]] = []
    for file_path in sorted(data_dir.iterdir()):
        if not file_path.is_file() or file_path.suffix.lower() not in {".txt", ".md"}:
            continue
        inventory.append(
            {
                "id": file_path.stem,
                "name": file_path.name,
                "size": f"{round(file_path.stat().st_size / 1024, 1)} KB",
                "status": "Indexed",
            }
        )
    return inventory


def _semantic_search(query: str, top_k: int, threshold: float, allowed_indices: set[int] | None = None) -> list[dict[str, Any]]:
    """Run FAISS vector search."""
    if _faiss_index is None:
        return []
    documents = get_documents()
    query_embedding = get_model().encode([query])
    query_embedding = query_embedding / np.linalg.norm(query_embedding, axis=1, keepdims=True)
    query_embedding = np.asarray(query_embedding, dtype=np.float32)

    search_k = min(top_k * 3, len(documents))
    distances, indices = _faiss_index.search(query_embedding, search_k)

    results = []
    for rank, (dist, idx) in enumerate(zip(distances[0], indices[0])):
        if idx == -1 or dist < threshold:
            continue
        if allowed_indices is not None and idx not in allowed_indices:
            continue
        results.append({"idx": int(idx), "score": float(dist), "rank": rank})
    return results


def _keyword_search(query: str, top_k: int, allowed_indices: set[int] | None = None) -> list[dict[str, Any]]:
    """Run BM25 keyword search."""
    if _bm25_index is None:
        return []
    documents = get_documents()
    tokenized = query.lower().split()
    scores = _bm25_index.get_scores(tokenized)

    results = []
    for idx in np.argsort(scores)[::-1][:top_k * 3]:
        if scores[idx] <= 0:
            continue
        if allowed_indices is not None and idx not in allowed_indices:
            continue
        results.append({"idx": int(idx), "score": float(scores[idx]), "rank": len(results)})
    return results


def retrieve(
    query: str,
    top_k: int = TOP_K,
    threshold: float = SIMILARITY_THRESHOLD,
    mode: str = "hybrid",
    domain: str | None = None,
) -> tuple[list[dict[str, Any]], float]:
    """Retrieve relevant chunks using hybrid, semantic, or keyword search.

    Returns:
        (results, elapsed_ms)
    """
    start = _time.perf_counter()
    documents = get_documents()

    if not documents:
        return [], 0.0

    # Domain filtering
    allowed_indices: set[int] | None = None
    if domain and domain != "all":
        from knowledge_domains import get_document_domain
        allowed_indices = set()
        for i, doc in enumerate(documents):
            if get_document_domain(doc["document"]) == domain:
                allowed_indices.add(i)

    results: list[dict[str, Any]] = []

    if mode == "semantic":
        scored = _semantic_search(query, top_k, threshold, allowed_indices)
        for r in scored[:top_k]:
            result = dict(documents[r["idx"]])
            result["score"] = round(r["score"], 4)
            results.append(result)

    elif mode == "keyword":
        scored = _keyword_search(query, top_k, allowed_indices)
        for r in scored[:top_k]:
            result = dict(documents[r["idx"]])
            result["score"] = round(r["score"], 4)
            results.append(result)

    else:  # hybrid — RRF fusion
        semantic_results = _semantic_search(query, top_k, threshold, allowed_indices)
        keyword_results = _keyword_search(query, top_k, allowed_indices)

        k = 60  # RRF constant
        rrf_scores: dict[int, float] = {}
        for r in semantic_results:
            rrf_scores[r["idx"]] = rrf_scores.get(r["idx"], 0) + 1.0 / (k + r["rank"])
        for r in keyword_results:
            rrf_scores[r["idx"]] = rrf_scores.get(r["idx"], 0) + 1.0 / (k + r["rank"])

        sorted_items = sorted(rrf_scores.items(), key=lambda x: -x[1])
        for idx, score in sorted_items[:top_k]:
            result = dict(documents[idx])
            result["score"] = round(score, 4)
            results.append(result)

    elapsed = (_time.perf_counter() - start) * 1000
    return results, round(elapsed, 1)


if os.getenv("DISABLE_AUTO_INDEX") != "1":
    refresh_index()


if __name__ == "__main__":
    question = "How do I create a FastAPI route?"
    hits, ms = retrieve(question)

    print(f"\nQuestion: {question} ({ms:.1f}ms)\n")
    for result in hits:
        print(f"Source: {result['document']} | Score: {result['score']}")
        print(result["snippet"], "\n")
