"""FastAPI HTTP surface for the MCP bridge."""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from bridge.cache import Cache
from bridge.mcp_session import mcp_manager, parse_mcp_settings, public_settings
from bridge.prefetch import prefetch_case

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("bridge")

cache = Cache()
_sem: asyncio.Semaphore | None = None


def sem() -> asyncio.Semaphore:
    global _sem
    if _sem is None:
        _sem = asyncio.Semaphore(int(os.environ.get("BRIDGE_MAX_PARALLEL", "6")))
    return _sem


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await mcp_manager.start()
    yield
    await mcp_manager.stop()


app = FastAPI(title="EES MCP Bridge", lifespan=lifespan)


class CallBody(BaseModel):
    tool: str
    args: dict[str, Any] = Field(default_factory=dict)


class BatchBody(BaseModel):
    calls: list[CallBody]


class PrefetchBody(BaseModel):
    caseId: str
    customer: str = ""
    subject: str = ""
    identifiers: list[str] = Field(default_factory=list)
    since: str | None = None


class InvalidateBody(BaseModel):
    caseId: str


class SettingsBody(BaseModel):
    settings: dict[str, Any]


@app.get("/health")
async def health():
    return {
        "ok": mcp_manager.ready,
        "tools": len(mcp_manager.list_tools()),
        "error": mcp_manager.error,
        "server": public_settings(),
    }


@app.post("/settings")
async def update_settings(body: SettingsBody):
    try:
        parsed = parse_mcp_settings(body.settings)
        await mcp_manager.apply(parsed)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        log.exception("MCP settings rejected")
        raise HTTPException(502, mcp_manager.error or "MCP reconnect failed") from exc
    return {
        "ok": mcp_manager.ready,
        "name": parsed["name"],
        "tools": len(mcp_manager.list_tools()),
        "error": mcp_manager.error,
    }


@app.get("/tools")
async def tools():
    if not mcp_manager.ready:
        await mcp_manager.start()
    return {"tools": mcp_manager.list_tools()}


@app.post("/call")
async def call(body: CallBody):
    hit = cache.get(body.tool, body.args)
    if hit is not None:
        return {"cached": True, "result": hit}
    try:
        async with sem():
            result = await mcp_manager.call(body.tool, body.args)
        cache.set(body.tool, body.args, result)
        return {"cached": False, "result": result}
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        log.exception("call failed")
        raise HTTPException(502, str(exc)) from exc


@app.post("/batch")
async def batch(body: BatchBody):
    async def one(c: CallBody):
        hit = cache.get(c.tool, c.args)
        if hit is not None:
            return {"cached": True, "result": hit, "tool": c.tool}
        try:
            async with sem():
                result = await mcp_manager.call(c.tool, c.args)
            cache.set(c.tool, c.args, result)
            return {"cached": False, "result": result, "tool": c.tool}
        except Exception as exc:  # noqa: BLE001
            return {"error": str(exc), "tool": c.tool}

    results = await asyncio.gather(*[one(c) for c in body.calls])
    return {"results": results}


@app.post("/prefetch/case")
async def prefetch(body: PrefetchBody):
    try:
        if not mcp_manager.ready:
            await mcp_manager.start()
        return await prefetch_case(
            cache,
            case_id=body.caseId,
            customer=body.customer,
            subject=body.subject,
            identifiers=body.identifiers,
            since=body.since,
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("prefetch failed")
        raise HTTPException(502, str(exc)) from exc


@app.post("/cache/invalidate")
async def invalidate(body: InvalidateBody):
    n = cache.invalidate_prefix(body.caseId)
    return {"invalidated": n}
