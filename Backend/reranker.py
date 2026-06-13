import os
import requests
from dotenv import load_dotenv

load_dotenv()

def rerank_chunks(query: str, chunks: list[dict], top_n: int = 5) -> list[dict]:
    """
    Reranks a list of retrieved chunks against the user query using the Cohere API.
    Each chunk must be a dict containing a 'text' key.
    Returns the top_n most relevant chunks.
    """
    api_key = os.getenv("COHERE_API_KEY")
    if not chunks:
        return []
    
    # If the API key is missing or not configured, gracefully fallback to the original top chunks
    if not api_key:
        print("WARNING: COHERE_API_KEY not found. Skipping neural re-ranking.")
        return chunks[:top_n]
        
    try:
        documents = [chunk["text"] for chunk in chunks]
        
        headers = {
            "accept": "application/json",
            "content-type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
        
        payload = {
            "model": "rerank-english-v3.0",
            "query": query,
            "documents": documents,
            "top_n": top_n
        }
        
        # Send request to Cohere
        response = requests.post("https://api.cohere.com/v1/rerank", json=payload, headers=headers, timeout=10)
        
        if response.status_code == 200:
            results = response.json().get("results", [])
            reranked_chunks = []
            for res in results:
                original_index = res["index"]
                chunk = chunks[original_index]
                # Inject the high-precision relevance score
                chunk["relevance_score"] = res["relevance_score"]
                reranked_chunks.append(chunk)
            
            print(f"Successfully reranked {len(chunks)} chunks down to top {top_n}")
            return reranked_chunks
        else:
            print(f"Cohere Rerank failed (Status {response.status_code}): {response.text}")
            return chunks[:top_n]
            
    except Exception as e:
        print(f"Error during Cohere reranking: {e}")
        return chunks[:top_n]
