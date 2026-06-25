from pathlib import Path
import re

DATA_DIR = Path("data/fastapi_docs")
SUPPORTED_EXTENSIONS = {".txt", ".md"}
CHUNK_SIZE = 220
CHUNK_OVERLAP = 40


def normalize_whitespace(text: str) -> str:
    lines = [line.strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    words = text.split()
    if not words:
        return []

    step = max(1, chunk_size - overlap)
    chunks: list[str] = []

    for start in range(0, len(words), step):
        chunk_words = words[start:start + chunk_size]
        if not chunk_words:
            continue
        chunks.append(" ".join(chunk_words))
        if start + chunk_size >= len(words):
            break

    return chunks


def smart_chunk_text(text: str, target_size: int = 200, overlap_sentences: int = 1) -> list[str]:
    """Sentence-boundary-aware chunking that preserves semantic coherence."""
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    sentences = [s.strip() for s in sentences if s.strip()]

    if not sentences:
        return []

    chunks: list[str] = []
    current_chunk: list[str] = []
    current_word_count = 0

    for sentence in sentences:
        word_count = len(sentence.split())

        if current_word_count + word_count > target_size and current_chunk:
            chunks.append(" ".join(current_chunk))
            # Keep last N sentences as overlap
            overlap = current_chunk[-overlap_sentences:] if overlap_sentences > 0 else []
            current_chunk = list(overlap)
            current_word_count = sum(len(s.split()) for s in current_chunk)

        current_chunk.append(sentence)
        current_word_count += word_count

    if current_chunk:
        chunks.append(" ".join(current_chunk))

    return chunks


def iter_source_files(data_dir: Path = DATA_DIR):
    for extension in SUPPORTED_EXTENSIONS:
        yield from sorted(data_dir.glob(f"*{extension}"))


if __name__ == "__main__":
    all_chunks: list[str] = []

    for file_path in iter_source_files():
        print(f"Processing: {file_path.name}")

        text = normalize_whitespace(file_path.read_text(encoding="utf-8"))
        chunks = smart_chunk_text(text)

        print(f"Total chunks: {len(chunks)}\n")

        for idx, chunk in enumerate(chunks[:2]):
            print(f"--- Chunk {idx + 1} ---")
            print(chunk[:300], "...\n")

        all_chunks.extend(chunks)

    print(f"Total chunks created: {len(all_chunks)}")
