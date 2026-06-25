import json
from typing import Any
from openai import OpenAI
from llm_client import get_llm_client, LLM_MODEL
from retrieval import retrieve
from rag_qa import build_context, build_history_window

def search_knowledge_base(query: str, user_id: str, user_role: str, domain: str = "all") -> str:
    """Tool function to search the vector database for documentation."""
    hits, _ = retrieve(query=query, user_id=user_id, user_role=user_role, top_k=4, mode="hybrid", domain=domain)
    if not hits:
        return "No relevant documentation found in the knowledge base."
    return build_context(hits)

def run_agentic_rag(query: str, session_id: str, user_id: str, user_role: str, domain: str | None = None) -> dict[str, Any]:
    """Runs a tool-calling agent to answer the user's query."""
    client = get_llm_client()
    
    tools = [
        {
            "type": "function",
            "function": {
                "name": "search_knowledge_base",
                "description": "Search the internal documentation and knowledge base for answers. Use this whenever the user asks about internal procedures, technical documentation, or uploaded files.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "search_query": {"type": "string", "description": "The exact query to search the knowledge base."}
                    },
                    "required": ["search_query"],
                },
            },
        }
    ]

    history = build_history_window(session_id)
    from memory_agent import fetch_user_memory
    user_memories = fetch_user_memory(user_id)
    memory_context = ""
    if user_memories:
        memory_context = "Here are some personal facts you know about the user:\\n- " + "\\n- ".join(user_memories) + "\\n\\n"
        
    messages = [{"role": "system", "content": f"You are a helpful Enterprise AI Assistant. You have tools available. {memory_context}If a question is about internal documentation or company knowledge, you MUST use the search_knowledge_base tool to find the answer. Do not guess."}]
    
    for h in history:
        messages.append({"role": h["role"], "content": h["content"]})
        
    messages.append({"role": "user", "content": query})

    try:
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=messages,
            tools=tools,
            tool_choice="auto",
            temperature=0.1
        )
    except Exception as e:
        return {"answer": f"Agent Error: {e}", "sources": []}

    response_message = response.choices[0].message
    tool_calls = response_message.tool_calls

    used_sources = []
    
    if tool_calls:
        messages.append(response_message)
        for tool_call in tool_calls:
            if tool_call.function.name == "search_knowledge_base":
                args = json.loads(tool_call.function.arguments)
                search_query = args.get("search_query", query)
                
                # Fetch context
                hits, _ = retrieve(query=search_query, user_id=user_id, user_role=user_role, top_k=4, mode="hybrid", domain=domain)
                
                if hits:
                    context_str = build_context(hits)
                    used_sources = [{"document": h["document"], "text": h["snippet"]} for h in hits]
                else:
                    context_str = "No relevant documentation found."
                    
                messages.append({
                    "tool_call_id": tool_call.id,
                    "role": "tool",
                    "name": "search_knowledge_base",
                    "content": context_str
                })

        # Get final response from agent
        try:
            final_response = client.chat.completions.create(
                model=LLM_MODEL,
                messages=messages,
                temperature=0.2
            )
            final_answer = final_response.choices[0].message.content
        except Exception as e:
            final_answer = f"Agent Generation Error: {e}"
    else:
        # No tool called
        final_answer = response_message.content

    return {
        "answer": final_answer or "I don't know.",
        "sources": used_sources,
        "confidence": 0.9 if used_sources else 0.5,
        "session_id": session_id,
        "rewritten_query": query,
        "intent": "agent",
        "cached": False,
        "response_time_ms": 0,
        "timing": {},
        "retrieval_scores": [],
        "domain": domain or "all"
    }
