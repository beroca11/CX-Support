#!/usr/bin/env python3
"""Ask before Docker commands that delete EES volumes or unused data."""

import json
import sys


def emit(payload):
    sys.stdout.write(json.dumps(payload) + "\n")


def destructive(command):
    text = command.lower()
    if "docker" not in text:
        return False
    wipes_volumes = ("down" in text) and ("-v" in text or "--volumes" in text)
    prunes = any(
        token in text
        for token in (
            "volume rm",
            "volume prune",
            "system prune",
            "compose rm",
            "container prune",
        )
    )
    return wipes_volumes or prunes


def main():
    raw = sys.stdin.read()
    try:
        data = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        emit({"permission": "allow"})
        return

    command = data.get("command") or ""
    if not destructive(command):
        emit({"permission": "allow"})
        return

    emit(
        {
            "permission": "ask",
            "user_message": "This Docker command can delete the EES database volume. Confirm before it runs.",
            "agent_message": "EES held a destructive Docker command. Use `docker compose down` without `-v` unless the user wants the database removed.",
        }
    )


if __name__ == "__main__":
    try:
        main()
    except Exception:
        emit({"permission": "allow"})
