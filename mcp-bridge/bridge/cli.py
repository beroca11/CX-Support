"""CLI: uv run bridge call|batch|prefetch|tools|health"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys

import httpx

BASE = "http://127.0.0.1:8100"


async def _get(path: str):
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.get(f"{BASE}{path}")
        r.raise_for_status()
        return r.json()


async def _post(path: str, body: dict):
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(f"{BASE}{path}", json=body)
        r.raise_for_status()
        return r.json()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="bridge")
    parser.add_argument("--base", default=BASE)
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("health")
    sub.add_parser("tools")

    p_call = sub.add_parser("call")
    p_call.add_argument("tool")
    p_call.add_argument("args_json", nargs="?", default="{}")

    p_pre = sub.add_parser("prefetch")
    p_pre.add_argument("--case-id", default="CLI-TEST")
    p_pre.add_argument("--customer", default="")
    p_pre.add_argument("--subject", default="")
    p_pre.add_argument("--identifiers", default="")

    args = parser.parse_args(argv)
    global BASE
    BASE = args.base

    async def run():
        if args.cmd == "health":
            print(json.dumps(await _get("/health"), indent=2))
        elif args.cmd == "tools":
            print(json.dumps(await _get("/tools"), indent=2))
        elif args.cmd == "call":
            payload = {"tool": args.tool, "args": json.loads(args.args_json)}
            print(json.dumps(await _post("/call", payload), indent=2, default=str))
        elif args.cmd == "prefetch":
            idents = [x for x in args.identifiers.split(",") if x]
            print(
                json.dumps(
                    await _post(
                        "/prefetch/case",
                        {
                            "caseId": args.case_id,
                            "customer": args.customer,
                            "subject": args.subject,
                            "identifiers": idents,
                        },
                    ),
                    indent=2,
                    default=str,
                )
            )

    try:
        asyncio.run(run())
    except Exception as exc:  # noqa: BLE001
        print(f"error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
