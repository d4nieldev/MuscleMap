from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path

from app.config import get_settings


class CacheService:
    def __init__(self) -> None:
        self.db_path = get_settings().cache_db_path
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path, timeout=10)
        connection.execute("pragma journal_mode = wal")
        connection.execute("pragma synchronous = normal")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                "create table if not exists inference_cache (cache_key text primary key, payload text not null)"
            )
            connection.commit()

    def get(self, cache_key: str) -> dict | None:
        with self._connect() as connection:
            row = connection.execute(
                "select payload from inference_cache where cache_key = ?", (cache_key,)
            ).fetchone()
        return json.loads(row[0]) if row else None

    def set(self, cache_key: str, payload: dict) -> None:
        with self._lock:
            with self._connect() as connection:
                connection.execute(
                    "insert or replace into inference_cache(cache_key, payload) values (?, ?)",
                    (cache_key, json.dumps(payload)),
                )
                connection.commit()


cache_service = CacheService()
