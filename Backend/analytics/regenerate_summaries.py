import os
from pathlib import Path
from knowledge_domains import save_document_summary
from summarization import generate_summary

def regenerate_all():
    print("Fetching documents from data/fastapi_docs...")
    data_dir = Path("data/fastapi_docs")
    if not data_dir.exists():
        print("Directory not found.")
        return
        
    for file_path in data_dir.glob("*.txt"):
        doc_name = file_path.name
        print(f"Processing {doc_name}...")
        
        try:
            # Read file
            text = file_path.read_text(encoding='utf-8', errors='ignore')
            
            # Generate new summary
            print("Generating new concise summary...")
            summary = generate_summary(text)
            
            # Save to DB
            save_document_summary(doc_name, summary)
            print(f"Successfully updated summary for {doc_name}: {summary}")
            
        except Exception as e:
            print(f"Failed to process {doc_name}: {e}")

if __name__ == "__main__":
    regenerate_all()
