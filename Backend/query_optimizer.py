import json
import logging
from openai import OpenAI
from llm_client import get_llm_client, LLM_MODEL

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
You are a Query Optimization Agent for an Enterprise RAG system.
Your goal is to take a user's raw query and a chat history, and rewrite the query to be highly specific, standalone, and optimized for vector search (FAISS).

Rules:
1. Resolve any pronouns (it, that, he, she, this) using the chat history.
2. Expand the query with relevant industry synonyms to improve retrieval (e.g., "vacation" -> "vacation OR PTO OR paid time off").
3. Do NOT answer the question. Only output the optimized query string.
4. Keep it concise but dense with keywords.
5. If the raw query is already perfect and standalone, return it as is.
"""

def optimize_query(raw_query: str, chat_history: list[dict[str, str]]) -> str:
    if not chat_history and len(raw_query.split()) > 5:
        # If it's a long initial query with no history, minimal optimization needed
        return raw_query

    history_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in chat_history[-4:]])
    
    prompt = f"""
Chat History:
{history_text or 'None'}

Raw Query: {raw_query}

Rewrite the raw query into a single optimized search string:
"""
    try:
        client = get_llm_client()
        response = client.chat.completions.create(
            model=LLM_MODEL,
            temperature=0.1,
            max_tokens=100,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ]
        )
        optimized = response.choices[0].message.content.strip()
        # Remove quotes if the LLM wrapped it
        if optimized.startswith('"') and optimized.endswith('"'):
            optimized = optimized[1:-1]
        
        # Log for MLOps
        logger.info(f"[Query Optimizer] Raw: '{raw_query}' -> Optimized: '{optimized}'")
        return optimized
    except Exception as e:
        logger.error(f"[Query Optimizer] Failed to optimize query: {e}")
        return raw_query  # Fallback to raw query on failure
