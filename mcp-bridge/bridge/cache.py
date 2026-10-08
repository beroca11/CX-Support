"""SQLite TTL cache for MCP tool results."""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any

# Per-tool TTLs in seconds
TTL: dict[str, int] = {
    "search_gmail_messages": 300,
    "search_drive_files": 300,
    "search_messages": 300,
    "get_gmail_message_content": 86400,
    "get_gmail_messages_content_batch": 86400,
    "get_doc_content": 86400,
    "get_drive_file_content": 86400,
    "read_sheet_values": 600,
}
DEFAULT_TTL = 300


def _path() -> Path:
    base = Path(os.environ.get("CACHE_DIR", "/tmp/ees-bridge-cache"))
    base.mkdir(parents=True, exist_ok=True)
    return base / "cache.sqlite3"


class Cache:
    def __init__(self) -> None:
        self._conn = sqlite3.connect(str(_path()), check_same_thread=False)
        self._conn.execute(
            """CREATE TABLE IF NOT EXISTS cache (
                 key TEXT PRIMARY KEY,
                 tool TEXT NOT NULL,
                 value TEXT NOT NULL,
                 expires_at REAL NOT NULL
               )"""
        )
        self._conn.commit()

    @staticmethod
    def key(tool: str, args: dict[str, Any]) -> str:
        raw = json.dumps({"tool": tool, "args": args}, sort_keys=True, default=str)
        return hashlib.sha256(raw.encode()).hexdigest()

    def get(self, tool: str, args: dict[str, Any]) -> Any | None:
        k = self.key(tool, args)
        row = self._conn.execute(
            "SELECT value, expires_at FROM cache WHERE key = ?", (k,)
        ).fetchone()
        if not row:
            return None
        value, expires = row
        if time.time() > expires:
            self._conn.execute("DELETE FROM cache WHERE key = ?", (k,))
            self._conn.commit()
            return None
        return json.loads(value)

    def set(self, tool: str, args: dict[str, Any], value: Any) -> None:
        ttl = TTL.get(tool, DEFAULT_TTL)
        k = self.key(tool, args)
        self._conn.execute(
            "INSERT OR REPLACE INTO cache (key, tool, value, expires_at) VALUES (?,?,?,?)",
            (k, tool, json.dumps(value, default=str), time.time() + ttl),
        )
        self._conn.commit()

    def invalidate_prefix(self, case_id: str) -> int:
        # Soft invalidate: delete all (case-scoped keys not stored separately)
        # Keep simple — wipe search cache entries
        cur = self._conn.execute(
            "DELETE FROM cache WHERE tool LIKE 'search%' OR value LIKE ?",
            (f"%{case_id}%",),
        )
        self._conn.commit()
        return cur.rowcount
