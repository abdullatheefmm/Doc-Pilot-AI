from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

DB_PATH = Path("data/analytics.db")


def init_analytics_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS query_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query TEXT NOT NULL,
                answer TEXT,
                confidence REAL,
                response_time_ms REAL,
                sources TEXT,
                domain TEXT,
                intent TEXT,
                cached INTEGER DEFAULT 0,
                session_id TEXT,
                created_at TEXT NOT NULL
            )
        """)
        conn.commit()


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
) -> None:
    init_analytics_db()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """INSERT INTO query_log
               (query, answer, confidence, response_time_ms, sources, domain, intent, cached, session_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                query,
                answer,
                confidence,
                response_time_ms,
                json.dumps(sources or []),
                domain or "",
                intent,
                int(cached),
                session_id,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        conn.commit()


def get_dashboard_data() -> dict[str, Any]:
    init_analytics_db()
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row

        total = conn.execute("SELECT COUNT(*) as c FROM query_log").fetchone()["c"]
        avg_conf = conn.execute("SELECT AVG(confidence) as a FROM query_log").fetchone()["a"] or 0
        avg_time = conn.execute("SELECT AVG(response_time_ms) as a FROM query_log").fetchone()["a"] or 0
        cache_hits = conn.execute("SELECT COUNT(*) as c FROM query_log WHERE cached = 1").fetchone()["c"]

        # Confidence distribution
        conf_buckets = []
        for lo, hi, label in [(0, 0.25, "0-25%"), (0.25, 0.5, "25-50%"), (0.5, 0.75, "50-75%"), (0.75, 1.01, "75-100%")]:
            count = conn.execute(
                "SELECT COUNT(*) as c FROM query_log WHERE confidence >= ? AND confidence < ?", (lo, hi)
            ).fetchone()["c"]
            conf_buckets.append({"label": label, "count": count})

        # Query volume by hour (last 24h)
        now = datetime.now(timezone.utc)
        volume = []
        for i in range(24):
            hour_start = (now - timedelta(hours=23 - i)).replace(minute=0, second=0, microsecond=0)
            hour_end = hour_start + timedelta(hours=1)
            count = conn.execute(
                "SELECT COUNT(*) as c FROM query_log WHERE created_at >= ? AND created_at < ?",
                (hour_start.isoformat(), hour_end.isoformat()),
            ).fetchone()["c"]
            volume.append({"hour": hour_start.strftime("%H:%M"), "count": count})

        # Top documents
        rows = conn.execute("SELECT sources FROM query_log WHERE sources != '[]'").fetchall()
        doc_counts: dict[str, int] = {}
        for row in rows:
            try:
                for doc in json.loads(row["sources"]):
                    doc_counts[doc] = doc_counts.get(doc, 0) + 1
            except (json.JSONDecodeError, TypeError):
                pass
        top_docs = sorted(doc_counts.items(), key=lambda x: -x[1])[:10]
        top_docs_list = [{"document": d, "count": c} for d, c in top_docs]

        # Knowledge gaps (low-confidence queries)
        gaps = conn.execute(
            "SELECT query, confidence, created_at FROM query_log WHERE confidence < 0.5 ORDER BY created_at DESC LIMIT 10"
        ).fetchall()
        knowledge_gaps = [dict(g) for g in gaps]

        # Domain distribution
        domain_rows = conn.execute(
            "SELECT domain, COUNT(*) as c FROM query_log WHERE domain IS NOT NULL AND domain != '' GROUP BY domain ORDER BY c DESC"
        ).fetchall()
        domain_dist = [{"domain": r["domain"], "count": r["c"]} for r in domain_rows]

        # Feedback stats
        from pathlib import Path as _P
        fb_path = _P("data/feedback.db")
        helpful = 0
        not_helpful = 0
        if fb_path.exists():
            with sqlite3.connect(fb_path) as fb_conn:
                helpful = fb_conn.execute("SELECT COUNT(*) FROM feedback WHERE helpful = 1").fetchone()[0]
                not_helpful = fb_conn.execute("SELECT COUNT(*) FROM feedback WHERE helpful = 0").fetchone()[0]

        # Response time trend
        time_rows = conn.execute(
            "SELECT response_time_ms, created_at FROM query_log ORDER BY id DESC LIMIT 20"
        ).fetchall()
        response_times = [{"time_ms": r["response_time_ms"], "at": r["created_at"]} for r in reversed(list(time_rows))]

    return {
        "total_queries": total,
        "avg_confidence": round(avg_conf, 3),
        "avg_response_time_ms": round(avg_time, 1),
        "cache_hit_rate": round(cache_hits / total, 3) if total > 0 else 0,
        "confidence_distribution": conf_buckets,
        "query_volume": volume,
        "top_documents": top_docs_list,
        "knowledge_gaps": knowledge_gaps,
        "domain_distribution": domain_dist,
        "feedback": {"helpful": helpful, "not_helpful": not_helpful},
        "response_times": response_times,
    }
