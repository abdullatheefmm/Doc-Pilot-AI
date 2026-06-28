"""
Enterprise Data Loss Prevention (DLP) Module
Scans and redacts PII/secrets before indexing into the vector database.
"""
from __future__ import annotations

import re
from typing import Any

# --- PII Pattern Registry ---
PII_PATTERNS: dict[str, str] = {
    "SSN":             r"\b\d{3}-\d{2}-\d{4}\b",
    "CREDIT_CARD":     r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b",
    "PHONE":           r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b",
    "EMAIL":           r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,7}\b",
    "IBAN":            r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b",
    "ROUTING_NUMBER":  r"\b\d{9}\b",
    "IPV4":            r"\b(?:\d{1,3}\.){3}\d{1,3}\b",
    "OPENAI_KEY":      r"\bsk-[A-Za-z0-9]{32,}\b",
    "AWS_ACCESS_KEY":  r"\bAKIA[0-9A-Z]{16}\b",
    "GITHUB_TOKEN":    r"\bghp_[A-Za-z0-9]{36}\b",
    "GENERIC_SECRET":  r"(?i)(?:api[_\-]?key|secret[_\-]?key|access[_\-]?token)\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{16,}['\"]?",
    "PRIVATE_KEY":     r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
}


def redact_pii(text: str) -> str:
    """Simple redaction - replaces all PII matches. Returns sanitized text."""
    redacted = text
    for label, pattern in PII_PATTERNS.items():
        redacted = re.sub(pattern, f"[REDACTED_{label}]", redacted, flags=re.IGNORECASE)
    return redacted


def scan_and_redact_pii(text: str) -> tuple[str, list[dict[str, Any]]]:
    """
    Enterprise DLP: Scan text for PII/secrets, redact them, and return
    both the sanitized text AND a structured summary of what was found.

    Returns:
        (sanitized_text, redactions)
        where redactions = [{"type": "SSN", "count": 3}, ...]
    """
    redacted = text
    redactions: list[dict[str, Any]] = []

    for label, pattern in PII_PATTERNS.items():
        matches = re.findall(pattern, redacted, flags=re.IGNORECASE)
        if matches:
            redactions.append({"type": label, "count": len(matches)})
            redacted = re.sub(pattern, f"[REDACTED_{label}]", redacted, flags=re.IGNORECASE)

    return redacted, redactions
