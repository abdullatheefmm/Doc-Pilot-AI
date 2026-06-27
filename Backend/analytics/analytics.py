from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any
import sys
from pathlib import Path
_core_path = str(Path(__file__).resolve().parent.parent / "core")
if _core_path not in sys.path:
    sys.path.insert(0, _core_path)

from supabase_client import supabase

def init_analytics_db() -> None:
    pass


# ─── Generic Audit Event Logger ──────────────────────────────────────────────

def log_audit_event(
    action_type: str,
    user_id: str | None = None,
    domain: str | None = None,
    details: dict | None = None,
) -> None:
    """
    Log any action to the audit_logs table.
    Supported action_types:
      - chat_query           : Regular chat query (visible user-side)
      - upload_document      : File uploaded
      - delete_document      : File deleted
      - login                : User logged in
      - logout               : User logged out
      - knowledge_graph_view : Knowledge graph opened
      - document_view        : A document was previewed/accessed
      - knowledge_base_view  : Knowledge base panel opened
    """
    if not supabase:
        return
    try:
        d = details or {}
        if domain:
            d["domain"] = domain

        supabase.table("audit_logs").insert({
            "action_type": action_type,
            "user_id": user_id,
            "details": d,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as e:
        print(f"[Audit] Failed to log '{action_type}': {e}")


# ─── Chat Query Logger ────────────────────────────────────────────────────────

def log_query(
    query: str,
    answer: str = "",
    confidence: float = 0,
    response_time_ms: float = 0,
    sources: list[str] | None = None,
    domain: str | None = None,
    intent: str = "",
    cached: bool = False,
    session_id: str = "",
    user_id: str | None = None,
) -> None:
    """
    Logs a chat query.
    """
    if not supabase:
        return

    action_type = "chat_query"

    try:
        # Always log to audit_logs (admin-visible)
        supabase.table("audit_logs").insert({
            "action_type": action_type,
            "user_id": user_id,
            "details": {
                "domain": domain or "",
                "query": query,
                "tokens_used": len(answer) // 4,
                "confidence": confidence,
                "cache_hit": cached,
                "retrieved_docs": sources or [],
                "intent": intent,
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as e:
        print(f"[Audit] Failed to log {action_type}: {e}")

    try:
        supabase.table("query_log").insert({
            "user_id": user_id,
            "query": query,
            "answer": answer,
            "confidence": confidence,
            "response_time_ms": response_time_ms,
            "sources": sources or [],
            "domain": domain or "",
            "intent": intent,
            "cached": cached,
            "session_id": session_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        }).execute()
    except Exception as e:
        print(f"[Audit] Failed to log query_log: {e}")


# ─── Dashboard Data ───────────────────────────────────────────────────────────

def get_dashboard_data() -> dict[str, Any]:
    if not supabase:
        return {
            "total_queries": 0, "avg_confidence": 0.0, "avg_response_time_ms": 0.0,
            "cache_hit_rate": 0.0, "confidence_distribution": [], "query_volume": [],
            "top_documents": [], "knowledge_gaps": [], "domain_distribution": [],
            "feedback": {"helpful": 0, "not_helpful": 0}, "response_times": []
        }

    # Fetch last 1000 queries for dashboard to compute stats in Python
    resp = supabase.table("query_log").select("*").order("created_at", desc=True).limit(1000).execute()
    logs = resp.data
    
    total_fetched = len(logs)
    if total_fetched == 0:
        return {
            "total_queries": 0, "avg_confidence": 0.0, "avg_response_time_ms": 0.0,
            "cache_hit_rate": 0.0, "confidence_distribution": [], "query_volume": [],
            "top_documents": [], "knowledge_gaps": [], "domain_distribution": [],
            "feedback": {"helpful": 0, "not_helpful": 0}, "response_times": []
        }

    avg_conf = sum(l.get("confidence", 0) for l in logs) / total_fetched
    avg_time = sum(l.get("response_time_ms", 0) for l in logs) / total_fetched
    cache_hits = sum(1 for l in logs if l.get("cached"))

    conf_buckets = [{"label": "0-25%", "count": 0}, {"label": "25-50%", "count": 0}, 
                    {"label": "50-75%", "count": 0}, {"label": "75-100%", "count": 0}]
    for l in logs:
        c = l.get("confidence", 0)
        if c < 0.25: conf_buckets[0]["count"] += 1
        elif c < 0.5: conf_buckets[1]["count"] += 1
        elif c < 0.75: conf_buckets[2]["count"] += 1
        else: conf_buckets[3]["count"] += 1

    now = datetime.now(timezone.utc)
    volume_map = {}
    for i in range(24):
        hour_start = (now - timedelta(hours=23 - i)).replace(minute=0, second=0, microsecond=0)
        volume_map[hour_start.strftime("%H:%M")] = 0
    
    for l in logs:
        try:
            dt = datetime.fromisoformat(l.get("created_at").replace('Z', '+00:00'))
            hour_str = dt.replace(minute=0, second=0, microsecond=0).strftime("%H:%M")
            if hour_str in volume_map:
                volume_map[hour_str] += 1
        except Exception:
            pass
    volume = [{"hour": k, "count": v} for k, v in volume_map.items()]

    doc_counts: dict[str, int] = {}
    for l in logs:
        srcs = l.get("sources", [])
        if isinstance(srcs, str):
            try: srcs = json.loads(srcs)
            except: srcs = []
        for doc in srcs:
            doc_counts[doc] = doc_counts.get(doc, 0) + 1
    top_docs = sorted(doc_counts.items(), key=lambda x: -x[1])[:10]
    top_docs_list = [{"document": d, "count": c} for d, c in top_docs]

    gaps = [l for l in logs if l.get("confidence", 0) < 0.5][:10]
    knowledge_gaps = [{"query": g["query"], "confidence": g["confidence"], "created_at": g["created_at"]} for g in gaps]

    domain_counts = {}
    for l in logs:
        d = l.get("domain")
        if d: domain_counts[d] = domain_counts.get(d, 0) + 1
    domain_dist = [{"domain": k, "count": v} for k, v in sorted(domain_counts.items(), key=lambda x: -x[1])]

    fb_resp = supabase.table("feedback").select("helpful").execute()
    helpful = sum(1 for f in fb_resp.data if f.get("helpful"))
    not_helpful = sum(1 for f in fb_resp.data if not f.get("helpful"))

    response_times = [{"time_ms": l["response_time_ms"], "at": l["created_at"]} for l in reversed(logs[:20])]

    count_resp = supabase.table("query_log").select("*", count="exact").limit(1).execute()
    real_total = count_resp.count if count_resp.count is not None else total_fetched

    return {
        "total_queries": real_total,
        "avg_confidence": round(avg_conf, 3),
        "avg_response_time_ms": round(avg_time, 1),
        "cache_hit_rate": round(cache_hits / real_total, 3) if real_total > 0 else 0,
        "confidence_distribution": conf_buckets,
        "query_volume": volume,
        "top_documents": top_docs_list,
        "knowledge_gaps": knowledge_gaps,
        "domain_distribution": domain_dist,
        "feedback": {"helpful": helpful, "not_helpful": not_helpful},
        "response_times": response_times,
    }

def get_document_access_counts() -> dict[str, int]:
    if not supabase: return {}
    try:
        resp = supabase.table("query_log").select("sources").execute()
        doc_counts = {}
        for l in resp.data:
            srcs = l.get("sources", [])
            if isinstance(srcs, str):
                try: srcs = json.loads(srcs)
                except: srcs = []
            for doc in srcs:
                doc_counts[doc] = doc_counts.get(doc, 0) + 1
        return doc_counts
    except Exception:
        return {}
