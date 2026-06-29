from __future__ import annotations
import fitz  # PyMuPDF
import io
import base64
from pathlib import Path
from PIL import Image

def process_pdf_with_vision(file_path: Path) -> str:
    """
    Extract text and describe images/diagrams using vision LLM.
    Returns markdown-formatted text.
    """
    from llm_client import get_llm_client
    client = get_llm_client()

    doc = fitz.open(str(file_path))
    full_text = []

    for page_num in range(len(doc)):
        page = doc[page_num]
        
        # Add text
        text = page.get_text()
        full_text.append(f"--- Page {page_num + 1} ---\n{text}")

        # Add image descriptions
        image_list = page.get_images(full=True)
        for img_index, img_info in enumerate(image_list):
            xref = img_info[0]
            base_image = doc.extract_image(xref)
            image_bytes = base_image["image"]
            ext = base_image["ext"]
            
            if ext not in ["png", "jpeg", "jpg"]:
                # Convert to PNG if needed or skip
                try:
                    img = Image.open(io.BytesIO(image_bytes))
                    buf = io.BytesIO()
                    img.save(buf, format="PNG")
                    image_bytes = buf.getvalue()
                    ext = "png"
                except Exception:
                    continue

            # Skip small icons/logos
            if len(image_bytes) < 5000:
                continue

            diagrams_dir = Path("data/fastapi_docs/uploads/diagrams")
            diagrams_dir.mkdir(parents=True, exist_ok=True)
            img_filename = f"{file_path.stem}_page{page_num + 1}_img{img_index + 1}.{ext}"
            img_path = diagrams_dir / img_filename
            img_url = ""
            try:
                img_path.write_bytes(image_bytes)
                img_url = f"http://127.0.0.1:8000/uploads/diagrams/{img_filename}"
            except Exception as save_err:
                print(f"Failed to save image file: {save_err}")

            base64_image = base64.b64encode(image_bytes).decode("utf-8")
            
            try:
                # Ask LLM to describe the diagram
                response = client.chat.completions.create(
                    model="gpt-4o", # Vision capable model
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": "Describe this diagram or image in detail, focusing on data, labels, architectures, or knowledge."},
                                {
                                    "type": "image_url",
                                    "image_url": {"url": f"data:image/{ext};base64,{base64_image}"}
                                }
                            ]
                        }
                    ],
                    max_tokens=300
                )
                description = response.choices[0].message.content
                img_markdown = f"\n![Original Diagram Page {page_num + 1}]({img_url})\n" if img_url else "\n"
                full_text.append(f"{img_markdown}[Image {img_index + 1} on Page {page_num + 1}]:\n{description}\n")
            except Exception as e:
                print(f"Failed to describe image {img_index} on page {page_num}: {e}")

    return "\n".join(full_text)
