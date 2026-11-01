#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_DIR=$(cd "$SCRIPT_DIR/.." && pwd)

SERVER_HOST=${SERVER_HOST:-180.76.135.161}
SERVER_USER=${SERVER_USER:-root}
SSH_KEY=${SSH_KEY:-$HOME/.ssh/copilot_bt_server}
REMOTE_APP_DIR=${REMOTE_APP_DIR:-/www/wwwroot/vcat-server}
COMPOSE_PROJECT=${COMPOSE_PROJECT:-vcat-server}
PUBLIC_HEALTH_URL=${PUBLIC_HEALTH_URL:-http://$SERVER_HOST/api/health}

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
TEMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/vcat-server.XXXXXX")
ARCHIVE="$TEMP_DIR/vcat-server.tar.gz"
REMOTE_ARCHIVE="/tmp/vcat-server-$TIMESTAMP.tar.gz"
SSH_TARGET="$SERVER_USER@$SERVER_HOST"
SSH_ARGS=(-i "$SSH_KEY" -o BatchMode=yes)

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

for command_name in npm tar scp ssh curl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name" >&2
    exit 1
  fi
done

if [[ ! -f "$SSH_KEY" ]]; then
  echo "SSH key not found: $SSH_KEY" >&2
  exit 1
fi

if [[ ! -f "$PROJECT_DIR/docker-compose.prod.yml" ]]; then
  echo "docker-compose.prod.yml not found in $PROJECT_DIR" >&2
  exit 1
fi

echo "[1/7] Running local build and tests"
cd "$PROJECT_DIR"
npm run build
npm test -- --runInBand
npm run test:e2e

echo "[2/7] Creating deployment archive"
tar \
  --exclude='./.env' \
  --exclude='./node_modules' \
  --exclude='./dist' \
  --exclude='./coverage' \
  --exclude='./.git' \
  --exclude='./*.log' \
  -czf "$ARCHIVE" \
  .

echo "[3/7] Uploading deployment archive"
scp "${SSH_ARGS[@]}" "$ARCHIVE" "$SSH_TARGET:$REMOTE_ARCHIVE"

echo "[4/7] Validating and building on the server"
ssh "${SSH_ARGS[@]}" "$SSH_TARGET" bash -s -- \
  "$REMOTE_APP_DIR" \
  "$REMOTE_ARCHIVE" \
  "$COMPOSE_PROJECT" <<'REMOTE_SCRIPT'
set -Eeuo pipefail

APP_DIR=$1
REMOTE_ARCHIVE=$2
COMPOSE_PROJECT=$3
NEXT_DIR=""

cleanup_remote() {
  rm -f "$REMOTE_ARCHIVE"
  if [[ -n "$NEXT_DIR" && -d "$NEXT_DIR" ]]; then
    rm -rf "$NEXT_DIR"
  fi
}
trap cleanup_remote EXIT

if [[ ! -f "$APP_DIR/.env" ]]; then
  echo "Production environment file not found: $APP_DIR/.env" >&2
  exit 1
fi

NEXT_DIR=$(mktemp -d "${APP_DIR}-next.XXXXXX")
tar -xzf "$REMOTE_ARCHIVE" -C "$NEXT_DIR"
cp "$APP_DIR/.env" "$NEXT_DIR/.env"
chmod 600 "$NEXT_DIR/.env"

cd "$NEXT_DIR"
docker compose \
  -p "$COMPOSE_PROJECT" \
  --env-file .env \
  -f docker-compose.prod.yml \
  config --quiet

docker compose \
  -p "$COMPOSE_PROJECT" \
  --env-file .env \
  -f docker-compose.prod.yml \
  build

BACKUP_DIR="${APP_DIR}-backup-$(date +%Y%m%d-%H%M%S)"
mv "$APP_DIR" "$BACKUP_DIR"

if ! mv "$NEXT_DIR" "$APP_DIR"; then
  mv "$BACKUP_DIR" "$APP_DIR"
  echo "Failed to activate the new release; source directory restored" >&2
  exit 1
fi
NEXT_DIR=""

cd "$APP_DIR"
docker compose \
  -p "$COMPOSE_PROJECT" \
  --env-file .env \
  -f docker-compose.prod.yml \
  up -d --no-build

echo "Source backup: $BACKUP_DIR"
REMOTE_SCRIPT

echo "[5/7] Waiting for application health"
health_ok=false
for attempt in {1..15}; do
  if ssh "${SSH_ARGS[@]}" "$SSH_TARGET" \
    "curl -fsS http://127.0.0.1:3000/api/health >/dev/null"; then
    health_ok=true
    break
  fi
  sleep 2
done

if [[ "$health_ok" != true ]]; then
  echo "Application health check failed" >&2
  ssh "${SSH_ARGS[@]}" "$SSH_TARGET" \
    "cd '$REMOTE_APP_DIR' && docker compose -p '$COMPOSE_PROJECT' --env-file .env -f docker-compose.prod.yml logs --tail=100 app migration" || true
  exit 1
fi

echo "[6/7] Checking container status"
ssh "${SSH_ARGS[@]}" "$SSH_TARGET" \
  "cd '$REMOTE_APP_DIR' && docker compose -p '$COMPOSE_PROJECT' --env-file .env -f docker-compose.prod.yml ps -a"

echo "[7/7] Checking public health endpoint"
curl --max-time 15 -fsS "$PUBLIC_HEALTH_URL"
printf '\nDeployment completed successfully: %s\n' "$PUBLIC_HEALTH_URL"