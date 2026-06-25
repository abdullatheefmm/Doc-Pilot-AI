from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

DATA_DIR = Path("data/fastapi_docs")


def clean_text(text: str) -> str:
    """Clean extracted text by removing blank lines and extra whitespace."""
    lines = [line.strip() for line in text.split("\n")]
    return "\n".join(line for line in lines if line)


def ingest_url(url: str) -> tuple[str, str]:
    """Fetch and extract readable text from a URL.

    Returns:
        (filename, cleaned_text)
    """
    response = requests.get(url, timeout=15, headers={"User-Agent": "DocPilot-Bot/1.0"})
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    # Remove non-content elements
    for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()

    # Try article first, then main, then body
    content = soup.find("article") or soup.find("main") or soup.find("body")
    text = content.get_text(separator="\n") if content else ""
    cleaned = clean_text(text)

    # Generate filename from URL title or path
    title_tag = soup.find("title")
    if title_tag and title_tag.string:
        name = re.sub(r"[^\w\s-]", "", title_tag.string.strip())[:50]
        name = re.sub(r"\s+", "_", name).lower()
    else:
        parsed = urlparse(url)
        name = parsed.netloc.replace(".", "_") + parsed.path.replace("/", "_")
        name = re.sub(r"[^\w]", "_", name)[:50]

    filename = f"{name}.txt"
    return filename, cleaned


def save_ingested(filename: str, text: str, data_dir: Path = DATA_DIR) -> Path:
    """Save ingested text to the data directory."""
    data_dir.mkdir(parents=True, exist_ok=True)
    file_path = data_dir / filename
    file_path.write_text(text, encoding="utf-8")
    return file_path
