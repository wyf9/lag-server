# Repository Context

## Purpose

This repository is an independently maintained fork of a small self-hosted voice and chat application. It favors a simple, single-container deployment over distributed scaling. It is not the upstream hosted service. Fork ownership, canonical repository URL, image registry, maintainer identity, and private security contact are intentionally unresolved placeholders documented in `README.md`.

## Runtime architecture

The production image runs four long-lived services under s6-overlay:

1. `entrypoint-web.js` listens on public TCP `3000`, serves the built SvelteKit app through an internal Node server on `3002`, and proxies `/api/*` plus WebSocket upgrades to Fastify on `3001`.
2. Fastify provides external-provider and optional nickname guest sessions, rooms, messages, authorization, presence over WebSocket, and LiveKit access tokens.
3. PostgreSQL 16 stores users, rooms, participants, and messages under `/var/lib/postgresql/data`.
4. LiveKit listens on TCP `7880-7881` and UDP `50000-50200` for signaling and media.

The API auto-applies its schema at startup. The all-in-one image assumes local loopback links among services. `docker-compose.yml` persists only PostgreSQL data in `lag_data`.

## Trust and identity model

- The API supports one configured provider: Prism-flavored OIDC, standard OIDC, or explicit-endpoint OAuth 2.0. It maps external `(provider, issuer, subject)` identities to local users and stores opaque, hashed server-side sessions in PostgreSQL.
- Optional `POST /api/session` nickname guests are controlled by `GUEST_ENABLED` and disabled by default. WebSockets authenticate with the session cookie.
- Rooms implement owner/moderator/speaker/listener roles, visibility, guest admission, invitations, bans, ownership transfer, history visibility, retention, and LiveKit publish grants. A `platform_admin` grant bypasses room owner/moderator checks.
- The first new external identity receives a bootstrap `platform_admin` grant; later grants may be created by an exact configured claim match. When `PRISM_TEAM_ID` is configured, Prism team owners and co-owners receive a dynamic platform-administrator grant.
- A reverse proxy may gate access but proxy identity headers do not create a Lag identity. `PROXY_HEADER` affects recorded client IP only.

## Important boundaries

- `web/`: SvelteKit/Svelte 5 client and Node adapter output.
- `api/`: Fastify 5 API, Drizzle schema, session signing, WebSocket state, and LiveKit token issuance.
- `s6/`, `Dockerfile`, `entrypoint-web.js`, `livekit.yaml`: all-in-one runtime and process wiring.
- `scripts/`, `docker-compose.yml`: convenience deployment paths. Their inherited default image is not yet the canonical image for this fork.
- `docs/`: bilingual VitePress operator/developer documentation and its separate Bun toolchain.

## Operational invariants

- `LAG_VOICE_KEY` and `LAG_VOICE_SECRET` must match between API token issuance and LiveKit runtime generation.
- Sessions are opaque database records with idle and absolute expiry; secure cookies require HTTPS. `SESSION_SECRET` remains part of inherited deployment files but is not consumed by the current session implementation.
- Remote RTC requires an externally reachable address and correct TCP/UDP firewall/NAT rules; HTTPS alone does not carry LiveKit UDP media.
- PostgreSQL is the durable source of truth. In-memory WebSocket connection/subscription state is lost on API restart and is not shared across replicas.
- The current topology is not horizontally scalable without redesigning state, database/service topology, and LiveKit routing.

## Documentation rule

Document observed behavior separately from proposed integrations. Never present an unimplemented environment variable, role, identity claim, endpoint, image, repository, contact, or scaling property as available. Use explicit `<PLACEHOLDER>` values until maintainers decide them. Keep English and Chinese pages equivalent in meaning.
