#!/bin/bash
# Run inside backend container or on host with curl
BASE="${1:-http://127.0.0.1:3002}"
echo '{"pin":"1234"}' > /tmp/login.json
LOGIN=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d @/tmp/login.json)
echo "LOGIN_RESPONSE: $LOGIN"
TOKEN=$(echo "$LOGIN" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [ -z "$TOKEN" ]; then echo "NO_TOKEN"; exit 1; fi
END=$(date -u +%Y-%m-%d)
START=$(date -u -d "7 days ago" +%Y-%m-%d 2>/dev/null || date -u -v-7d +%Y-%m-%d 2>/dev/null)
[ -z "$START" ] && START="2026-03-06"
STATS=$(curl -s "$BASE/api/dashboard/stats?dateFrom=$START&dateTo=$END" -H "Authorization: Bearer $TOKEN")
echo "STATS: $STATS"
echo "OK"
