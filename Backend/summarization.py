from __future__ import annotations

import os

from dotenv import load_dotenv
from groq import Groq

load_dotenv()

GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

_client: Groq | None = None


def _get_client() -> Groq:
    global _client
    if _client is None:
        if not GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY is missing. Add it to your .env file.")
        _client = Groq(api_key=GROQ_API_KEY)
    return _client


def generate_summary(text: str, max_chars: int = 3000) -> str:
    """Generate an executive summary of a document using the LLM."""
    truncated = text[:max_chars]
    try:
        response = _get_client().chat.completions.create(
            model=GROQ_MODEL,
            temperature=0.3,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an enterprise knowledge management assistant. "
                        "Generate a concise executive summary of the provided document. "
                        "Include: 1) Key topics covered 2) Main findings or content "
                        "3) A 2-3 sentence executive summary. Keep it under 200 words. "
                        "Use bullet points for key topics."
                    ),
                },
                {"role": "user", "content": f"Summarize this document:\n\n{truncated}"},
            ],
        )
        return (response.choices[0].message.content or "").strip()
    except Exception as exc:
        return f"Summary generation failed: {exc}"
