# Deployment and networking

## Start from the published image

`compose.yml` pulls the published image `ghcr.io/wyf9/lag-server:latest` by default. Pin a release tag or digest for production rather than relying on `latest`:

```bash
# First supply ALLOWED_HOSTS, AUTH_PROVIDER, AUTH_CLIENT_ID, and
# provider-specific values through your deployment environment.
docker compose up -d
docker compose ps
curl --fail http://localhost:3000/api/health
```

## Build from local source

To build the checked-out source instead of pulling the published image, rename `compose-build.override.yml` to `compose.override.yml`. Docker Compose merges it automatically and builds the local image:

```bash
mv compose-build.override.yml compose.override.yml
docker compose up -d --build
```

Remove `compose.override.yml` to go back to the published image.

Persist `/var/lib/postgresql/data` on durable storage. The bundled topology is intended for one container, not Kubernetes-style independent replicas. The checked-in Compose files are not a complete production configuration and currently omit required authentication values.

## Port map

| Port | Protocol | Exposure | Purpose |
| --- | --- | --- | --- |
| `3000` | TCP | Public or behind HTTPS proxy | Web UI, REST API, `/api/ws` |
| `3001` | TCP | Internal only | Fastify API |
| `3002` | TCP | Internal only | SvelteKit server |
| `5432` | TCP | Internal only | Bundled PostgreSQL |
| `7880` | TCP | Client reachable | LiveKit signaling/API |
| `7881` | TCP | Client reachable | LiveKit RTC TCP fallback |
| `50000-50200` | UDP | Client reachable | LiveKit RTC media |

## NAT and firewall

Set `EXTERNAL_IP` to the address clients can reach. Forward TCP `7880-7881` and the full UDP range `50000-50200` to the container host. Avoid mapping only HTTP: signaling can succeed while media remains silent if UDP is blocked. Carrier-grade NAT or restrictive corporate networks may require a TURN design, which this repository does not bundle or document as implemented.

## TLS and reverse proxy

Terminate HTTPS for port `3000`, including WebSocket upgrades for `/api/ws`. Preserve host/origin behavior and use long enough idle timeouts for WebSockets. Do not expose `3001` as a second public API path.

LiveKit also needs a client-reachable secure signaling design when the site is served over HTTPS; browsers may block insecure `ws://` mixed content. The current bundled defaults are development-oriented. Validate the exact public URL, certificates, signaling path, and media ports from an off-site browser before launch.

## Scaling limits

Do not run multiple all-in-one replicas against copied volumes. WebSocket presence is in memory, PostgreSQL is bundled, and LiveKit node routing is not coordinated. High availability or horizontal scaling requires an architectural change and deployment-specific testing.
