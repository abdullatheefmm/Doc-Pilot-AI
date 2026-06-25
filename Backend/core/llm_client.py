import os
from openai import OpenAI
from dotenv import load_dotenv
import base64

load_dotenv()

# We use OpenRouter as our universal API gateway
LLM_API_KEY = os.getenv("OPENROUTER_API_KEY", os.getenv("GROQ_API_KEY", ""))
LLM_MODEL = os.getenv("LLM_MODEL", "meta-llama/llama-3.3-70b-instruct")

def get_llm_client():
    # Use OpenRouter endpoint
    return OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=LLM_API_KEY,
    )

def generate_completion(messages: list[dict], max_tokens: int = 1000):
    client = get_llm_client()
    response = client.chat.completions.create(
        model=LLM_MODEL,
        messages=messages,
        max_tokens=max_tokens,
        temperature=0.2
    )
    return response.choices[0].message.content

def describe_image_with_vision(image_bytes: bytes, mime_type: str = "image/jpeg") -> str:
    """Uses OpenRouter Vision model to describe an image."""
    try:
        client = get_llm_client()
        base64_img = base64.b64encode(image_bytes).decode('utf-8')
        
        response = client.chat.completions.create(
            # Using a reliable vision model via openrouter
            model="meta-llama/llama-3.2-11b-vision-instruct:free",
            temperature=0.2,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Describe the contents of this image in detail. If there is text, transcribe it. If it is a chart, explain the data."},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{base64_img}"
                            }
                        }
                    ]
                }
            ]
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"Vision extraction failed: {e}")
        return ""

# Trigger reload
