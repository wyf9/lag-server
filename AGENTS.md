# Agent Instructions

## Scope

These instructions apply to the entire repository. Read `CONTEXT.md` before changing behavior or documentation.

## Safety and provenance

- This is an independent fork. Do not reintroduce inherited upstream repository, image, domain, maintainer, or contact values as if they belong to this fork.
- Preserve unresolved values as explicit placeholders such as `<FORK_REPOSITORY_URL>`, `<FORK_IMAGE>`, `<MAINTAINER_NAME>`, and `<SECURITY_CONTACT>`.
- Never commit secrets. Use obvious non-production examples and label insecure defaults.
- Describe Prism, OIDC, OAuth, room roles, and platform-administrator behavior only to the extent currently enforced by code. Do not claim multi-provider login, a complete administrator console, horizontal scaling, or other absent capabilities.

## Change discipline

- Keep application code, deployment files, and documentation consistent with observed behavior.
- For documentation behavior changes, update both English pages under `docs/` and Chinese pages under `docs/zh/`.
- Do not edit generated output (`docs/.vitepress/dist`, `node_modules`, SvelteKit build output) or commit it.
- Keep application changes separate from documentation-only work when practical.

## Validation

- Documentation: `cd docs && bun install --frozen-lockfile && bun run docs:build`.
- API: `cd api && bun install --frozen-lockfile && bun run build && bun run test`.
- Web: `cd web && bun install --frozen-lockfile && bun run check && bun run build`.
- Deployment changes: build the container and test health, WebSocket behavior, persistence, and affected voice/network paths.

Report which commands ran, including failures or checks that were not possible.
