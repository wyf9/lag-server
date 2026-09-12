# Development

## Prerequisites

- Bun 1.3.14 (Node.js 20 remains the production application runtime)
- Docker, Podman, or nerdctl for the integrated runtime
- A PostgreSQL instance when running the API outside the container

Clone the canonical fork repository. The safest integrated setup is:

```bash
git clone https://github.com/wyf9/lag-server.git
cd lag-server
docker compose up -d --build
curl http://localhost:3000/api/health
```

## Component commands

```bash
cd api
bun install --frozen-lockfile
bun run build
bun run test

cd ../web
bun install --frozen-lockfile
bun run check
bun run build

cd ../docs
bun install --frozen-lockfile
bun run docs:dev
bun run docs:build
```

The standalone API requires `DATABASE_URL` plus the authentication and origin values listed in [configuration](./configuration). The standalone web client defaults to same-origin `/api`; `VITE_API_URL` can be supplied at build time for a deliberate split-origin development setup. Secure `__Host-` session cookies require HTTPS, so plain-HTTP identity testing needs an HTTPS development proxy rather than weakening production cookie behavior.

## Change discipline

- Read root `CONTEXT.md` and tracked `AGENTS.md` first.
- Keep behavior claims tied to code and deployment files.
- Update equivalent pages under `docs/` and `docs/zh/` together.
- Do not edit generated VitePress, SvelteKit, or dependency output.
- Keep repository, image, documentation, and security-contact references aligned with this fork's canonical values.
- Never use real secrets in tests or examples.

For runtime/network changes, exercise page loading, REST health, session creation, WebSocket updates, persistence across restart, and voice from another network. For docs-only changes, `bun run docs:build` is the minimum validation.
