import json
import threading
from typing import Any
from supabase_client import supabase
from llm_client import get_llm_client, LLM_MODEL

def fetch_user_memory(user_id: str) -> list[str]:
    """Retrieve all stored facts for a given user."""
    if not supabase: return []
    try:
        resp = supabase.table("user_memories").select("fact").eq("user_id", user_id).execute()
        return [item["fact"] for item in resp.data]
    except Exception as e:
        print(f"Error fetching memory: {e}")
        return []

def store_user_memory(user_id: str, fact: str) -> None:
    """Store a new fact in the user's memory."""
    if not supabase: return
    try:
        supabase.table("user_memories").insert({"user_id": user_id, "fact": fact}).execute()
    except Exception as e:
        print(f"Error storing memory: {e}")

def _extract_and_store_memory_sync(user_id: str, query: str, answer: str) -> None:
    """Uses LLM to extract long-term facts from the current interaction and stores them."""
    system_prompt = """
You are a Memory Extraction Agent.
Your job is to read the latest interaction between the User and the AI Assistant.
Extract any personal facts, preferences, or roles about the User that should be remembered for future sessions.
DO NOT extract transient facts (e.g., "The user asked about X").
ONLY extract persistent facts (e.g., "The user is a frontend developer", "The user prefers Python code examples", "The user's project is called DocPilot").

Return the output purely as a JSON list of strings representing the facts. If there are no persistent facts to remember, return an empty list [].
"""
    prompt = f"User said: {query}\n\nAssistant replied: {answer}"
    
    try:
        client = get_llm_client()
        response = client.chat.completions.create(
            model=LLM_MODEL,
            temperature=0.1,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ]
        )
        
        content = response.choices[0].message.content
        data = json.loads(content)
        
        # Sometimes the LLM wraps it in a dict e.g. {"facts": ["fact 1"]}
        facts = []
        if isinstance(data, list):
            facts = data
        elif isinstance(data, dict):
            for key, value in data.items():
                if isinstance(value, list):
                    facts.extend(value)
                    
        for fact in facts:
            if isinstance(fact, str) and len(fact.strip()) > 0:
                store_user_memory(user_id, fact.strip())
                
    except Exception as e:
        print(f"Memory extraction failed: {e}")

def extract_and_store_memory_async(user_id: str, query: str, answer: str) -> None:
    """Triggers memory extraction in a background thread to prevent blocking the main response."""
    thread = threading.Thread(target=_extract_and_store_memory_sync, args=(user_id, query, answer))
    thread.daemon = True
    thread.start()
