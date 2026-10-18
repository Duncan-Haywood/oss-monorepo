"""A small SQLite key-value store: one table per stage, JSON values keyed by asset id or event key.
Every stage is resumable because it skips keys that already have a value."""
from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import Iterator, TypeVar

from pydantic import BaseModel

# edit_plans: director settings and critic rounds of edits still in progress; reel_plans: story-pass
# plans of reels as they arrive; reel_rounds: every draft, check and critic round of a reel
TABLES = ("assets", "metrics", "scores", "curation", "edit_plans", "edits", "reels", "reel_plans", "reel_rounds",
          "meta", "geo", "carousels", "astro", "jobs")
M = TypeVar("M", bound=BaseModel)


class Store:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.lock = threading.Lock()      # stages write from worker threads
        self.db.execute("PRAGMA journal_mode=WAL")
        for t in TABLES:
            self.db.execute(f"CREATE TABLE IF NOT EXISTS {t} (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        self.db.commit()

    def put(self, table: str, key: str, value: BaseModel | dict) -> None:
        text = value.model_dump_json() if isinstance(value, BaseModel) else json.dumps(value, sort_keys=True)
        with self.lock:
            self.db.execute(f"INSERT OR REPLACE INTO {table} (key, value) VALUES (?, ?)", (key, text))
            self.db.commit()

    def put_many(self, table: str, items: list[tuple[str, BaseModel | dict]]) -> None:
        """One transaction for many rows: a commit per row is slow on USB drives."""
        rows = [(k, v.model_dump_json() if isinstance(v, BaseModel) else json.dumps(v, sort_keys=True))
                for k, v in items]
        with self.lock:
            self.db.executemany(f"INSERT OR REPLACE INTO {table} (key, value) VALUES (?, ?)", rows)
            self.db.commit()

    def get(self, table: str, key: str, model: type[M] | None = None):
        with self.lock:
            row = self.db.execute(f"SELECT value FROM {table} WHERE key = ?", (key,)).fetchone()
        if row is None:
            return None
        return model.model_validate_json(row[0]) if model else json.loads(row[0])

    def has(self, table: str, key: str) -> bool:
        with self.lock:
            return self.db.execute(f"SELECT 1 FROM {table} WHERE key = ?", (key,)).fetchone() is not None

    def all(self, table: str, model: type[M] | None = None) -> Iterator[tuple[str, M | dict]]:
        with self.lock:
            rows = self.db.execute(f"SELECT key, value FROM {table} ORDER BY key").fetchall()
        for key, value in rows:
            yield key, (model.model_validate_json(value) if model else json.loads(value))

    def delete(self, table: str, key: str) -> None:
        with self.lock:
            self.db.execute(f"DELETE FROM {table} WHERE key = ?", (key,))
            self.db.commit()
