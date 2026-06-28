"""
Enterprise Security Module - Prompt Injection Shield
Pre-scans retrieved document chunks for hidden malicious override instructions
before they are passed to the LLM, preventing indirect prompt injection attacks.
"""
from __future__ import annotations

import re

# Known jailbreak / prompt-injection attack patterns
INJECTION_PATTERNS: list[str] = [
    r"ignore\s+(all\s+)?previous\s+instructions",
    r"disregard\s+(all\s+)?previous\s+instructions",
    r"forget\s+your\s+(previous\s+)?instructions",
    r"system\s*prompt\s*(override|bypass|injection)",
    r"you\s+are\s+now\s+a\s+(rogue|different|new|evil|hacker)",
    r"act\s+as\s+if\s+you\s+(have\s+no|ignore)",
    r"do\s+not\s+follow\s+your\s+(previous\s+)?instructions",
    r"reveal\s+(all\s+)?(admin|system|secret|password|api\s*key)",
    r"print\s+(all\s+)?(admin|passwords|api\s*keys|secrets)",
    r"bypass\s+(safety|filter|guardrail|restriction)",
    r"jailbreak",
    r"dan\s+mode",
    r"developer\s+mode",
    r"output\s+all\s+(internal|confidential|secret|private)",
    r"show\s+me\s+(all\s+)?(admin|internal|confidential|secret)\s+(data|passwords|keys)",
]

_COMPILED = [re.compile(p, re.IGNORECASE | re.DOTALL) for p in INJECTION_PATTERNS]


def detect_prompt_injection(chunks: list[str]) -> tuple[bool, list[str]]:
    """
    Scan a list of retrieved text chunks for prompt injection attack patterns.

    Returns:
        (detected: bool, matched_patterns: list[str])
        If detected=True the LLM call must be blocked and an alert raised.
    """
    matched: list[str] = []
    for chunk in chunks:
        for pattern in _COMPILED:
            if pattern.search(chunk):
                matched.append(pattern.pattern)
    return bool(matched), matched


INJECTION_BLOCKED_RESPONSE = (
    "**[SECURITY GUARDRAIL] Prompt Injection Detected**\n\n"
    "One or more retrieved documents contain instructions attempting to override "
    "the AI system's behaviour. This request has been **blocked** for your safety. "
    "The incident has been logged and reported to the administrator."
)
