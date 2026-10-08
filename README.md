# Executive Escalation System (EES)

EES is a Coinbase Support team under the Executive Escalation Support team, the highest level of support at Coinbase.

End-to-end case investigation: intake → evidence prefetch (Google via MCP bridge) → AI brief → copy-ready Slack update, customer email, case note, and resolution form.

## Quick start

```bash
cp .env.example .env
# optional: set AI_GATEWAY_API_KEY
docker compose up --build
```

- App: http://localhost:3000
- API: http://localhost:4000/health
- Bridge: http://localhost:8100/health

Google OAuth for the bridge reuses `~/.config/google-workspace-mcp/`.
