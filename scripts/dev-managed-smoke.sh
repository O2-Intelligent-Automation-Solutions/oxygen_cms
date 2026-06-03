#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:3000}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-120}"

python3 - "$API_BASE_URL" "$TIMEOUT_SECONDS" <<'PY'
import json
import sys
import time
import urllib.error
import urllib.request

base_url = sys.argv[1].rstrip('/')
timeout_seconds = int(sys.argv[2])

def request(method, path):
    url = f'{base_url}{path}'
    data = b'{}' if method == 'POST' else None
    req = urllib.request.Request(url, data=data, method=method, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=5) as response:
        body = response.read().decode('utf-8')
        return response.status, json.loads(body) if body else None

def wait_for_api():
    deadline = time.time() + timeout_seconds
    last_error = None
    while time.time() < deadline:
        try:
            status, payload = request('GET', '/api/setup/status')
            if status == 200:
                return payload
        except Exception as exc:  # noqa: BLE001 - CLI smoke output should show the last connection problem.
            last_error = exc
        time.sleep(2)
    raise SystemExit(f'API did not become ready within {timeout_seconds}s. Last error: {last_error}')

def print_json(label, payload):
    print(f'\n{label}:')
    print(json.dumps(payload, indent=2, sort_keys=True))

print(f'Checking OxyGen CMS managed setup API at {base_url}...')
status_payload = wait_for_api()
print_json('Initial setup status', status_payload)

_, deployment = request('GET', '/api/setup/deployment')
print_json('Deployment capability', deployment)
if deployment.get('mode') != 'self-contained' or deployment.get('managedMysql') is not True:
    raise SystemExit('Expected self-contained managed MySQL deployment capability.')

_, provision = request('POST', '/api/setup/database/provision-managed')
print_json('Managed database provision result', provision)
if provision.get('ok') is not True:
    raise SystemExit('Managed database provisioning failed.')

_, schema = request('POST', '/api/setup/database/apply-schema')
print_json('Schema apply result', schema)
if schema.get('ok') is not True:
    raise SystemExit('Schema application failed.')

_, final_status = request('GET', '/api/setup/status')
print_json('Final setup status', final_status)
database = final_status.get('database') or {}
if database.get('configured') is not True or database.get('connected') is not True or database.get('schemaCurrent') is not True:
    raise SystemExit('Database is not configured, connected, and schema-current after smoke test.')

print('\nManaged setup smoke test passed.')
PY
