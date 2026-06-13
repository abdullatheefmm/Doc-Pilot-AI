import re

# Advanced regex-based PII redaction for Zero-Trust DLP
PII_PATTERNS = {
    "SSN": r"\b\d{3}-\d{2}-\d{4}\b",
    "CREDIT_CARD": r"\b(?:\d[ -]*?){13,16}\b", 
    "PHONE": r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b",
    "EMAIL": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b",
    "IBAN": r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b", # European Bank Accounts
    "HIPAA_ID": r"\b[A-Z0-9]{3}-[A-Z0-9]{4}-[A-Z0-9]{4}\b", # Example Medical ID Format
    "ROUTING_NUMBER": r"\b\d{9}\b", # US Bank Routing Numbers
    "IPV4": r"\b(?:\d{1,3}\.){3}\d{1,3}\b",
}

def redact_pii(text: str) -> str:
    redacted_text = text
    for pii_type, pattern in PII_PATTERNS.items():
        # Using a lambda to avoid replacing matched spaces/hyphens with exactly the pattern string
        # Actually, simpler to just replace the whole match
        redacted_text = re.sub(pattern, f"[REDACTED {pii_type}]", redacted_text)
    return redacted_text
