import retrieval


if __name__ == "__main__":
    total_documents = retrieval.refresh_index()
    print(f"Created embeddings for {total_documents} chunks.")
    print(f"Embedding model: {retrieval.MODEL_NAME}")
