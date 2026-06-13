# Project Modules Overview

Based on the actual structure of the codebase, the **GenAI-Powered Knowledge Management System (DocPilot AI)** is decoupled into a **Backend (FastAPI)** and a **Frontend (React)**. Here are all the core modules currently implemented in the system and their distinct responsibilities:

---

## ⚙️ Backend Modules (FastAPI)
The backend is highly modular, with specific Python files dedicated to each step of the Retrieval-Augmented Generation (RAG) and knowledge management pipeline:

1. **`ingestion.py` (Document Ingestion)**
   Handles uploading, parsing, and extracting raw text from various document formats so the system can read and process them.

2. **`chunking.py` (Data Chunking)**
   Breaks down massive, long documents into smaller, overlapping semantic chunks. This ensures data fits within LLM context windows and can be searched effectively.

3. **`embeddings.py` (Vector Embeddings)**
   Converts human-readable text chunks into mathematical vector representations (embeddings) to capture their deep semantic meaning.

4. **`retrieval.py` (Semantic Search/Retrieval)**
   Takes a user's question, turns it into a vector, and performs similarity searches against the vector database to find the most relevant document chunks.

5. **`rag_qa.py` (Question & Answering Engine)**
   The core Q&A engine that injects the retrieved document chunks into an LLM prompt. It synthesizes and answers the user's queries based *strictly* on that retrieved context.

6. **`summarization.py` (Document Summarization)**
   A dedicated engine for condensing entire long documents into concise, readable executive summaries.

7. **`knowledge_domains.py` (Domain Management)**
   Responsible for categorizing and partitioning knowledge into different logical domains (e.g., "Engineering", "HR & Policy", "Finance"). This keeps search contexts isolated, relevant, and organized.

8. **`cache.py` (Query Caching)**
   Intercepts frequent or repeated questions. If a query matches a cached intent, it serves the cached answer instantly, drastically reducing latency and LLM processing overhead.

9. **`analytics.py` (System Telemetry)**
   Tracks system usage metrics, query logs, document popularity, and system health metrics for the dashboard.

10. **`main.py` (API Gateway)**
    The core FastAPI application entry point. It binds all the routers, background tasks, and modules together, exposing them as REST endpoints to the frontend.

---

## 💻 Frontend Modules (React)
The presentation layer is built using modern React components, allowing for a clean, modular, and maintainable User Interface:

1. **`App.jsx` (Core App Module)**
   The main root module handling state management, API communication, routing, and the core layout (including the conversational chat interface).

2. **`KnowledgeBasePanel.jsx` (Document Management)**
   The interface module where users or administrators can view, categorize, manage, and delete ingested documents across different Knowledge Domains.

3. **`AnalyticsPanel.jsx` (Dashboard & Telemetry)**
   The dashboard module that renders statistics, query counts, latency charts, and system metrics tracking how the knowledge base is being utilized.

4. **`Visuals.jsx` (UI/UX Assets)**
   Contains the reusable visualization widgets and any graphical charts, diagrams, or animations utilized throughout the application. 
