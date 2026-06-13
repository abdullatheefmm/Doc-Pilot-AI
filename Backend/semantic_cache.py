from __future__ import annotations
import numpy as np
import time
from typing import Any
import retrieval

class SemanticCache:
    def __init__(self, threshold: float = 0.95, ttl_seconds: int = 3600):
        # List of dicts: {"query": str, "embedding": np.ndarray, "timestamp": float, "value": Any, "mode": str, "domain": str, "user_role": str}
        self._cache: list[dict[str, Any]] = []
        self.threshold = threshold
        self.ttl = ttl_seconds
        self.hits = 0
        self.misses = 0

    def _cleanup(self):
        now = time.time()
        self._cache = [entry for entry in self._cache if now - entry["timestamp"] <= self.ttl]

    def _cosine_similarity(self, a: np.ndarray, b: np.ndarray) -> float:
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

    def get(self, query: str, mode: str, domain: str, user_role: str) -> Any | None:
        self._cleanup()
        
        # We need the model to embed the incoming query
        try:
            model = retrieval.get_model()
            query_emb = model.encode(query)
            query_emb = query_emb / np.linalg.norm(query_emb)
        except Exception:
            self.misses += 1
            return None

        best_score = -1.0
        best_entry = None

        for entry in self._cache:
            # Domain and Role must match exactly
            if entry["mode"] != mode or entry["domain"] != domain or entry["user_role"] != user_role:
                continue
                
            score = self._cosine_similarity(query_emb, entry["embedding"])
            if score > best_score:
                best_score = score
                best_entry = entry

        if best_entry and best_score >= self.threshold:
            self.hits += 1
            # Refresh timestamp
            best_entry["timestamp"] = time.time()
            return best_entry["value"]

        self.misses += 1
        return None

    def put(self, query: str, mode: str, domain: str, user_role: str, value: Any) -> None:
        self._cleanup()
        try:
            model = retrieval.get_model()
            query_emb = model.encode(query)
            query_emb = query_emb / np.linalg.norm(query_emb)
            
            self._cache.append({
                "query": query,
                "embedding": query_emb,
                "timestamp": time.time(),
                "value": value,
                "mode": mode,
                "domain": domain,
                "user_role": user_role
            })
        except Exception as e:
            print(f"Failed to cache: {e}")

semantic_answer_cache = SemanticCache()
