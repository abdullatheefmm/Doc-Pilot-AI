from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import sqlite3

DB_PATH = Path("data/domains.db")

DEFAULT_DOMAINS = [
    {"id": "engineering", "name": "Engineering", "color": "#3b82f6", "icon": "🏗️"},
    {"id": "hr", "name": "HR & Policy", "color": "#8b5cf6", "icon": "📋"},
    {"id": "finance", "name": "Finance", "color": "#22c55e", "icon": "💰"},
    {"id": "legal", "name": "Legal & Compliance", "color": "#ef4444", "icon": "⚖️"},
    {"id": "product", "name": "Product", "color": "#f97316", "icon": "📦"},
    {"id": "general", "name": "General", "color": "#64748b", "icon": "📁"},
]


def init_domains_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS domains (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                color TEXT DEFAULT '#64748b',
                icon TEXT DEFAULT '📁'
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS document_domains (
                document_name TEXT PRIMARY KEY,
                domain_id TEXT NOT NULL,
                FOREIGN KEY (domain_id) REFERENCES domains(id)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS document_summaries (
                document_name TEXT PRIMARY KEY,
                summary TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        for d in DEFAULT_DOMAINS:
            conn.execute(
                "INSERT OR IGNORE INTO domains (id, name, color, icon) VALUES (?, ?, ?, ?)",
                (d["id"], d["name"], d["color"], d["icon"]),
            )
        conn.commit()


def list_domains() -> list[dict[str, Any]]:
    init_domains_db()
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT id, name, color, icon FROM domains ORDER BY name").fetchall()
    return [dict(r) for r in rows]


def create_domain(domain_id: str, name: str, color: str = "#64748b", icon: str = "📁") -> dict[str, str]:
    init_domains_db()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO domains (id, name, color, icon) VALUES (?, ?, ?, ?)",
            (domain_id, name, color, icon),
        )
        conn.commit()
    return {"id": domain_id, "name": name, "color": color, "icon": icon}


def assign_document_domain(document_name: str, domain_id: str) -> None:
    init_domains_db()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO document_domains (document_name, domain_id) VALUES (?, ?)",
            (document_name, domain_id),
        )
        conn.commit()


def get_document_domain(document_name: str) -> str:
    init_domains_db()
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute(
            "SELECT domain_id FROM document_domains WHERE document_name = ?",
            (document_name,),
        ).fetchone()
    return row[0] if row else "general"


def get_all_document_domains() -> dict[str, str]:
    init_domains_db()
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute("SELECT document_name, domain_id FROM document_domains").fetchall()
    return {r[0]: r[1] for r in rows}


def save_document_summary(document_name: str, summary: str) -> None:
    init_domains_db()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO document_summaries (document_name, summary, created_at) VALUES (?, ?, ?)",
            (document_name, summary, datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()


def get_document_summary(document_name: str) -> str | None:
    init_domains_db()
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute(
            "SELECT summary FROM document_summaries WHERE document_name = ?",
            (document_name,),
        ).fetchone()
    return row[0] if row else None


def get_all_summaries() -> dict[str, str]:
    init_domains_db()
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute("SELECT document_name, summary FROM document_summaries").fetchall()
    return {r[0]: r[1] for r in rows}