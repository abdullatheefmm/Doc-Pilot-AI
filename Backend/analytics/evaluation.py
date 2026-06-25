import os
import mlflow
from typing import List, Dict, Any
from pathlib import Path

# Configure MLflow to use the local sqlite database in Backend/mlflow.db
BACKEND_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BACKEND_DIR / "mlflow.db"
mlflow.set_tracking_uri(f"sqlite:///{DB_PATH.as_posix()}")
mlflow.set_experiment("Doc-Pilot-RAG-Experiment")

def log_rag_evaluation(query: str, answer: str, context: List[str], confidence: float, duration_ms: float):
    """
    Logs RAG interaction to MLflow. 
    In a full production setup, this would also asynchronously call the `ragas` library 
    to compute Faithfulness and Answer Relevance against the ground truth.
    """
    with mlflow.start_run():
        # Log inputs
        mlflow.log_param("query", query)
        
        # Log configuration
        mlflow.log_param("top_k", 4)
        mlflow.log_param("model", os.getenv("LLM_MODEL", "gpt-4o-mini"))
        
        # Log outputs & metrics
        mlflow.log_metric("confidence", confidence)
        mlflow.log_metric("response_time_ms", duration_ms)
        mlflow.log_text(answer, "answer.txt")
        mlflow.log_text("\n\n---\n\n".join(context), "context_used.txt")
        
        # Here we could import `ragas` to evaluate Faithfulness and Relevance
        # e.g., faithfulness_score = evaluate_faithfulness(question=query, contexts=context, answer=answer)
        # mlflow.log_metric("faithfulness", faithfulness_score)

def run_offline_evaluation(dataset_path: str):
    """
    Function intended for CI/CD or nightly runs to use `ragas` and evaluate
    the entire dataset of historical queries against new prompts.
    """
    # Requires `ragas` and `datasets` to be installed
    pass
