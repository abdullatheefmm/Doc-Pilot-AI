import base64
from fastapi import HTTPException
from llm_client import get_llm_client

def process_image(image_bytes: bytes, query: str) -> str:
    """
    Uses a Vision model (e.g. gpt-4o) to analyze an image/diagram.
    """
    client = get_llm_client()
    base64_image = base64.b64encode(image_bytes).decode('utf-8')
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o",  # Vision capable model
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": f"Analyze this image and answer the question: {query}"},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=500,
        )
        return response.choices[0].message.content
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vision Agent failed: {e}")
