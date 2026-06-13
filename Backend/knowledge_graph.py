import json
from llm_client import get_llm_client, LLM_MODEL

def extract_entities_and_relationships(text: str) -> dict:
    """
    Uses LLM to extract a knowledge graph from text.
    Returns a dict with 'nodes' and 'edges'.
    """
    client = get_llm_client()
    system_prompt = """
You are a Knowledge Graph extraction engine.
Given the following text, extract key entities (nodes) and their relationships (edges).
Output ONLY valid JSON in the following format:
{
  "nodes": [{"id": "Entity1", "label": "Concept/Person/System"}],
  "edges": [{"source": "Entity1", "target": "Entity2", "label": "Relationship"}]
}
"""
    try:
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text[:4000]} # Limit text length
            ],
            response_format={ "type": "json_object" }
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"Graph extraction failed: {e}")
        return {"nodes": [], "edges": []}
