<div align="center">
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/React-Dark.svg" width="40" height="40" alt="React" />
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/FastAPI.svg" width="40" height="40" alt="FastAPI" />
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/Python-Dark.svg" width="40" height="40" alt="Python" />
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/Supabase-Dark.svg" width="40" height="40" alt="Supabase" />
  
  <br/><br/>

  <h1 align="center">Doc-Pilot AI</h1>
  <p align="center">
    <strong>An Enterprise-Grade, Agentic RAG Platform for Deep Document Intelligence</strong>
  </p>

  <p align="center">
    <a href="#overview">Overview</a> •
    <a href="#capabilities">Capabilities</a> •
    <a href="#getting-started">Getting Started</a> •
    <a href="#security--privacy">Security</a>
  </p>
</div>

<br/>

## 🎯 Overview

**Doc-Pilot AI** is a state-of-the-art enterprise knowledge retrieval system. Designed for environments that demand both extreme precision and robust data security, it transforms static document repositories into interactive, secure, and highly intelligent knowledge bases.

By combining hybrid semantic search architectures with multi-agent orchestration, Doc-Pilot AI ensures that your internal data remains confidential while delivering hyper-accurate, hallucination-free insights.

<br/>

## 🚀 Core Capabilities

<table width="100%">
  <tr>
    <td width="50%" valign="top">
      <h3>🔍 Precision Retrieval Engine</h3>
      Leverages a sophisticated <strong>Hybrid RAG</strong> architecture, fusing dense semantic vectors with sparse lexical ranking. Combined with cross-encoder reranking, the platform guarantees that only the most contextually relevant data is processed.
    </td>
    <td width="50%" valign="top">
      <h3>🛡️ Enterprise-Grade Security</h3>
      Built-in <strong>Data Loss Prevention (DLP)</strong> automatically sanitizes and redacts Personally Identifiable Information (PII) before external processing. Additionally, <strong>Ghost Mode</strong> offers zero-persistence querying for sensitive tasks.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>🕸️ Interactive Knowledge Graphs</h3>
      Documents aren't just searched; they are understood. The platform automatically extracts complex entity relationships and visualizes them through dynamic, physics-based UI nodes, allowing users to visually explore data flow and connections.
    </td>
    <td width="50%" valign="top">
      <h3>🤖 Multi-Agent Orchestration</h3>
      A coordinated ecosystem of specialized agents works in tandem to parse complex tables, extract text from embedded charts, and maintain continuous conversational context across sessions.
    </td>
  </tr>
</table>

<br/>

## 🏗️ Architecture at a Glance

<div align="center">
  <br/>
  <p><em>(Doc-Pilot operates on a streamlined, multi-stage pipeline: Ingestion ➝ DLP Sanitization ➝ Query Optimization ➝ Hybrid Retrieval ➝ Reranking ➝ Secure LLM Synthesis ➝ Verification.)</em></p>
</div>

<br/>

## ⚙️ Getting Started

### Prerequisites
* **Python 3.10+**
* **Node.js 18+**
* **API Keys:** Supabase & OpenRouter

<details>
<summary><b>Click to expand Installation Instructions</b></summary>

<br/>

#### 1. Backend Initialization
```bash
cd Backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

#### 2. Frontend Initialization
```bash
cd frontend
npm install
npm run dev
```

#### 3. Environment Configuration (`.env`)
```env
OPENROUTER_API_KEY=sk-or-v1-...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
```
</details>

<br/>

## 🔒 Security & Privacy Notice

Doc-Pilot AI is engineered with privacy as a foundational principle. All documents remain in your designated local storage or secure internal infrastructure. The integrated DLP pipeline ensures that sensitive data parameters are masked. Always review your organizational data governance policies before bridging to external LLM providers.

<br/>

<div align="center">
  <p>Built with ❤️ by Abdullatheef</p>
</div>
