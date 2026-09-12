# Configuration

Pass values through Compose `environment`, `docker run -e`, or a secret manager. Avoid committing `.env` files. The current API fails startup unless provider, origin, and database requirements are present; checked-in defaults are development examples and are not suitable for production.

## Core and network

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | Image: `postgres://postgres@127.0.0.1:5432/lag` | Required PostgreSQL connection |
| `API_PORT` | `3001` | Internal Fastify/gateway target port |
| `PORT` | Image: `3000` | Public web gateway port inside container |
| `ALLOWED_HOSTS` | None; required | Comma-separated exact browser origins |
| `PROXY_HEADER` | Unset | Lowercase trusted client-IP header name |
| `EXTERNAL_IP` | Compose: `127.0.0.1`; scripts: auto | LiveKit advertised address |
| `LAG_VOICE_KEY` | `devkey` | LiveKit/API shared key; insecure default |
| `LAG_VOICE_SECRET` | `secret` | LiveKit/API shared secret; insecure default |
| `VOICE_URL` | Image: `ws://localhost:7880` | URL returned to browser voice joins |
| `NODE_ENV` | Image: `production` | Node runtime mode |

`EXTERNAL_HOST`, `WEB_PORT`, and `VOICE_PORT` affect `/api/discover` only; they do not configure listeners, TLS, or proxy routes.

## Identity and sessions

| Variable | Default | Meaning |
| --- | --- | --- |
| `AUTH_PROVIDER` | None; required | `prism`, `oidc`, or `oauth2` |
| `AUTH_CLIENT_ID` | None; required | Provider client ID |
| `AUTH_CLIENT_SECRET` | Optional | Provider client secret; required if PKCE disabled |
| `ALLOWED_HOSTS` | None; required | Comma-separated exact application origins; each origin produces `/api/auth/callback` |
| `AUTH_SCOPES` | `openid profile email` | Space-separated provider scopes |
| `AUTH_PKCE` | `required` | `required`, `auto`, or `disabled` |
| `GUEST_ENABLED` | `false` | Allow nickname-only session creation |
| `SESSION_IDLE_SECONDS` | `604800` | Sliding idle expiry (7 days) |
| `SESSION_ABSOLUTE_SECONDS` | `2592000` | Absolute expiry (30 days) |
| `OAUTH_TRANSACTION_SECONDS` | `600` | Login state lifetime |
| `AUTH_ADMIN_CLAIM_PATH` | Unset | Dot path for administrator claim |
| `AUTH_ADMIN_CLAIM_VALUE` | Unset | Exact expected value/array member |

Provider-specific variables are covered in [Prism, OIDC, and OAuth](./authentication). Sessions are opaque database records; browser sessions do not use a signing-secret setting.

## Minimal OIDC example

```dotenv
ALLOWED_HOSTS=https://lag.example.com
AUTH_PROVIDER=oidc
OIDC_ISSUER=https://id.example.com
AUTH_CLIENT_ID=<OIDC_CLIENT_ID>
AUTH_CLIENT_SECRET=<OIDC_CLIENT_SECRET>
GUEST_ENABLED=false
LAG_VOICE_KEY=<RANDOM_VOICE_KEY>
LAG_VOICE_SECRET=<RANDOM_VOICE_SECRET>
EXTERNAL_IP=203.0.113.10
```

Use a deployment secret mechanism. Rotating voice credentials requires API and LiveKit to restart with matching values. Existing application sessions are stored as hashed opaque tokens in PostgreSQL and expire according to the session settings.

## Container image

The canonical image is `ghcr.io/wyf9/lag-server`. Convenience scripts default to `latest`; override `LAG_IMAGE` with a reviewed release tag or immutable digest for production.
