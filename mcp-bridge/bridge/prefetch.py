"""Fixed fan-out prefetch for a case."""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

from bridge.cache import Cache
from bridge.mcp_session import mcp_manager
from bridge.normalize import (
    dedupe_sources,
    drive_to_source,
    extract_file_list,
    extract_message_list,
    gmail_to_source,
)

log = logging.getLogger("bridge.prefetch")


async def _call_cached(cache: Cache, tool: str, args: dict[str, Any]) -> Any:
    hit = cache.get(tool, args)
    if hit is not None:
        return hit
    result = await mcp_manager.call(tool, args)
    cache.set(tool, args, result)
    return result


async def prefetch_case(
    cache: Cache,
    *,
    case_id: str,
    customer: str,
    subject: str,
    identifiers: list[str] | None = None,
    since: str | None = None,
    max_messages: int = 8,
    max_files: int = 4,
) -> dict[str, Any]:
    identifiers = identifiers or []
    queries: list[str] = []
    sem = asyncio.Semaphore(int(os.environ.get("BRIDGE_MAX_PARALLEL", "6")))

    async def limited(coro):
        async with sem:
            return await coro

    # Build search queries
    if customer:
        queries.append(f"from:{customer}" if "@" in customer else f'"{customer}"')
    if subject:
        queries.append(f'subject:"{subject}"')
    if case_id:
        queries.append(f'"{case_id}"')
    for ident in identifiers[:5]:
        if ident:
            queries.append(f'"{ident}"')
    if since:
        queries = [f"{q} after:{since}" for q in queries]

    # Gmail searches in parallel
    async def gmail_search(q: str):
        try:
            return await _call_cached(cache, "search_gmail_messages", {"query": q})
        except Exception as exc:  # noqa: BLE001
            log.warning("gmail search failed: %s", exc)
            return None

    search_results = await asyncio.gather(
        *[limited(gmail_search(q)) for q in queries[:6]]
    )

    message_ids: list[str] = []
    seen_ids: set[str] = set()
    for payload in search_results:
        for msg in extract_message_list(payload):
            mid = msg.get("id") or msg.get("message_id") or msg.get("messageId")
            if mid and mid not in seen_ids:
                seen_ids.add(mid)
                message_ids.append(str(mid))

    # Batch or individual fetch
    sources: list[dict[str, Any]] = []

    async def fetch_msg(mid: str):
        try:
            raw = await _call_cached(
                cache, "get_gmail_message_content", {"message_id": mid}
            )
            if isinstance(raw, dict):
                src = gmail_to_source(raw if "id" in raw else {**raw, "id": mid})
            else:
                src = gmail_to_source({"id": mid, "body": str(raw)})
            return src
        except Exception as exc:  # noqa: BLE001
            log.warning("get message %s failed: %s", mid, exc)
            return None

    msgs = await asyncio.gather(
        *[limited(fetch_msg(mid)) for mid in message_ids[:max_messages]]
    )
    for s in msgs:
        if s:
            sources.append(s)

    # Drive search
    drive_q = " ".join(filter(None, [customer, subject, case_id]))
    if drive_q.strip():
        try:
            drive_payload = await _call_cached(
                cache, "search_drive_files", {"query": drive_q}
            )
            files = extract_file_list(drive_payload)[:max_files]

            async def fetch_file(f: dict[str, Any]):
                fid = f.get("id")
                content = ""
                mime = (f.get("mimeType") or "").lower()
                try:
                    if "document" in mime:
                        content_raw = await _call_cached(
                            cache, "get_doc_content", {"document_id": fid}
                        )
                        content = (
                            content_raw
                            if isinstance(content_raw, str)
                            else str(content_raw)
                        )
                    else:
                        content_raw = await _call_cached(
                            cache, "get_drive_file_content", {"file_id": fid}
                        )
                        content = (
                            content_raw
                            if isinstance(content_raw, str)
                            else str(content_raw)
                        )
                except Exception:  # noqa: BLE001
                    content = f.get("name") or ""
                return drive_to_source(f, content)

            file_sources = await asyncio.gather(
                *[limited(fetch_file(f)) for f in files]
            )
            for s in file_sources:
                if s:
                    sources.append(s)
        except Exception as exc:  # noqa: BLE001
            log.warning("drive search failed: %s", exc)

    # Optional picklist sheet — not part of evidence, skip for speed

    return {
        "sources": dedupe_sources(sources),
        "queries": queries,
        "caseId": case_id,
    }
