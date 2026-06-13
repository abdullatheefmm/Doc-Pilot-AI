import os

files = [
    r"d:\Project\Doc-Pilot-AI\Backend\rag_qa.py",
    r"d:\Project\Doc-Pilot-AI\Backend\memory_agent.py",
    r"d:\Project\Doc-Pilot-AI\Backend\data_agent.py",
    r"d:\Project\Doc-Pilot-AI\Backend\agent.py",
    r"d:\Project\Doc-Pilot-AI\Backend\summarization.py"
]

for fpath in files:
    if not os.path.exists(fpath):
        continue
    with open(fpath, "r", encoding="utf-8") as f:
        content = f.read()
        
    content = content.replace("GROQ_MODEL", "LLM_MODEL")
    content = content.replace("get_groq_client", "get_llm_client")
    content = content.replace("GROQ_API_KEY", "LLM_API_KEY")
    content = content.replace("groq_client", "llm_client")
    content = content.replace("Groq", "OpenAI")
    
    with open(fpath, "w", encoding="utf-8") as f:
        f.write(content)
        
print("Successfully replaced Groq with LLM references.")
