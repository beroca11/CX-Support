"""Long-lived MCP ClientSession over stdio to workspace-mcp."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from contextlib import AsyncExitStack
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

log = logging.getLogger("bridge.mcp")

_SETTINGS = os.environ.get("MCP_SETTINGS_PATH", "/data/cache/mcp-settings.json")
_COMMAND = re.compile(r"[A-Za-z0-9_./-]{1,120}")
_ENV_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,63}")

# Read-only tools allowed through the bridge
ALLOW = {
    "search_gmail_messages",
    "get_gmail_message_content",
    "get_gmail_messages_content_batch",
    "search_drive_files",
    "get_doc_content",
    "get_drive_file_content",
    "read_sheet_values",
    "search_messages",
    "get_messages",
    "list_calendars",
    "get_events",
    "search_contacts",
    "get_contact",
    "list_tasks",
    "get_task",
}


class McpManager:
    def __init__(self) -> None:
        self._stack: AsyncExitStack | None = None
        self._session: ClientSession | None = None
        self._lock = asyncio.Lock()
        self._tools: list[dict[str, Any]] = []
        self._ready = False
        self._error: str | None = None

    @property
    def ready(self) -> bool:
        return self._ready

    @property
    def error(self) -> str | None:
        return self._error

    async def start(self) -> None:
        async with self._lock:
            if self._ready:
                return
            try:
                await self._connect()
            except Exception as exc:  # noqa: BLE001
                self._error = str(exc)
                self._ready = False
                log.exception("MCP connect failed")

    async def _close_unlocked(self) -> None:
        if self._stack:
            await self._stack.aclose()
        self._stack = None
        self._session = None
        self._ready = False

    async def apply(self, parsed: dict[str, Any]) -> None:
        save_settings(parsed)
        async with self._lock:
            await self._close_unlocked()
            self._error = None
            try:
                await self._connect()
            except Exception as exc:  # noqa: BLE001
                self._error = str(exc)
                self._ready = False
                log.exception("MCP reconnect failed")
                raise

    async def _connect(self) -> None:
        await self._close_unlocked()
        self._stack = AsyncExitStack()
        await self._stack.__aenter__()

        saved = load_settings()
        if saved:
            command = saved["command"]
            args = list(saved["args"])
        else:
            command = os.environ.get("WORKSPACE_MCP_CMD", "uvx")
            args = os.environ.get(
                "WORKSPACE_MCP_ARGS",
                "--python 3.12 workspace-mcp --tool-tier core --single-user",
            ).split()

        env = {**os.environ}
        if saved and saved.get("env"):
            env.update(saved["env"])
        # OAuth redirect for browser login when needed
        env.setdefault("GOOGLE_OAUTH_REDIRECT_URI", "http://localhost:8000/oauth2callback")
        env.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")

        params = StdioServerParameters(command=command, args=args, env=env)
        read, write = await self._stack.enter_async_context(stdio_client(params))
        self._session = await self._stack.enter_async_context(ClientSession(read, write))
        await self._session.initialize()

        listed = await self._session.list_tools()
        self._tools = [
            {
                "name": t.name,
                "description": getattr(t, "description", "") or "",
            }
            for t in listed.tools
        ]
        self._ready = True
        self._error = None
        log.info("MCP ready with %d tools", len(self._tools))

    async def stop(self) -> None:
        async with self._lock:
            await self._close_unlocked()

    def list_tools(self) -> list[dict[str, Any]]:
        return list(self._tools)

    async def call(self, tool: str, args: dict[str, Any]) -> Any:
        if tool not in ALLOW:
            raise PermissionError(f"Tool not allowed: {tool}")
        if not self._ready or not self._session:
            await self.start()
        if not self._session:
            raise RuntimeError(self._error or "MCP not connected")

        async with self._lock:
            result = await self._session.call_tool(tool, args)

        parts: list[Any] = []
        for block in result.content or []:
            kind = getattr(block, "type", None) or (block.get("type") if isinstance(block, dict) else None)
            if kind == "text":
                text = getattr(block, "text", None) or (block.get("text") if isinstance(block, dict) else "")
                parts.append(text)
            else:
                parts.append(str(block))
        if len(parts) == 1:
            text = parts[0]
            if isinstance(text, str):
                try:
                    return json.loads(text)
                except Exception:  # noqa: BLE001
                    return text
            return text
        return parts


def load_settings() -> dict[str, Any] | None:
    try:
        with open(_SETTINGS, encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError:
        return None
    except Exception:  # noqa: BLE001
        log.warning("Ignoring unreadable MCP settings file")
        return None
    return data if isinstance(data, dict) and data.get("command") else None


def public_settings() -> dict[str, Any] | None:
    data = load_settings()
    if not data:
        return None
    env = data.get("env") if isinstance(data.get("env"), dict) else {}
    return {
        "name": data.get("name") or "",
        "command": data.get("command") or "",
        "args": data.get("args") or [],
        "envKeys": sorted(str(key) for key in env),
    }


def save_settings(parsed: dict[str, Any]) -> None:
    folder = os.path.dirname(_SETTINGS) or "."
    os.makedirs(folder, exist_ok=True)
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    fd = os.open(_SETTINGS, flags, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(parsed, handle)


def parse_mcp_settings(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Settings must be a JSON object")
    servers = payload.get("mcpServers")
    if isinstance(servers, dict) and servers:
        name, spec = next(iter(servers.items()))
    elif "command" in payload:
        name, spec = payload.get("name") or "mcp", payload
    else:
        raise ValueError("Paste Cursor MCP JSON with mcpServers, or a command and args")
    if not isinstance(spec, dict):
        raise ValueError("Server settings must be an object")
    if spec.get("url") or spec.get("serverUrl"):
        raise ValueError("Remote MCP URLs are not supported. Paste a local command, args, and env.")
    command = spec.get("command")
    if not isinstance(command, str) or not _COMMAND.fullmatch(command):
        raise ValueError("command must be an executable name. Put flags in args.")
    args = spec.get("args") or []
    if not isinstance(args, list) or any(not isinstance(item, str) or len(item) > 300 for item in args):
        raise ValueError("args must be a list of strings")
    if len(args) > 24:
        raise ValueError("Too many args")
    raw_env = spec.get("env") or {}
    if not isinstance(raw_env, dict):
        raise ValueError("env must be an object")
    if len(raw_env) > 40:
        raise ValueError("Too many env values")
    env: dict[str, str] = {}
    for key, value in raw_env.items():
        if not isinstance(key, str) or not _ENV_NAME.fullmatch(key):
            raise ValueError("Invalid env name")
        if not isinstance(value, str) or len(value) > 8000:
            raise ValueError(f"Env {key} must be a string")
        env[key] = value
    return {"name": str(name)[:80], "command": command, "args": args, "env": env}


mcp_manager = McpManager()
