#!/usr/bin/env bash
set -euo pipefail

IMAGE="${LAG_IMAGE:-ghcr.io/wyf9/lag-server:latest}"
NAME="${LAG_NAME:-lag}"
ACTION="${1:-up}"

run_container() {
  local optional_env=()
  [ -n "${PROXY_HEADER:-}" ] && optional_env+=(-e "PROXY_HEADER=$PROXY_HEADER")
  [ -n "${AUTH_ADMIN_CLAIM_PATH:-}" ] && optional_env+=(-e "AUTH_ADMIN_CLAIM_PATH=$AUTH_ADMIN_CLAIM_PATH")
  [ -n "${AUTH_ADMIN_CLAIM_VALUE:-}" ] && optional_env+=(-e "AUTH_ADMIN_CLAIM_VALUE=$AUTH_ADMIN_CLAIM_VALUE")
  [ -n "${OIDC_ISSUER:-}" ] && optional_env+=(-e "OIDC_ISSUER=$OIDC_ISSUER")
  [ -n "${PRISM_ISSUER:-}" ] && optional_env+=(-e "PRISM_ISSUER=$PRISM_ISSUER")

  nerdctl run -d --name "$NAME" \
    -p "${LAG_BIND_ADDRESS:-127.0.0.1}:3000:3000" \
    -p "${LAG_BIND_ADDRESS:-127.0.0.1}:7880:7880" \
    -p "${LAG_BIND_ADDRESS:-127.0.0.1}:7881:7881" \
    -p "${LAG_BIND_ADDRESS:-127.0.0.1}:50000-50200:50000-50200/udp" \
    -v lag_data:/var/lib/postgresql/data \
    -e ALLOWED_HOSTS="${ALLOWED_HOSTS:-http://localhost:3000}" \
    -e AUTH_PROVIDER="${AUTH_PROVIDER:-oauth2}" \
    -e AUTH_PROVIDER_LABEL="${AUTH_PROVIDER_LABEL:-Development OAuth}" \
    -e AUTH_CLIENT_ID="${AUTH_CLIENT_ID:-insecure-development-client}" \
    -e AUTH_CLIENT_SECRET="${AUTH_CLIENT_SECRET:-insecure-development-secret}" \
    -e AUTH_SCOPES="${AUTH_SCOPES:-profile email}" \
    -e AUTH_PKCE="${AUTH_PKCE:-required}" \
    -e OAUTH_AUTHORIZATION_ENDPOINT="${OAUTH_AUTHORIZATION_ENDPOINT:-https://provider.example.invalid/oauth/authorize}" \
    -e OAUTH_TOKEN_ENDPOINT="${OAUTH_TOKEN_ENDPOINT:-https://provider.example.invalid/oauth/token}" \
    -e OAUTH_USERINFO_ENDPOINT="${OAUTH_USERINFO_ENDPOINT:-https://provider.example.invalid/api/user}" \
    -e OAUTH_SUBJECT_PATH="${OAUTH_SUBJECT_PATH:-id}" \
    -e OAUTH_NAME_PATH="${OAUTH_NAME_PATH:-name}" \
    -e OAUTH_EMAIL_PATH="${OAUTH_EMAIL_PATH:-email}" \
    -e OAUTH_AVATAR_PATH="${OAUTH_AVATAR_PATH:-avatar_url}" \
    -e PRISM_TEAM_CLAIM_PATH="${PRISM_TEAM_CLAIM_PATH:-teams}" \
    -e PRISM_TEAM_ID_PATH="${PRISM_TEAM_ID_PATH:-id}" \
    -e PRISM_TEAM_ROLE_PATH="${PRISM_TEAM_ROLE_PATH:-role}" \
    -e PRISM_OWNER_ROLES="${PRISM_OWNER_ROLES:-owner,co-owner}" \
    -e PRISM_TEAM_ID="${PRISM_TEAM_ID:-}" \
    -e GUEST_ENABLED="${GUEST_ENABLED:-true}" \
    -e SESSION_IDLE_SECONDS="${SESSION_IDLE_SECONDS:-604800}" \
    -e SESSION_ABSOLUTE_SECONDS="${SESSION_ABSOLUTE_SECONDS:-2592000}" \
    -e OAUTH_TRANSACTION_SECONDS="${OAUTH_TRANSACTION_SECONDS:-600}" \
    -e EXTERNAL_IP="${EXTERNAL_IP:-127.0.0.1}" \
    -e LAG_VOICE_KEY="${LAG_VOICE_KEY:-devkey}" \
    -e LAG_VOICE_SECRET="${LAG_VOICE_SECRET:-secret}" \
    -e VOICE_URL="${VOICE_URL:-ws://localhost:7880}" \
    "${optional_env[@]}" \
    "$IMAGE"
}

case "$ACTION" in
  up)
    echo "Starting Lag..."
    run_container
    echo "Lag is running at http://localhost:3000"
    ;;
  down)
    echo "Stopping Lag..."
    nerdctl stop "$NAME" 2>/dev/null || true
    nerdctl rm "$NAME" 2>/dev/null || true
    ;;
  restart)
    "$0" down
    "$0" up
    ;;
  logs)
    nerdctl logs -f "$NAME"
    ;;
  build)
    echo "Building from source..."
    nerdctl build -t lag .
    LAG_IMAGE=lag "$0" up
    ;;
  backup)
    BACKUP_FILE="${2:-backup-$(date +%Y%m%d-%H%M%S).sql}"
    nerdctl exec "$NAME" su - postgres -c "pg_dump lag" > "$BACKUP_FILE"
    echo "Backup saved to $BACKUP_FILE"
    ;;
  restore)
    if [ -z "${2:-}" ]; then
      echo "Usage: $0 restore <file.sql>"
      exit 1
    fi
    nerdctl exec -i "$NAME" su - postgres -c "psql lag" < "$2"
    echo "Restored from $2"
    ;;
  nuke)
    echo "Removing Lag and all data..."
    nerdctl stop "$NAME" 2>/dev/null || true
    nerdctl rm "$NAME" 2>/dev/null || true
    nerdctl volume rm lag_data 2>/dev/null || true
    echo "Done"
    ;;
  status)
    nerdctl ps -a --filter "name=$NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    ;;
  shell)
    nerdctl exec -it "$NAME" bash
    ;;
  *)
    echo "Usage: $0 {up|down|restart|logs|build|backup|restore|nuke|status|shell}"
    exit 1
    ;;
esac
