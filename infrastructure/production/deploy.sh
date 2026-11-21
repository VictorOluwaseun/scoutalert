#!/bin/bash
# Execute on the initialized full-beta host as root via SSM. Infrastructure and
# runtime secrets remain host-managed. Schema changes must be backward compatible.
set -Eeuo pipefail
umask 077

manifest=$(realpath "${1:?Supply the release images.env}")
deployment_root=${SCOUTALERT_DEPLOY_DIR:-/opt/scoutalert}
cd "$deployment_root"
exec 9>"$deployment_root/deploy.lock"
flock -n 9 || { echo 'Another production deployment is running.' >&2; exit 1; }
source ./host.env
export AWS_REGION
test -s .env
test -s "$manifest"

release_dir=$(dirname "$manifest")
previous_env="$release_dir/previous.env"
candidate_env="$release_dir/candidate.env"
cp .env "$previous_env"

# Preserve every existing host setting, replacing only the three image references.
python3 - "$manifest" .env "$candidate_env" <<'PY'
from pathlib import Path
import re
import sys

updates = dict(line.split('=', 1) for line in Path(sys.argv[1]).read_text().splitlines())
expected = {f'SCOUTALERT_{service}_IMAGE' for service in ('API', 'WEB', 'WORKER')}
if set(updates) != expected:
    raise ValueError('Release must contain exactly the three application images')
for key, value in updates.items():
    service = key.split('_')[1].lower()
    pattern = rf'109837541388\.dkr\.ecr\.eu-north-1\.amazonaws\.com/scoutalert/{service}@sha256:[0-9a-f]{{64}}'
    if not re.fullmatch(pattern, value):
        raise ValueError(f'Invalid image for {key}')
lines = [line for line in Path(sys.argv[2]).read_text().splitlines() if line.split('=', 1)[0] not in expected]
lines.extend(f'{key}={value}' for key, value in updates.items())
Path(sys.argv[3]).write_text('\n'.join(lines) + '\n')
PY

compose=(docker compose -f "$deployment_root/compose.yaml")
candidate=("${compose[@]}" --env-file "$candidate_env")
"${candidate[@]}" config --quiet
# Fail before downtime unless the existing API/web and supporting services run.
for service in api web caddy postgres redis temporal; do
  test -n "$("${compose[@]}" ps --status running -q "$service")" || {
    echo "Required production service is not running: $service" >&2
    exit 1
  }
done
worker_was_running=false
test -z "$("${compose[@]}" ps --status running -q worker)" || worker_was_running=true

aws ecr get-login-password --region "$AWS_REGION" |
  docker login --username AWS --password-stdin 109837541388.dkr.ecr.eu-north-1.amazonaws.com
"${candidate[@]}" pull api web worker
bash ./backup.sh

# Restore application images on any failure after downtime begins. Applied database
# migrations are deliberately never reversed; expand/contract changes are required.
rollback() {
  local result=$?
  trap - ERR
  set +e
  echo 'Deployment failed; restoring previous application images.' >&2
  if [ "$worker_was_running" = true ]; then
    "${compose[@]}" stop worker
  fi
  cp "$previous_env" .env.restore
  mv .env.restore .env
  "${compose[@]}" up -d --no-deps --wait --wait-timeout 180 api web
  if [ "$worker_was_running" = true ]; then
    "${compose[@]}" up -d --no-deps worker
  fi
  echo 'Check production health and SSM output before retrying.' >&2
  exit "$result"
}
trap rollback ERR

if [ "$worker_was_running" = true ]; then
  "${compose[@]}" stop worker
fi
"${compose[@]}" stop web api
"${candidate[@]}" run --rm --no-deps migrate
cp "$candidate_env" .env.next
mv .env.next .env
"${compose[@]}" up -d --no-deps --wait --wait-timeout 180 api web

if [ "$worker_was_running" = true ]; then
  "${compose[@]}" up -d --no-deps worker
  worker_id=$("${compose[@]}" ps -q worker)
  worker_started=$(docker inspect --format '{{.State.StartedAt}}' "$worker_id")
  # The worker has no HTTP health endpoint. Require its all-queues startup marker
  # from this start, plus a running state and zero restarts.
  timeout 120 bash -c '
    until docker logs --since "$2" "$1" 2>&1 | grep -q "Production SMTP email configured"; do
      sleep 3
    done
  ' _ "$worker_id" "$worker_started"
  test "$(docker inspect --format '{{.State.Running}} {{.RestartCount}}' "$worker_id")" = 'true 0'
fi

# Exercise the local TLS edge without depending on DNS propagation or external routing.
site_host=$(sed -n 's/^SCOUTALERT_HOST=//p' .env)
site_host=${site_host:-scoutalert.app}
curl --fail --silent --show-error --retry 5 --retry-delay 3 --retry-all-errors \
  --connect-timeout 5 --max-time 15 --resolve "$site_host:443:127.0.0.1" "https://$site_host/" > /dev/null
trap - ERR
printf '%s\n' "$release_dir" > "$deployment_root/current-release"
echo 'Application deployment and health checks passed.'
