# Architecture and context

## Request flow

```text
Browser
  | HTTP + /api/ws WebSocket
  v
Node gateway :3000
  |-- pages/assets --> SvelteKit Node server :3002
  `-- /api/* -------> Fastify :3001 ------> PostgreSQL :5432
                              `-----------> LiveKit token signing

Browser <------ LiveKit signaling TCP :7880 / :7881
Browser <---------- LiveKit media UDP :50000-50200
```

s6-overlay supervises PostgreSQL, LiveKit, API, and web processes. PostgreSQL initialization and migrations precede API startup. The gateway exposes the UI and API on one origin; API and database ports are internal to the container by default.

## Data and state

PostgreSQL stores users, external identities, opaque sessions, OAuth transactions, role grants, room policy/membership, invitations/bans, audit events, and messages. The `lag_data` volume holds database files; inherited image startup may also create a `.session_secret`, but current opaque sessions do not use it. WebSocket connections and subscriptions are process memory, so they disappear on restart and are not shared among API replicas.

LiveKit carries realtime voice/media. The API signs short-lived participant grants with `LAG_VOICE_KEY` and `LAG_VOICE_SECRET`; the bundled LiveKit process starts with the same values.

## Trust boundaries

- The public gateway accepts browser traffic and proxies API/WebSocket requests.
- Fastify trusts an unexpired opaque session whose token hash exists in PostgreSQL. OIDC/OAuth maps a stable external subject to a local user; optional nickname guests have no external proof.
- PostgreSQL and API port `3001` should remain private.
- LiveKit signaling and media must be reachable by clients, often across NAT.
- A reverse proxy provides TLS and may authenticate users, but does not change Lag's internal user identity or authorization by itself.

## Deliberate limits

The current design implements one configured Prism/OIDC/OAuth provider, room roles, platform-administrator APIs, and a basic administrator console. It does **not** implement passwords, multiple simultaneous providers, multi-node WebSocket state, external PostgreSQL lifecycle management, or horizontal scaling. See root `CONTEXT.md` for durable repository constraints.
