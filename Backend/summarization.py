from __future__ import annotations

import os

from llm_client import get_llm_client, LLM_MODEL


def generate_summary(text: str, max_chars: int = 3000) -> str:
    """Generate an executive summary of a document using the LLM."""
    truncated = text[:max_chars]
    try:
        response = get_llm_client().chat.completions.create(
            model=LLM_MODEL,
            temperature=0.3,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an enterprise knowledge management assistant. "
                        "Provide a brief, concise 2-3 sentence summary of the provided document. "
                        "Do not use bullet points, headings, or lists. Just write a single short paragraph "
                        "that perfectly captures the core essence of the document."
                    ),
                },
                {"role": "user", "content": f"Summarize this document:\n\n{truncated}"},
            ],
        )
        return (response.choices[0].message.content or "").strip()
    except Exception as exc:
        return f"Summary generation failed: {exc}"

def generate_trust_score(text: str) -> int:
    """Analyze the text and return an AI confidence/trustworthiness score (0-100)."""
    truncated = text[:3000]
    try:
        response = get_llm_client().chat.completions.create(
            model=LLM_MODEL,
            temperature=0.1,
            messages=[
                {
                    "role": "system",
                    "content": "You are a document analyzer. Evaluate the document's structure, clarity, and professional tone. Return ONLY a single integer between 0 and 100 representing its trustworthiness score. Do not include any other text."
                },
                {"role": "user", "content": f"Evaluate this document:\n\n{truncated}"},
            ],
        )
        score_str = response.choices[0].message.content.strip()
        return int(score_str)
    except Exception:
        return 85
