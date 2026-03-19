#!/usr/bin/env bash
set -euo pipefail

IMAGE="${LAG_IMAGE:-ghcr.io/trylag/lag:latest}"
NAME="${LAG_NAME:-lag}"
ACTION="${1:-up}"

run_container() {
  podman run -d --name "$NAME" \
    -p 3000:3000 \
    -p 7880:7880 \
    -p 7881:7881 \
    -p 50000-50200:50000-50200/udp \
    -v lag_data:/var/lib/postgresql/data \
    -e SESSION_SECRET="${SESSION_SECRET:-}" \
    -e EXTERNAL_IP="${EXTERNAL_IP:-}" \
    -e LAG_VOICE_KEY="${LAG_VOICE_KEY:-devkey}" \
    -e LAG_VOICE_SECRET="${LAG_VOICE_SECRET:-secret}" \
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
    podman stop "$NAME" 2>/dev/null || true
    podman rm "$NAME" 2>/dev/null || true
    ;;
  restart)
    "$0" down
    "$0" up
    ;;
  logs)
    podman logs -f "$NAME"
    ;;
  build)
    echo "Building from source..."
    podman build -t lag .
    LAG_IMAGE=lag "$0" up
    ;;
  backup)
    BACKUP_FILE="${2:-backup-$(date +%Y%m%d-%H%M%S).sql}"
    podman exec "$NAME" su - postgres -c "pg_dump lag" > "$BACKUP_FILE"
    echo "Backup saved to $BACKUP_FILE"
    ;;
  restore)
    if [ -z "${2:-}" ]; then
      echo "Usage: $0 restore <file.sql>"
      exit 1
    fi
    podman exec -i "$NAME" su - postgres -c "psql lag" < "$2"
    echo "Restored from $2"
    ;;
  nuke)
    echo "Removing Lag and all data..."
    podman stop "$NAME" 2>/dev/null || true
    podman rm "$NAME" 2>/dev/null || true
    podman volume rm lag_data 2>/dev/null || true
    echo "Done"
    ;;
  status)
    podman ps -a --filter "name=$NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    ;;
  shell)
    podman exec -it "$NAME" bash
    ;;
  *)
    echo "Usage: $0 {up|down|restart|logs|build|backup|restore|nuke|status|shell}"
    exit 1
    ;;
esac
