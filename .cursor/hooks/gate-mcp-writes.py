#!/usr/bin/env python3
"""Ask before EES-related MCP tools send or write outside the repo."""

import json
import sys

ASK = {
    "send_gmail_message": "This sends Gmail immediately.",
    "send_message": "This sends a Google Workspace message.",
    "slack_send_message": "This posts to Slack immediately.",
    "modify_sheet_values": "This writes Google Sheet cells, including picklists.",
    "modify_doc_text": "This edits a Google Doc.",
    "create_doc": "This creates a Google Doc.",
    "create_drive_file": "This creates a Drive file.",
    "create_drive_folder": "This creates a Drive folder.",
    "create_spreadsheet": "This creates a Google Sheet.",
    "import_to_google_doc": "This imports a file into Google Docs.",
    "import_to_google_sheets": "This imports a file into Google Sheets.",
    "import_to_google_slides": "This imports a file into Google Slides.",
    "run_script_function": "This runs an Apps Script function.",
    "manage_script_content": "This changes an Apps Script project.",
}


def emit(payload):
    sys.stdout.write(json.dumps(payload) + "\n")


def main():
    raw = sys.stdin.read()
    try:
        data = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        emit(
            {
                "permission": "ask",
                "user_message": "The MCP call could not be parsed. Review it before it runs.",
                "agent_message": "EES MCP hook could not parse this call. Wait for approval.",
            }
        )
        return

    tool = data.get("tool_name") or ""
    reason = ASK.get(tool)
    if not reason:
        emit({"permission": "allow"})
        return

    emit(
        {
            "permission": "ask",
            "user_message": f"{reason} Confirm the exact content before continuing.",
            "agent_message": (
                f"EES held {tool} for confirmation. Keep the draft in the case. "
                "Do not retry until the user approves this call."
            ),
        }
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        emit(
            {
                "permission": "deny",
                "user_message": "The EES MCP hook failed closed, so this call was blocked.",
                "agent_message": f"MCP hook error: {exc}",
            }
        )
