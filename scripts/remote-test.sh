#!/bin/bash
BASE="http://127.0.0.1:3002"
LOGIN=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"pin":"1234"}')
TOKEN=$(echo "$LOGIN" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then echo "LOGIN_FAIL"; echo "$LOGIN"; exit 1; fi
END=$(date -u +%Y-%m-%d)
START=$(date -u -d "7 days ago" +%Y-%m-%d 2>/dev/null || date -u -v-7d +%Y-%m-%d 2>/dev/null)
if [ -z "$START" ]; then START="2026-03-06"; fi
STATS=$(curl -s "$BASE/api/dashboard/stats?dateFrom=$START&dateTo=$END" -H "Authorization: Bearer $TOKEN")
echo "DASHBOARD_STATS: $STATS"
ORDER_ID=$(docker exec postgres psql -U postgres -d limonpos -t -A -c "SELECT id FROM \"Order\" ORDER BY created_at DESC LIMIT 1;" 2>/dev/null | tr -d '\r')
if [ -n "$ORDER_ID" ]; then
  ORDER=$(curl -s "$BASE/api/orders/$ORDER_ID" -H "Authorization: Bearer $TOKEN")
  ITEMS=$(echo "$ORDER" | grep -o '"items":\[[^]]*\]' | head -1)
  echo "ORDER_ITEMS_COUNT: $(echo "$ORDER" | grep -o '"items":\[' | wc -l)"
  echo "ORDER_SAMPLE: ${ORDER:0:500}"
fi
echo "OK"
