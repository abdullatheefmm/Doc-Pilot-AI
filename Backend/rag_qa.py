from __future__ import annotations

import json
import os
import sqlite3
import time as _time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from groq import Groq

import retrieval
from cache import answer_cache

load_dotenv()

GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
FEEDBACK_DB_PATH = Path("data/feedback.db")
MAX_HISTORY_TURNS = 6
DEFAULT_TOP_K = 4
DEFAULT_THRESHOLD = 0.15

SESSION_HISTORY: dict[str, list[dict[str, str]]] = {}
_groq_client: Groq | None = None


def init_feedback_store() -> None:
    FEEDBACK_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(FEEDBACK_DB_PATH) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                message_id TEXT,
                helpful INTEGER NOT NULL,
                query TEXT,
                answer TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.commit()


def get_groq_client() -> Groq:
    global _groq_client

    if _groq_client is None:
        if not GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY is missing. Add it to your .env file.")

        _groq_client = Groq(api_key=GROQ_API_KEY)

    return _groq_client


def detect_intent(query: str) -> str:
    lowered = query.lower()
    if any(keyword in lowered for keyword in {"compare", "difference", "versus", "vs"}):
        return "compare"
    if any(keyword in lowered for keyword in {"summarize", "summary", "overview"}):
        return "summarize"
    return "explain"


def rewrite_query(query: str, history: list[dict[str, str]]) -> str:
    lowered = query.lower()
    if not history:
        return query

    if not any(token in lowered for token in {"it", "that", "those", "they", "them", "this"}):
        return query

    last_user_messages = [item["content"] for item in history if item["role"] == "user"]
    if not last_user_messages:
        return query

    return f"{query} Related to: {last_user_messages[-1]}"


def build_history_window(session_id: str, limit: int = MAX_HISTORY_TURNS) -> list[dict[str, str]]:
    history = SESSION_HISTORY.get(session_id, [])
    return history[-limit:]


def append_to_history(session_id: str, role: str, content: str) -> None:
    SESSION_HISTORY.setdefault(session_id, []).append({"role": role, "content": content})


def get_history(session_id: str) -> list[dict[str, str]]:
    return SESSION_HISTORY.get(session_id, [])

def clear_history(session_id: str) -> None:
    if session_id in SESSION_HISTORY:
        del SESSION_HISTORY[session_id]


def compute_confidence(results: list[dict[str, Any]]) -> float:
    if not results:
        return 0.0

    average_score = sum(item["score"] for item in results) / len(results)
    normalized = max(0.0, min(1.0, (average_score + 1) / 2))
    return round(normalized, 3)


def build_context(results: list[dict[str, Any]]) -> str:
    blocks = []
    for index, result in enumerate(results, start=1):
        blocks.append(
            "\n".join(
                [
                    f"[Source {index}]",
                    f"Document: {result['document']}",
                    f"Similarity: {result['score']}",
                    f"Chunk: {result['text']}",
                ]
            )
        )
    return "\n\n".join(blocks)


def build_prompt(query: str, rewritten_query: str, context: str, history: list[dict[str, str]], intent: str) -> str:
    history_text = "\n".join(f"{item['role']}: {item['content']}" for item in history) or "No prior history."

    return f"""
You are a grounded documentation assistant for an enterprise knowledge management system.
Use only the supplied context to answer the user's question.
If the answer is not fully supported by the context, respond with exactly: I don't know
Do not use outside knowledge.
Be concise, clear, and cite supporting sources inline like [Source 1].
Format your answer using markdown where appropriate (bold, lists, code blocks).
Intent: {intent}

Conversation history:
{history_text}

Original question:
{query}

Rewritten retrieval question:
{rewritten_query}

Context:
{context}
""".strip()


def generate_grounded_answer(query: str, rewritten_query: str, results: list[dict[str, Any]], session_id: str) -> str:
    if not results:
        return "I don't know"

    prompt = build_prompt(
        query=query,
        rewritten_query=rewritten_query,
        context=build_context(results),
        history=build_history_window(session_id),
        intent=detect_intent(query),
    )

    try:
        response = get_groq_client().chat.completions.create(
            model=GROQ_MODEL,
            temperature=0.2,
            messages=[
                {
                    "role": "system",
                    "content": "You are a grounded enterprise knowledge assistant. Answer only from the supplied context. Use markdown formatting. If the answer is not supported by the context, respond exactly with: I don't know",
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
        )
    except Exception as exc:
        raise RuntimeError(f"Groq request failed: {exc}") from exc

    message = response.choices[0].message if response.choices else None
    text = (message.content or "").strip() if message else ""
    return text if text else "I don't know"


def generate_answer_stream(query: str, rewritten_query: str, results: list[dict[str, Any]], session_id: str):
    """Generator that yields tokens for SSE streaming."""
    if not results:
        yield "I don't know"
        return

    prompt = build_prompt(
        query=query,
        rewritten_query=rewritten_query,
        context=build_context(results),
        history=build_history_window(session_id),
        intent=detect_intent(query),
    )

    try:
        stream = get_groq_client().chat.completions.create(
            model=GROQ_MODEL,
            temperature=0.2,
            stream=True,
            messages=[
                {
                    "role": "system",
                    "content": "You are a grounded enterprise knowledge assistant. Answer only from the supplied context. Use markdown formatting. If the answer is not supported by the context, respond exactly with: I don't know",
                },
                {"role": "user", "content": prompt},
            ],
        )
        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    except Exception as exc:
        yield f"\n\n[Error: {exc}]"


def format_sources(results: list[dict[str, Any]]) -> list[dict[str, str]]:
    return [{"document": item["document"], "text": item["snippet"]} for item in results]


def format_retrieval_scores(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{"document": item["document"], "score": item["score"]} for item in results]


def generate_answer(
    query: str,
    session_id: str,
    top_k: int = DEFAULT_TOP_K,
    threshold: float = DEFAULT_THRESHOLD,
    mode: str = "hybrid",
    domain: str | None = None,
) -> dict[str, Any]:
    overall_start = _time.perf_counter()

    # Check cache first
    cache_key = f"{query}|{mode}|{domain or 'all'}"
    cached = answer_cache.get(cache_key)
    if cached is not None:
        elapsed = (_time.perf_counter() - overall_start) * 1000
        cached["cached"] = True
        cached["response_time_ms"] = round(elapsed, 1)
        return cached

    # Rewrite
    t0 = _time.perf_counter()
    history_window = build_history_window(session_id)
    rewritten_query = rewrite_query(query, history_window)
    rewrite_ms = (_time.perf_counter() - t0) * 1000

    # Retrieve
    t0 = _time.perf_counter()
    results, retrieve_ms = retrieval.retrieve(
        rewritten_query,
        top_k=top_k,
        threshold=threshold,
        mode=mode,
        domain=domain,
    )
    # retrieve_ms already computed inside retrieval

    # Generate
    t0 = _time.perf_counter()
    answer = generate_grounded_answer(query, rewritten_query, results, session_id)
    generate_ms = (_time.perf_counter() - t0) * 1000

    confidence = compute_confidence(results)
    intent = detect_intent(query)

    append_to_history(session_id, "user", query)
    append_to_history(session_id, "assistant", answer)

    total_ms = (_time.perf_counter() - overall_start) * 1000

    response = {
        "answer": answer,
        "sources": format_sources(results),
        "confidence": confidence,
        "session_id": session_id,
        "rewritten_query": rewritten_query,
        "intent": intent,
        "cached": False,
        "response_time_ms": round(total_ms, 1),
        "timing": {
            "rewrite_ms": round(rewrite_ms, 1),
            "retrieve_ms": round(retrieve_ms, 1),
            "generate_ms": round(generate_ms, 1),
        },
        "retrieval_scores": format_retrieval_scores(results),
        "domain": domain or "all",
    }

    # Cache the result
    answer_cache.put(cache_key, {k: v for k, v in response.items()})

    # Log to analytics
    try:
        from analytics import log_query
        log_query(
            query=query,
            answer=answer,
            confidence=confidence,
            response_time_ms=round(total_ms, 1),
            sources=[r["document"] for r in results],
            domain=domain,
            intent=intent,
            cached=False,
            session_id=session_id,
        )
    except Exception:
        pass

    return response


def save_feedback(
    session_id: str,
    helpful: bool,
    message_id: str | None = None,
    query: str | None = None,
    answer: str | None = None,
) -> None:
    init_feedback_store()
    with sqlite3.connect(FEEDBACK_DB_PATH) as connection:
        connection.execute(
            """
            INSERT INTO feedback (session_id, message_id, helpful, query, answer, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                message_id,
                int(helpful),
                query,
                answer,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        connection.commit()


def export_feedback() -> list[dict[str, Any]]:
    init_feedback_store()
    with sqlite3.connect(FEEDBACK_DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            "SELECT id, session_id, message_id, helpful, query, answer, created_at FROM feedback ORDER BY id DESC"
        ).fetchall()
    return [dict(row) for row in rows]


if __name__ == "__main__":
    init_feedback_store()
    session = "local-cli"
    question = input("Ask a question: ").strip()
    result = generate_answer(question, session)
    print(json.dumps(result, indent=2))
