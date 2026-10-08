"""Normalize Gmail/Drive payloads into evidence sources."""

from __future__ import annotations

import os
import re
from typing import Any

from bs4 import BeautifulSoup


def _max_chars() -> int:
    return int(os.environ.get("MAX_SOURCE_CHARS", "8000"))


def strip_html(html: str) -> str:
    if not html:
        return ""
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style"]):
        tag.decompose()
    text = soup.get_text("\n")
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def strip_quoted(text: str) -> str:
    """Drop common reply/forward quoted chains."""
    lines = text.splitlines()
    out: list[str] = []
    for line in lines:
        if re.match(r"^On .+ wrote:$", line.strip()):
            break
        if line.strip() == "---------- Forwarded message ----------":
            break
        if line.startswith(">"):
            continue
        out.append(line)
    return "\n".join(out).strip()


def trim(text: str) -> str:
    max_c = _max_chars()
    if len(text) <= max_c:
        return text
    return text[: max_c - 20] + "\n…[truncated]"


def gmail_to_source(msg: dict[str, Any]) -> dict[str, Any] | None:
    mid = (
        msg.get("id")
        or msg.get("message_id")
        or msg.get("messageId")
        or msg.get("threadId")
    )
    if not mid:
        return None
    subject = msg.get("subject") or msg.get("Subject") or "(no subject)"
    from_ = msg.get("from") or msg.get("From") or msg.get("sender") or ""
    date = str(msg.get("date") or msg.get("Date") or msg.get("internalDate") or "")
    body = (
        msg.get("body")
        or msg.get("text")
        or msg.get("snippet")
        or msg.get("content")
        or ""
    )
    if isinstance(body, dict):
        body = body.get("text") or body.get("html") or str(body)
    html = msg.get("html") or msg.get("body_html") or ""
    if html and (not body or "<" in str(body)):
        body = strip_html(str(html))
    else:
        body = strip_html(str(body)) if "<" in str(body) else str(body)
    body = trim(strip_quoted(body))
    snippet = (msg.get("snippet") or body[:200]).replace("\n", " ")
    return {
        "id": f"gmail:{mid}",
        "kind": "gmail",
        "title": subject,
        "from": from_,
        "date": date,
        "snippet": snippet[:300],
        "text": body,
    }


def drive_to_source(file: dict[str, Any], content: str = "") -> dict[str, Any] | None:
    fid = file.get("id") or file.get("file_id") or file.get("fileId")
    if not fid:
        return None
    name = file.get("name") or file.get("title") or "(untitled)"
    date = str(file.get("modifiedTime") or file.get("createdTime") or file.get("date") or "")
    text = trim(strip_quoted(strip_html(content) if content else name))
    return {
        "id": f"drive:{fid}",
        "kind": "drive",
        "title": name,
        "from": "",
        "date": date,
        "snippet": text[:300],
        "text": text,
    }


def extract_message_list(payload: Any) -> list[dict[str, Any]]:
    if payload is None:
        return []
    if isinstance(payload, list):
        return [p for p in payload if isinstance(p, dict)]
    if isinstance(payload, dict):
        for key in ("messages", "results", "items", "data"):
            if isinstance(payload.get(key), list):
                return [p for p in payload[key] if isinstance(p, dict)]
        if "id" in payload or "message_id" in payload:
            return [payload]
    if isinstance(payload, str):
        # Try to find message ids in free text
        ids = re.findall(r"\b([a-f0-9]{10,})\b", payload)
        return [{"id": i, "snippet": ""} for i in ids[:20]]
    return []


def extract_file_list(payload: Any) -> list[dict[str, Any]]:
    if payload is None:
        return []
    if isinstance(payload, list):
        return [p for p in payload if isinstance(p, dict)]
    if isinstance(payload, dict):
        for key in ("files", "results", "items", "data"):
            if isinstance(payload.get(key), list):
                return [p for p in payload[key] if isinstance(p, dict)]
        if "id" in payload:
            return [payload]
    return []


def dedupe_sources(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for s in sources:
        sid = s.get("id")
        if not sid or sid in seen:
            continue
        seen.add(sid)
        out.append(s)
    out.sort(key=lambda x: x.get("date") or "", reverse=True)
    return out
