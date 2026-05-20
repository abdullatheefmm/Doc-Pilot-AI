from __future__ import annotations

from collections import OrderedDict
from time import time
from typing import Any


class LRUCache:
    def __init__(self, max_size: int = 128, ttl_seconds: int = 1800):
        self._cache: OrderedDict[str, tuple[float, Any]] = OrderedDict()
        self._max_size = max_size
        self._ttl = ttl_seconds
        self._hits = 0
        self._misses = 0

    def _normalize_key(self, query: str) -> str:
        return " ".join(query.lower().strip().split())

    def get(self, query: str) -> Any | None:
        key = self._normalize_key(query)
        if key not in self._cache:
            self._misses += 1
            return None
        timestamp, value = self._cache[key]
        if time() - timestamp > self._ttl:
            del self._cache[key]
            self._misses += 1
            return None
        self._cache.move_to_end(key)
        self._hits += 1
        return value

    def put(self, query: str, value: Any) -> None:
        key = self._normalize_key(query)
        self._cache[key] = (time(), value)
        self._cache.move_to_end(key)
        if len(self._cache) > self._max_size:
            self._cache.popitem(last=False)

    def invalidate_all(self) -> None:
        self._cache.clear()

    def stats(self) -> dict[str, Any]:
        total = self._hits + self._misses
        return {
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": round(self._hits / total, 3) if total > 0 else 0,
            "size": len(self._cache),
            "max_size": self._max_size,
        }


answer_cache = LRUCache()
