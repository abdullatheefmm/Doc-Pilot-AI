from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from supabase_client import supabase

DEFAULT_DOMAINS = [
    {"id": "engineering", "name": "Engineering", "color": "#3b82f6", "icon": "🏗️"},
    {"id": "hr", "name": "HR & Policy", "color": "#8b5cf6", "icon": "📋"},
    {"id": "finance", "name": "Finance", "color": "#22c55e", "icon": "💰"},
    {"id": "legal", "name": "Legal & Compliance", "color": "#ef4444", "icon": "⚖️"},
    {"id": "product", "name": "Product", "color": "#f97316", "icon": "📦"},
    {"id": "general", "name": "General", "color": "#64748b", "icon": "📁"},
]

def init_domains_db() -> None:
    pass

def list_domains() -> list[dict[str, Any]]:
    if not supabase: return DEFAULT_DOMAINS
    response = supabase.table("domains").select("*").order("name").execute()
    return response.data

def create_domain(domain_id: str, name: str, color: str = "#64748b", icon: str = "📁") -> dict[str, str]:
    data = {"id": domain_id, "name": name, "color": color, "icon": icon}
    if supabase:
        supabase.table("domains").upsert(data).execute()
    return data

def assign_document_domain(document_name: str, domain_id: str) -> None:
    if supabase:
        supabase.table("document_domains").upsert({
            "document_name": document_name, 
            "domain_id": domain_id
        }).execute()

def get_document_domain(document_name: str) -> str:
    if not supabase: return "general"
    response = supabase.table("document_domains").select("domain_id").eq("document_name", document_name).execute()
    return response.data[0]["domain_id"] if response.data else "general"

def get_all_document_domains() -> dict[str, str]:
    if not supabase: return {}
    response = supabase.table("document_domains").select("document_name, domain_id").execute()
    return {r["document_name"]: r["domain_id"] for r in response.data}

def delete_document_metadata(document_name: str) -> None:
    if supabase:
        stem = Path(document_name).stem
        supabase.table("document_domains").delete().ilike("document_name", f"{stem}%").execute()
        supabase.table("document_summaries").delete().ilike("document_name", f"{stem}%").execute()

def save_document_summary(document_name: str, summary: str) -> None:
    if supabase:
        supabase.table("document_summaries").upsert({
            "document_name": document_name, 
            "summary": summary,
            "created_at": datetime.now(timezone.utc).isoformat()
        }).execute()

def get_document_summary(document_name: str) -> str | None:
    if not supabase: return None
    response = supabase.table("document_summaries").select("summary").eq("document_name", document_name).execute()
    return response.data[0]["summary"] if response.data else None

def get_all_summaries() -> dict[str, str]:
    if not supabase: return {}
    response = supabase.table("document_summaries").select("document_name, summary").execute()
    return {r["document_name"]: r["summary"] for r in response.data}