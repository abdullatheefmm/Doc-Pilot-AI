import sqlite3
import os
from pathlib import Path

DB_PATH = Path("data/trust_metrics.db")

def init_trust_db():
    if not DB_PATH.parent.exists():
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS document_trust (
                document_name TEXT PRIMARY KEY,
                upvotes INTEGER DEFAULT 0,
                downvotes INTEGER DEFAULT 0,
                ai_score INTEGER DEFAULT 85
            )
        """)

def get_trust_metrics(document_name: str) -> dict:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM document_trust WHERE document_name = ?", (document_name,)).fetchone()
        if row:
            return dict(row)
        else:
            return {"document_name": document_name, "upvotes": 0, "downvotes": 0, "ai_score": 85}

def get_all_trust_metrics() -> dict[str, dict]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT * FROM document_trust").fetchall()
        return {r["document_name"]: dict(r) for r in rows}

def save_ai_score(document_name: str, score: int):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            INSERT INTO document_trust (document_name, ai_score) 
            VALUES (?, ?)
            ON CONFLICT(document_name) DO UPDATE SET ai_score=excluded.ai_score
        """, (document_name, score))

def vote_document(document_name: str, vote_type: str):
    with sqlite3.connect(DB_PATH) as conn:
        if vote_type == "up":
            conn.execute("""
                INSERT INTO document_trust (document_name, upvotes) 
                VALUES (?, 1)
                ON CONFLICT(document_name) DO UPDATE SET upvotes=upvotes+1
            """, (document_name,))
        elif vote_type == "down":
            conn.execute("""
                INSERT INTO document_trust (document_name, downvotes) 
                VALUES (?, 1)
                ON CONFLICT(document_name) DO UPDATE SET downvotes=downvotes+1
            """, (document_name,))

init_trust_db()
