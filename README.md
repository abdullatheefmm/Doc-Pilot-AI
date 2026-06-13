Enterprise Knowledge Assistant using FastAPI Documentation

Overview:

This project is a GenAI-based Enterprise Knowledge Assistant built using selected sections of the official FastAPI documentation as its knowledge source.
The system simulates an internal developer support assistant that can:
*)Ingest technical documentation
*)Retrieve relevant information based on user questions
*)Provide grounded, documentation-based answers
*)Explicitly refuse to answer out-of-scope questions

The focus of this project is on building an end-to-end retrieval-based GenAI pipeline, rather than UI or conversational polish.

Documentation Source

The following sections from the FastAPI official documentation were used as the internal knowledge base:

Introduction

First Steps

Path Parameters

Query Parameters

These documents are treated as internal company knowledge and stored locally as text files.

System Architecture
FastAPI Documentation
        ↓
Document Ingestion
        ↓
Text Cleaning & Chunking
        ↓
Embedding Generation
        ↓
Semantic Retrieval
        ↓
Grounded Answer Extraction

Project Components
1. Document Ingestion

Selected FastAPI documentation pages are scraped and converted into clean, readable text files.
These files form the knowledge base used by the assistant.

Script: ingestion.py

2. Text Chunking

Large documentation files are split into smaller text chunks.
This improves retrieval accuracy and helps the system handle long documents efficiently.

Script: chunking.py

3. Embedding Generation

Each text chunk is converted into a numerical vector representation using a local Sentence Transformer model (all-MiniLM-L6-v2).

A local model is used to:

Avoid external API dependencies

Ensure reproducibility

Maintain stability during evaluation

Script: embeddings.py

4. Semantic Retrieval

User questions are embedded using the same model.
Cosine similarity is used to retrieve the most relevant documentation chunks.

Only chunks above a relevance threshold are considered for answering.

Script: retrieval.py

5. Retrieval-Based Question Answering (RAG)

The system uses retrieved documentation chunks to construct answers.
Answers are directly extracted from documentation content to ensure they are fully grounded.

If no relevant documentation is found, the system responds with:

“The knowledge base does not contain this information.”

This behavior prevents hallucinated responses.

Script: rag_qa.py

6. Summarization

Section-level summaries are generated using rule-based text extraction.
An executive summary is created by combining individual section summaries.

Due to the technical nature of the documentation, summaries may include brief code references to preserve correctness.

Script: summarization.py

7. FAQ Generation

Common developer questions are identified manually.
Answers are derived directly from the documentation content.

This simulates frequently asked internal support questions.

Script: faq_generation.py

Sample Outputs
Example: Answerable Question

Question:

What are query parameters in FastAPI?


Answer (example):
The system returns a documentation-grounded explanation describing query parameters, including examples such as skip and limit, directly extracted from the FastAPI documentation.

Source Files:

query_params.txt

path_params.txt

Example: Out-of-Scope Question

Question:

How do I deploy FastAPI using Docker?


Answer:

The knowledge base does not contain this information.


This demonstrates explicit refusal for unsupported queries.

Design Decision: Grounded Answers

This project intentionally avoids LLM-based answer generation to prevent hallucinated responses.
Instead, answers are constructed directly from retrieved documentation content to ensure full grounding in the source material.

As a result, some responses may include example-based explanations or additional context rather than short, definition-style answers.
This trade-off prioritizes correctness, transparency, and reliability over linguistic refinement.

Limitations

Answers are not paraphrased or rewritten

Comparison-style questions may return similar explanations due to limited document scope

Rule-based summarization may include technical formatting

No user interface (console-based prototype)

Possible Improvements

Use an LLM for answer synthesis and summarization

Introduce intent classification for better question handling

Use a vector database such as FAISS or Chroma

Add a web-based or chat-based interface

Expand the documentation coverage

How to Run the Project
pip install -r requirements.txt
python ingestion.py
python chunking.py
python embeddings.py
python rag_qa.py
