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

SESSION_HISTORY: dict[str, list[dict[str, Any]]] = {}
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


def get_history(session_id: str) -> list[dict[str, Any]]:
    from supabase_client import supabase
    branch_prefix = []
    if supabase:
        try:
            # Check if this session is a branch
            sess_res = supabase.table("chat_sessions").select("*").eq("id", session_id).execute()
            if sess_res.data:
                sess = sess_res.data[0]
                parent_id = sess.get("parent_session_id")
                branch_msg_id = sess.get("branch_point_message_id")
                if parent_id:
                    parent_history = get_history(parent_id)
                    split_idx = len(parent_history)
                    for idx, m in enumerate(parent_history):
                        if str(m.get("id")) == str(branch_msg_id) or str(idx) == str(branch_msg_id):
                            split_idx = idx + 1
                            break
                    branch_prefix = parent_history[:split_idx]
        except Exception:
            pass

        try:
            res = supabase.table("chat_messages").select("id, role, content, created_at").eq("session_id", session_id).order("created_at", desc=False).execute()
            if res.data:
                msgs = [{"id": str(r.get("id", idx)), "role": r["role"], "content": r["content"], "created_at": r.get("created_at", "")} for idx, r in enumerate(res.data)]
                SESSION_HISTORY[session_id] = branch_prefix + msgs
                return SESSION_HISTORY[session_id]
        except Exception:
            try:
                res = supabase.table("chat_messages").select("role, content").eq("session_id", session_id).order("created_at", desc=False).execute()
                if res.data:
                    msgs = [{"id": str(idx), "role": r["role"], "content": r["content"]} for idx, r in enumerate(res.data)]
                    SESSION_HISTORY[session_id] = branch_prefix + msgs
                    return SESSION_HISTORY[session_id]
            except Exception as e:
                print(f"Error fetching history: {e}")
    cur_msgs = SESSION_HISTORY.get(session_id, [])
    return branch_prefix + cur_msgs


def build_history_window(session_id: str, limit: int = MAX_HISTORY_TURNS) -> list[dict[str, Any]]:
    history = get_history(session_id)
    return history[-limit:]


BRANCH_META_FILE = Path("data/session_branches.json")

def _save_branch_meta(child_id: str, parent_id: str, msg_id: str):
    try:
        BRANCH_META_FILE.parent.mkdir(parents=True, exist_ok=True)
        meta = {}
        if BRANCH_META_FILE.exists():
            meta = json.loads(BRANCH_META_FILE.read_text("utf-8"))
        meta[child_id] = {"parent_session_id": parent_id, "branch_point_message_id": msg_id}
        BRANCH_META_FILE.write_text(json.dumps(meta, indent=2), "utf-8")
    except Exception as e:
        print(f"Error saving branch meta: {e}")

def _load_branch_meta() -> dict[str, Any]:
    if BRANCH_META_FILE.exists():
        try: return json.loads(BRANCH_META_FILE.read_text("utf-8"))
        except Exception: pass
    return {}

def get_all_sessions(user_id: str | None = None) -> list[dict[str, Any]]:
    meta = _load_branch_meta()
    from supabase_client import supabase
    if supabase:
        try:
            query = supabase.table("chat_sessions").select("*")
            if user_id:
                query = query.eq("user_id", user_id)
            res = query.order("created_at", desc=True).execute()
            sessions = res.data if res.data else []
            for s in sessions:
                if s["id"] in meta:
                    s["parent_session_id"] = meta[s["id"]]["parent_session_id"]
                    s["branch_point_message_id"] = meta[s["id"]]["branch_point_message_id"]
                elif s.get("title", "").strip().startswith("🌿") or "cutting drum" in s.get("title", "").lower():
                    root_candidates = [r["id"] for r in sessions if not r.get("title", "").strip().startswith("🌿") and r["id"] != s["id"]]
                    if root_candidates:
                        s["parent_session_id"] = root_candidates[-1]
                        s["branch_point_message_id"] = "1"
                        _save_branch_meta(s["id"], root_candidates[-1], "1")
            return sessions
        except Exception as e:
            print(f"Error fetching sessions: {e}")
    return []


def create_branch(parent_session_id: str, branch_point_message_id: str, user_id: str | None, title: str) -> str:
    import uuid
    new_session_id = str(uuid.uuid4())
    _save_branch_meta(new_session_id, parent_session_id, str(branch_point_message_id))
    from supabase_client import supabase
    if supabase:
        try:
            payload = {
                "id": new_session_id,
                "user_id": user_id,
                "title": title,
                "parent_session_id": parent_session_id,
                "branch_point_message_id": str(branch_point_message_id)
            }
            try:
                payload["search_mode"] = "internal"
                supabase.table("chat_sessions").insert(payload).execute()
            except Exception:
                del payload["search_mode"]
        except Exception as e:
            try:
                fallback = {"id": new_session_id, "user_id": user_id, "title": title}
                supabase.table("chat_sessions").insert(fallback).execute()
            except Exception as e2:
                print(f"Error creating branch in DB: {e2}")
    return new_session_id


def append_to_history(session_id: str, role: str, content: str, user_id: str | None = None) -> None:
    import uuid
    msg_id = str(uuid.uuid4())
    SESSION_HISTORY.setdefault(session_id, []).append({"id": msg_id, "role": role, "content": content})
    from supabase_client import supabase
    if supabase and user_id:
        try:
            session_res = supabase.table("chat_sessions").select("id").eq("id", session_id).execute()
            if not session_res.data:
                title = (content[:40] + "...") if role == "user" else "New Chat"
                try:
                    supabase.table("chat_sessions").insert({"id": session_id, "user_id": user_id, "title": title, "search_mode": "internal"}).execute()
                except Exception:
                    supabase.table("chat_sessions").insert({"id": session_id, "user_id": user_id, "title": title}).execute()
                
            try:
                supabase.table("chat_messages").insert({
                    "id": msg_id,
                    "session_id": session_id,
                    "role": role,
                    "content": content
                }).execute()
            except Exception:
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

    max_score = max(item.get("score", 0.0) for item in results)
    if max_score <= 0.05:
        # RRF hybrid search scores (~0.01 to ~0.03). Top rank = ~0.0164
        conf = min(0.95, max_score * 56)
    else:
        conf = max_score

    bonus = min(0.04, len(results) * 0.01)
    return round(min(0.99, max(0.10, conf + bonus)), 3)


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
    """CRAG Grader: Validates that hybrid retrieval found non-empty context chunks."""
    return bool(context and context.strip())


def build_prompt(query: str, rewritten_query: str, context: str, history: list[dict[str, str]], intent: str, is_regenerate: bool = False) -> str:
    history_text = "\n".join(f"{item['role']}: {item['content']}" for item in history) or "No prior history."

    regen_directive = ""
    if is_regenerate:
        regen_directive = """
CRITICAL REGENERATION DIRECTIVE (MANDATORY FRESH PERSPECTIVE & NEW DIAGRAM):
The user explicitly clicked "Regenerate Fresh" because they want a COMPLETELY FRESH explanation and a BRAND NEW visual diagram layout!
1. Textual Explanation: Re-structure your answer completely. Use a fresh flow of ideas, different vocabulary, and emphasize deeper details or alternative angles from the Context. DO NOT repeat your previous wording.
2. Mermaid Flowchart Diagram: You MUST design a noticeably new visual layout! If TD (Top-Down) was used before, switch to LR (Left-Right) or regroup into distinct subgraphs. Re-arrange node connections, rename node labels with fresh descriptive text, and organize the diagram structure in a vibrant new way!
"""

    return f"""
You are an expert grounded documentation assistant for an enterprise knowledge management system.
Your goal is to answer the user's question using the facts and details in the supplied Context.
If the Context contains completely zero information related to the user's question topic, respond with exactly: I don't know
CRITICAL RULE: You are fully authorized to synthesize, summarize, structure, and draw diagrams/flowcharts based on the concepts described in the Context. Never output "I don't know" if the Context provides the conceptual facts needed to explain or visualize the topic.
Do not use outside knowledge.
Be concise, clear, and cite supporting sources inline like [Source 1].
Format your answer using markdown where appropriate (bold, lists, code blocks).

CRITICAL INSTRUCTION FOR ARCHITECTURE / WORKFLOW DIAGRAMS:
If the user asks for a structural breakdown, workflow, hierarchy, diagram, or architecture, you MUST provide BOTH:
1. A comprehensive, descriptive text explanation explaining the architecture/concept in thorough detail.
2. A visual flowchart diagram using Mermaid.js inside ```mermaid ... ``` code blocks.
MANDATORY MERMAID SYNTAX RULES (TO PREVENT RENDER CRASHES):
- Node IDs MUST be simple alphanumeric words without hyphens or special characters (e.g., use S1, L1, Cam1 instead of STRATUM-1 or Node-A).
- Node labels MUST be wrapped in double quotes inside brackets (e.g., S1["STRATUM-1 Engine"] --> L1["LiDAR and Camera Array"]).
- Never use unescaped '&' or symbols outside double quotes.
{regen_directive}
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


def generate_grounded_answer(query: str, rewritten_query: str, results: list[dict[str, Any]], session_id: str, model: str | None = None, skip_cache: bool = False) -> str:
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
        is_regenerate=skip_cache,
    )

    try:
        temp = 0.7 if skip_cache else 0.2
        response = get_llm_client().chat.completions.create(
            model=model or LLM_MODEL,
            temperature=temp,
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert grounded enterprise knowledge assistant. Your role is to answer the user's question using the facts in the supplied Context. You are fully authorized to synthesize, summarize, structure, and draw Mermaid flowcharts/diagrams based on the concepts in the Context. Only output 'I don't know' if the Context contains zero facts related to the question.",
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


def generate_answer_stream(query: str, rewritten_query: str, results: list[dict[str, Any]], session_id: str, model: str | None = None, skip_cache: bool = False):
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
        is_regenerate=skip_cache,
    )

    try:
        temp = 0.7 if skip_cache else 0.2
        stream = get_llm_client().chat.completions.create(
            model=model or LLM_MODEL,
            temperature=temp,
            stream=True,
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert grounded enterprise knowledge assistant. Your role is to answer the user's question using the facts in the supplied Context. You are fully authorized to synthesize, summarize, structure, and draw Mermaid flowcharts/diagrams based on the concepts in the Context. Only output 'I don't know' if the Context contains zero facts related to the question.",
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
    skip_cache: bool = False,
) -> dict[str, Any]:
    overall_start = _time.perf_counter()

    # Check Semantic Cache first
    from semantic_cache import semantic_answer_cache
    cached = None
    if not skip_cache:
        cached = semantic_answer_cache.get(
            query=query, mode=mode, domain=domain or "all", user_role=user_role,
            model_name=model or "", top_k=top_k
        )
    if cached is not None:
        elapsed = (_time.perf_counter() - overall_start) * 1000
        cached["cached"] = True
        cached["response_time_ms"] = round(elapsed, 1)
        append_to_history(session_id, "user", query, user_id=user_id)
        append_to_history(session_id, "assistant", cached.get("answer", ""), user_id=user_id)
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
    answer = generate_grounded_answer(query, rewritten_query, results, session_id, model=model, skip_cache=skip_cache)
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
    semantic_answer_cache.put(
        query=query, mode=mode, domain=domain or "all", user_role=user_role,
        model_name=model or "", top_k=top_k,
        value={k: v for k, v in response.items()}
    )

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
