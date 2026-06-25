from __future__ import annotations

import json
import os
import sqlite3
import time as _time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from openai import OpenAI

import retrieval
import reranker
import web_agent
import dlp
import evaluation

from llm_client import get_llm_client, LLM_MODEL
FEEDBACK_DB_PATH = Path("data/feedback.db")
MAX_HISTORY_TURNS = 6
DEFAULT_TOP_K = 4
DEFAULT_THRESHOLD = 0.15

SESSION_HISTORY: dict[str, list[dict[str, str]]] = {}
_llm_client: OpenAI | None = None


def init_feedback_store() -> None:
    pass





def detect_intent(query: str) -> str:
    lowered = query.lower()
    if any(keyword in lowered for keyword in {"compare", "difference", "versus", "vs"}):
        return "compare"
    if any(keyword in lowered for keyword in {"summarize", "summary", "overview"}):
        return "summarize"
    return "explain"


def rewrite_query(query: str, history: list[dict[str, str]]) -> str:
    from query_optimizer import optimize_query
    return optimize_query(query, history)


def get_history(session_id: str) -> list[dict[str, str]]:
    from supabase_client import supabase
    if supabase:
        try:
            res = supabase.table("chat_messages").select("role, content").eq("session_id", session_id).order("created_at", desc=False).execute()
            if res.data:
                SESSION_HISTORY[session_id] = [{"role": r["role"], "content": r["content"]} for r in res.data]
                return SESSION_HISTORY[session_id]
        except Exception as e:
            print(f"Error fetching history: {e}")
    return SESSION_HISTORY.get(session_id, [])


def build_history_window(session_id: str, limit: int = MAX_HISTORY_TURNS) -> list[dict[str, str]]:
    history = get_history(session_id)
    return history[-limit:]


def get_all_sessions(user_id: str | None = None) -> list[dict[str, Any]]:
    from supabase_client import supabase
    if supabase:
        try:
            query = supabase.table("chat_sessions").select("*")
            if user_id:
                query = query.eq("user_id", user_id)
            res = query.order("created_at", desc=True).execute()
            return res.data if res.data else []
        except Exception as e:
            print(f"Error fetching sessions: {e}")
    return []


def append_to_history(session_id: str, role: str, content: str, user_id: str | None = None) -> None:
    SESSION_HISTORY.setdefault(session_id, []).append({"role": role, "content": content})
    from supabase_client import supabase
    if supabase and user_id:
        try:
            session_res = supabase.table("chat_sessions").select("id").eq("id", session_id).execute()
            if not session_res.data:
                title = (content[:40] + "...") if role == "user" else "New Chat"
                # We attempt to insert search_mode if the column exists in Supabase.
                try:
                    supabase.table("chat_sessions").insert({"id": session_id, "user_id": user_id, "title": title, "search_mode": "internal"}).execute()
                except Exception:
                    supabase.table("chat_sessions").insert({"id": session_id, "user_id": user_id, "title": title}).execute()
                
            supabase.table("chat_messages").insert({
                "session_id": session_id,
                "role": role,
                "content": content
            }).execute()
        except Exception as e:
            print(f"Error saving to DB: {e}")


def clear_history(session_id: str) -> None:
    if session_id in SESSION_HISTORY:
        del SESSION_HISTORY[session_id]
    from supabase_client import supabase
    if supabase:
        try:
            supabase.table("chat_sessions").delete().eq("id", session_id).execute()
        except Exception:
            pass


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
                    f"--- Source [{index}] ---",
                    f"Document: {result.get('document', 'Unknown')}",
                    f"Text: {result.get('text', '')}",
                ]
            )
        )
    return "\n\n".join(blocks)

def crag_grade_context(query: str, context: str) -> bool:
    """CRAG Grader: Checks if the retrieved context is relevant to the query."""
    if not context.strip():
        return False
        
    prompt = f"""You are a Relevance Grader. Your job is to assess whether the provided CONTEXT contains relevant information to answer the user's QUERY.
    
QUERY: {query}

CONTEXT:
{context}

Respond ONLY with 'yes' if the context is relevant and contains information to answer the query, or 'no' if it is completely irrelevant. Do not explain."""

    try:
        from llm_client import get_llm_client, LLM_MODEL
        client = get_llm_client()
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=2
        )
        grade = response.choices[0].message.content.strip().lower()
        return "yes" in grade
    except Exception as e:
        print(f"CRAG Grader failed: {e}")
        return True # Fallback to true if grader fails


def build_prompt(query: str, rewritten_query: str, context: str, history: list[dict[str, str]], intent: str) -> str:
    history_text = "\n".join(f"{item['role']}: {item['content']}" for item in history) or "No prior history."

    return f"""
You are a grounded documentation assistant for an enterprise knowledge management system.
Use only the supplied context to answer the user's question.
If the answer is not fully supported by the context, respond with exactly: I don't know
Do not use outside knowledge.
Be concise, clear, and cite supporting sources inline like [Source 1].
Format your answer using markdown where appropriate (bold, lists, code blocks).
If the user asks for a structural breakdown, workflow, hierarchy, or architecture, you MUST generate a Mermaid.js diagram enclosed in ```mermaid ... ``` code blocks to visually represent the data.
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


def generate_grounded_answer(query: str, rewritten_query: str, results: list[dict[str, Any]], session_id: str, model: str | None = None) -> str:
    if not results:
        return "I don't know"

    context_str = build_context(results)
    
    # CRAG Grader Check
    if not crag_grade_context(query, context_str):
        return "The internal documents do not contain relevant information to answer this query. (CRAG Fallback Rejection)"

    prompt = build_prompt(
        query=query,
        rewritten_query=rewritten_query,
        context=context_str,
        history=build_history_window(session_id),
        intent=detect_intent(query),
    )

    try:
        response = get_llm_client().chat.completions.create(
            model=model or LLM_MODEL,
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
        raise RuntimeError(f"OpenAI request failed: {exc}") from exc

    message = response.choices[0].message if response.choices else None
    text = (message.content or "").strip() if message else ""
    if text:
        text = dlp.redact_pii(text)
    return text if text else "I don't know"


def generate_answer_stream(query: str, rewritten_query: str, results: list[dict[str, Any]], session_id: str, model: str | None = None):
    """Generator that yields tokens for SSE streaming."""
    if not results:
        yield "I don't know"
        return

    context_str = build_context(results)
    
    # CRAG Grader Check
    if not crag_grade_context(query, context_str):
        yield "The internal documents do not contain relevant information to answer this query. (CRAG Fallback Rejection)"
        return

    prompt = build_prompt(
        query=query,
        rewritten_query=rewritten_query,
        context=context_str,
        history=build_history_window(session_id),
        intent=detect_intent(query),
    )

    try:
        stream = get_llm_client().chat.completions.create(
            model=model or LLM_MODEL,
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
                # Scrub the outbound token stream (Note: partial tokens might slip through if they straddle a regex pattern, 
                # but full patterns are redacted when sent. A buffer approach is safer for production streaming DLP, 
                # but we apply redact_pii here as a baseline).
                safe_token = dlp.redact_pii(chunk.choices[0].delta.content)
                yield safe_token
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
    user_id: str = "",
    user_role: str = "",
    model: str | None = None,
    search_mode: str = "internal",
) -> dict[str, Any]:
    overall_start = _time.perf_counter()

    # Check Semantic Cache first
    from semantic_cache import semantic_answer_cache
    cached = semantic_answer_cache.get(query=query, mode=mode, domain=domain or "all", user_role=user_role)
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

    # Retrieve (fetch a larger candidate pool for reranking)
    t0 = _time.perf_counter()
    candidate_results, retrieve_ms = retrieval.retrieve(
        rewritten_query,
        user_id=user_id,
        user_role=user_role,
        top_k=25, # Fetch 25 candidates
        threshold=threshold,
        mode=mode,
        domain=domain,
    )
    
    # Rerank
    rerank_t0 = _time.perf_counter()
    results = reranker.rerank_chunks(rewritten_query, candidate_results, top_n=top_k)
    rerank_ms = (_time.perf_counter() - rerank_t0) * 1000

    # Generate
    t0 = _time.perf_counter()
    answer = generate_grounded_answer(query, rewritten_query, results, session_id, model=model)
    generate_ms = (_time.perf_counter() - t0) * 1000

    confidence = compute_confidence(results)
    intent = detect_intent(query)

    append_to_history(session_id, "user", query, user_id=user_id)
    append_to_history(session_id, "assistant", answer, user_id=user_id)

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
            "rerank_ms": round(rerank_ms, 1),
            "generate_ms": round(generate_ms, 1),
        },
        "retrieval_scores": format_retrieval_scores(results),
        "domain": domain or "all",
    }

    # Cache the result
    semantic_answer_cache.put(query=query, mode=mode, domain=domain or "all", user_role=user_role, value={k: v for k, v in response.items()})

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
            user_id=user_id,
        )
        
        # Log to MLflow for MLOps
        evaluation.log_rag_evaluation(
            query=query,
            answer=answer,
            context=[r["snippet"] for r in results] if results else [],
            confidence=confidence,
            duration_ms=total_ms
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
    from supabase_client import supabase
    if not supabase: return
    supabase.table("feedback").insert({
        "session_id": session_id,
        "message_id": message_id,
        "helpful": helpful,
        "query": query,
        "answer": answer,
        "created_at": datetime.now(timezone.utc).isoformat()
    }).execute()


def export_feedback() -> list[dict[str, Any]]:
    from supabase_client import supabase
    if not supabase: return []
    response = supabase.table("feedback").select("*").order("id", desc=True).execute()
    return response.data


if __name__ == "__main__":
    init_feedback_store()
    session = "local-cli"
    question = input("Ask a question: ").strip()
    result = generate_answer(question, session)
    print(json.dumps(result, indent=2))
