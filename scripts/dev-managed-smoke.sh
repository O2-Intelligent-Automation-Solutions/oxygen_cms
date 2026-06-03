#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:3000}"

require_json_field() {
  local body="$1"
  local expr="$2"
  python3 - "$body" "$expr" <<'PY'
import json, sys
body, expr = sys.argv[1], sys.argv[2]
data = json.loads(body)
cur = data
for part in expr.split('.'):
    cur = cur[part]
print(cur)
PY
}

post_json() {
  local path="$1"
  curl -fsS \
    -X POST \
    -H 'Content-Type: application/json' \
    -d '{}' \
    "$API_BASE$path"
}

get_json() {
  local path="$1"
  curl -fsS "$API_BASE$path"
}

echo "Checking setup deployment capability..."
deployment="$(get_json /api/setup/deployment)"
echo "$deployment"
managed="$(require_json_field "$deployment" managedMysql)"
if [ "$managed" != "True" ] && [ "$managed" != "true" ]; then
  echo "API is not running in managed MySQL mode." >&2
  exit 1
fi

echo
echo "Provisioning managed database..."
provision="$(post_json /api/setup/database/provision-managed)"
echo "$provision"

next_step="$(require_json_field "$provision" nextStep)"
if [ "$next_step" != "schema" ]; then
  echo "Expected nextStep=schema after provisioning; got $next_step" >&2
  exit 1
fi

echo
echo "Applying schema..."
schema="$(post_json /api/setup/database/apply-schema)"
echo "$schema"

next_step="$(require_json_field "$schema" nextStep)"
if [ "$next_step" != "admin" ]; then
  echo "Expected nextStep=admin after schema apply; got $next_step" >&2
  exit 1
fi

echo
echo "Final setup status:"
get_json /api/setup/status
echo

echo "Managed setup smoke test passed."
