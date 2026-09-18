# Stage 1: Build web app
FROM oven/bun:1.3.14-slim AS web-builder
WORKDIR /build/web
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY web/ ./
ENV VITE_API_URL=""
RUN bun run build

# Stage 2: Build API
FROM oven/bun:1.3.14-slim AS api-builder
WORKDIR /build/api
COPY api/package.json api/bun.lock ./
RUN bun install --frozen-lockfile
COPY api/ ./
RUN bun run build

# Stage 3: Runtime
FROM ubuntu:22.04

ARG S6_OVERLAY_VERSION=3.1.6.2
ARG LIVEKIT_VERSION=1.9.12
ARG TARGETARCH

ENV DEBIAN_FRONTEND=noninteractive

# Install PostgreSQL 16 (Bun is copied from the builder stage below)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates xz-utils gnupg lsb-release \
    && sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list' \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-16 \
    && rm -rf /var/lib/apt/lists/*

# Copy the Bun runtime from the builder stage
COPY --from=api-builder /usr/local/bin/bun /usr/local/bin/bun

# Install s6-overlay
RUN curl -fsSL "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz" | tar Jxf - -C / \
    && curl -fsSL "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-$(uname -m).tar.xz" | tar Jxf - -C /

# Install LiveKit server
RUN ARCH=$(case ${TARGETARCH:-$(dpkg --print-architecture)} in amd64) echo "amd64" ;; arm64) echo "arm64" ;; *) echo "amd64" ;; esac) \
    && curl -fsSL "https://github.com/livekit/livekit/releases/download/v${LIVEKIT_VERSION}/livekit_${LIVEKIT_VERSION}_linux_${ARCH}.tar.gz" | tar xzf - -C /usr/local/bin/ livekit-server

# Copy built applications
WORKDIR /app

COPY --from=api-builder /build/api/dist /app/api/dist
COPY --from=api-builder /build/api/node_modules /app/api/node_modules
COPY --from=api-builder /build/api/package.json /app/api/

COPY --from=web-builder /build/web/build /app/web/build
COPY --from=web-builder /build/web/node_modules /app/web/node_modules
COPY --from=web-builder /build/web/package.json /app/web/

# Custom web entrypoint with API + WebSocket proxy
COPY entrypoint-web.js /app/entrypoint-web.js

# Copy LiveKit config
COPY livekit.yaml /etc/livekit.yaml

# PostgreSQL init script - runs once on first boot
COPY <<'INITDB' /usr/local/bin/init-postgres.sh
#!/bin/bash
set -e
PG_DATA="/var/lib/postgresql/data"

if [ ! -f "$PG_DATA/PG_VERSION" ]; then
  echo "[postgres] Initializing database cluster..."
  mkdir -p "$PG_DATA"
  chown postgres:postgres "$PG_DATA"
  su - postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PG_DATA --auth=trust --no-locale --encoding=UTF8"

  # Start temporarily to create the lag database
  su - postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PG_DATA -l /tmp/pg_init.log start -w -o '-c listen_addresses=127.0.0.1 -c port=5432'"
  su - postgres -c "psql -c \"CREATE DATABASE lag;\""
  su - postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PG_DATA stop -w"
  echo "[postgres] Database initialized"
else
  echo "[postgres] Database already exists"
  chown -R postgres:postgres "$PG_DATA"
fi
INITDB
RUN chmod +x /usr/local/bin/init-postgres.sh

# s6 oneshot to init postgres before the longrun service starts
RUN mkdir -p /etc/s6-overlay/s6-rc.d/postgres-init \
    && echo "oneshot" > /etc/s6-overlay/s6-rc.d/postgres-init/type \
    && mkdir -p /etc/s6-overlay/s6-rc.d/postgres-init/dependencies.d \
    && mkdir -p /etc/s6-overlay/s6-rc.d/user/contents.d \
    && touch /etc/s6-overlay/s6-rc.d/user/contents.d/postgres-init
COPY <<'PGUP' /etc/s6-overlay/s6-rc.d/postgres-init/up
/usr/local/bin/init-postgres.sh
PGUP

# PostgreSQL longrun service
COPY s6/postgres /etc/s6-overlay/s6-rc.d/postgres
RUN echo "longrun" > /etc/s6-overlay/s6-rc.d/postgres/type \
    && mkdir -p /etc/s6-overlay/s6-rc.d/postgres/dependencies.d \
    && touch /etc/s6-overlay/s6-rc.d/postgres/dependencies.d/postgres-init \
    && touch /etc/s6-overlay/s6-rc.d/user/contents.d/postgres

# s6 oneshot to wait for postgres to be ready before API starts
RUN mkdir -p /etc/s6-overlay/s6-rc.d/postgres-ready \
    && echo "oneshot" > /etc/s6-overlay/s6-rc.d/postgres-ready/type \
    && mkdir -p /etc/s6-overlay/s6-rc.d/postgres-ready/dependencies.d \
    && touch /etc/s6-overlay/s6-rc.d/postgres-ready/dependencies.d/postgres \
    && touch /etc/s6-overlay/s6-rc.d/user/contents.d/postgres-ready
COPY <<'PGREADY' /etc/s6-overlay/s6-rc.d/postgres-ready/up
/usr/local/bin/wait-for-postgres.sh
PGREADY

COPY <<'PGWAIT' /usr/local/bin/wait-for-postgres.sh
#!/bin/bash
echo "[postgres] Waiting for PostgreSQL to be ready..."
for i in $(seq 1 30); do
  if su - postgres -c "pg_isready -h 127.0.0.1 -p 5432" > /dev/null 2>&1; then
    echo "[postgres] Ready"
    exit 0
  fi
  sleep 1
done
echo "[postgres] Timed out waiting for PostgreSQL"
exit 1
PGWAIT
RUN chmod +x /usr/local/bin/wait-for-postgres.sh

# LiveKit startup script - handles EXTERNAL_IP for NAT/local dev
COPY <<'LKSTART' /usr/local/bin/start-livekit.sh
#!/bin/bash
CONFIG="/tmp/livekit-runtime.yaml"

KEY="${LAG_VOICE_KEY:-devkey}"
SECRET="${LAG_VOICE_SECRET:-secret}"

if [ -n "$EXTERNAL_IP" ]; then
  USE_EXT="false"
  NODE_IP="  node_ip: $EXTERNAL_IP"
else
  USE_EXT="true"
  NODE_IP=""
fi

cat > "$CONFIG" <<YAML
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50200
  use_external_ip: $USE_EXT
$NODE_IP
keys:
  $KEY: $SECRET
logging:
  level: info
YAML

echo "[livekit] use_external_ip=$USE_EXT, node_ip=${EXTERNAL_IP:-auto}"
exec /usr/local/bin/livekit-server --config "$CONFIG"
LKSTART
RUN chmod +x /usr/local/bin/start-livekit.sh

# LiveKit longrun service
COPY s6/livekit /etc/s6-overlay/s6-rc.d/livekit
RUN echo "longrun" > /etc/s6-overlay/s6-rc.d/livekit/type \
    && touch /etc/s6-overlay/s6-rc.d/user/contents.d/livekit

# API startup script
COPY <<'APISTART' /usr/local/bin/start-api.sh
#!/bin/bash
exec /usr/local/bin/bun /app/api/dist/server.js
APISTART
RUN chmod +x /usr/local/bin/start-api.sh

# API longrun service (depends on postgres-ready + livekit)
COPY s6/api /etc/s6-overlay/s6-rc.d/api
RUN echo "longrun" > /etc/s6-overlay/s6-rc.d/api/type \
    && mkdir -p /etc/s6-overlay/s6-rc.d/api/dependencies.d \
    && touch /etc/s6-overlay/s6-rc.d/api/dependencies.d/postgres-ready \
    && touch /etc/s6-overlay/s6-rc.d/api/dependencies.d/livekit \
    && touch /etc/s6-overlay/s6-rc.d/user/contents.d/api

# Web longrun service (depends on api)
COPY s6/web /etc/s6-overlay/s6-rc.d/web
RUN echo "longrun" > /etc/s6-overlay/s6-rc.d/web/type \
    && touch /etc/s6-overlay/s6-rc.d/user/contents.d/web

# Environment defaults
ENV NODE_ENV=production
ENV API_PORT=3001
ENV PORT=3000
ENV DATABASE_URL=postgres://postgres@127.0.0.1:5432/lag
ENV VOICE_URL=ws://localhost:7880
ENV GUEST_ENABLED=false
ENV SESSION_IDLE_SECONDS=604800
ENV SESSION_ABSOLUTE_SECONDS=2592000
ENV OAUTH_TRANSACTION_SECONDS=600

EXPOSE 3000 7880 7881
EXPOSE 50000-50200/udp

VOLUME ["/var/lib/postgresql/data"]

ENTRYPOINT ["/init"]
