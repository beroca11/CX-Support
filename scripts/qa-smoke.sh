#!/usr/bin/env bash
# EES smoke: API contract + UI routes. Exits non-zero on the first hard failure.
set -u

API="${API:-http://localhost:4000}"
UI="${UI:-http://localhost:3000}"
fail=0

say() { printf '%s\n' "$*"; }

check() {
  local name="$1" ok="$2"
  if [[ "$ok" == "1" ]]; then
    say "PASS  $name"
  else
    say "FAIL  $name"
    fail=1
  fi
}

code() {
  curl -s -o /tmp/ees-qa-body -w '%{http_code}' "$@"
}

body() { cat /tmp/ees-qa-body; }

say "API $API"
say "UI  $UI"

h=$(code "$API/health")
check "GET /health 200" "$([[ "$h" == "200" && "$(body)" == *'"ok":true'* ]] && echo 1 || echo 0)"

h=$(code "$API/models")
check "GET /models 200" "$([[ "$h" == "200" ]] && echo 1 || echo 0)"

h=$(code "$API/mcp/status")
check "GET /mcp/status 200" "$([[ "$h" == "200" ]] && echo 1 || echo 0)"

h=$(code -X POST "$API/cases" -H 'content-type: application/json' \
  -d '{"title":"qa-bad","severity":"NotASeverity","caseType":"Billing"}')
check "POST /cases unknown severity 400" "$([[ "$h" == "400" ]] && echo 1 || echo 0)"

h=$(code -X POST "$API/cases" -H 'content-type: application/json' \
  -d '{"title":"QA smoke case","customer":"qa@example.com","severity":"Medium","caseType":"Service","summary":"Synthetic QA case. Do not treat as a customer fact."}')
id=$(body | python3 -c 'import json,sys; print(json.load(sys.stdin).get("case",{}).get("id",""))' 2>/dev/null || true)
check "POST /cases 201 id=$id" "$([[ "$h" == "201" && "$id" == EES-* ]] && echo 1 || echo 0)"

if [[ -n "$id" ]]; then
  h=$(code "$API/cases/$id")
  check "GET /cases/:id 200" "$([[ "$h" == "200" ]] && echo 1 || echo 0)"

  h=$(code -X POST "$API/cases/$id/notes" -H 'content-type: application/json' \
    -d '{"body":"QA note","author":"qa"}')
  check "POST note 201" "$([[ "$h" == "201" ]] && echo 1 || echo 0)"

  h=$(code -X PUT "$API/cases/$id/investigation" -H 'content-type: application/json' \
    -d '{"summary":"QA brief","facts":[{"text":"Synthetic","source":"user:qa"}],"timeline":[],"openQuestions":[],"rootCauseHypothesis":""}')
  check "PUT investigation 200" "$([[ "$h" == "200" ]] && echo 1 || echo 0)"

  h=$(code -X POST "$API/cases/$id/communications" -H 'content-type: application/json' \
    -d '{"channel":"slack","to":"#exec","subject":"","body":"QA slack draft","kind":"exec_slack"}')
  check "POST draft communication 201" "$([[ "$h" == "201" ]] && echo 1 || echo 0)"

  h=$(code -X PUT "$API/cases/$id/resolution" -H 'content-type: application/json' \
    -d '{"issueSummary":"QA issue","rootCause":"","resolutionSummary":"QA resolution","actionsTaken":["none"],"customerSummary":"QA","status":"Resolved"}')
  check "PUT resolution 200" "$([[ "$h" == "200" ]] && echo 1 || echo 0)"

  h=$(code -X POST "$API/cases/$id/ai/investigate")
  # 503 without a key, 200 with a key. Either is a live route. 500 is a bug.
  check "POST investigate not 500 (got $h)" "$([[ "$h" != "500" && "$h" != "000" ]] && echo 1 || echo 0)"
fi

h=$(code "$API/cases/EES-0000-0000")
check "GET missing case 404" "$([[ "$h" == "404" ]] && echo 1 || echo 0)"

h=$(code "$API/picklists")
check "GET /picklists 200" "$([[ "$h" == "200" ]] && echo 1 || echo 0)"

for path in / /cases/new /picklists /settings; do
  h=$(code "$UI$path")
  check "UI $path 200" "$([[ "$h" == "200" ]] && echo 1 || echo 0)"
done

if [[ -n "${id:-}" ]]; then
  h=$(code "$UI/cases/$id")
  check "UI /cases/$id 200" "$([[ "$h" == "200" ]] && echo 1 || echo 0)"
fi

if [[ "$fail" == "0" ]]; then
  say "SMOKE PASS"
  exit 0
fi
say "SMOKE FAIL"
exit 1
