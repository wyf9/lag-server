# Prism, OIDC, and OAuth

The API requires exactly one provider selected by `AUTH_PROVIDER`: `prism`, `oidc`, or `oauth2`. It uses Authorization Code flow, stores one-time state in PostgreSQL, supports PKCE, maps a provider subject to a local user, and creates an opaque server-side session. Secure session and CSRF cookies require HTTPS.

The current web client may not expose every login and management flow added by the API. Validate the browser experience for the deployed revision.

## Common registration

Register this callback at the provider, exactly matching scheme, host, and path:

```text
https://lag.example.com/api/auth/callback
```

Common settings:

```dotenv
AUTH_PROVIDER=oidc
AUTH_CLIENT_ID=<PROVIDER_CLIENT_ID>
AUTH_CLIENT_SECRET=<PROVIDER_CLIENT_SECRET>
AUTH_SCOPES=openid profile email
AUTH_PKCE=required
ALLOWED_HOSTS=https://lag.example.com
```

Start login at `GET /api/auth/login`. The callback redirects to the first origin in `ALLOWED_HOSTS`. `ALLOWED_HOSTS` is a comma-separated list of exact origins, with no path or trailing slash.

## Standard OIDC

```dotenv
AUTH_PROVIDER=oidc
OIDC_ISSUER=https://id.example.com
AUTH_CLIENT_ID=<OIDC_CLIENT_ID>
AUTH_CLIENT_SECRET=<OIDC_CLIENT_SECRET>
ALLOWED_HOSTS=https://lag.example.com
```

Lag fetches `${OIDC_ISSUER}/.well-known/openid-configuration`, requires an exact issuer match, exchanges the code, verifies the ID token signature/issuer/audience and nonce, and uses `sub` and `name` by default. Discovery must provide authorization/token/JWKS data. Provider logout is returned as `logoutUrl` when `end_session_endpoint` exists.

## Prism mode

Prism mode follows OIDC discovery and token validation, plus team-role mapping and back-channel logout:

```dotenv
AUTH_PROVIDER=prism
PRISM_ISSUER=https://prism.example.com
AUTH_CLIENT_ID=<PRISM_CLIENT_ID>
AUTH_CLIENT_SECRET=<PRISM_CLIENT_SECRET>
ALLOWED_HOSTS=https://lag.example.com
PRISM_TEAM_CLAIM_PATH=teams
PRISM_TEAM_ID_PATH=id
PRISM_TEAM_ID=<TEAM_ID>
PRISM_TEAM_ROLE_PATH=role
PRISM_OWNER_ROLES=owner,co-owner
```

Configure Prism's back-channel logout URL as `https://lag.example.com/api/auth/backchannel-logout`. The endpoint validates signed logout tokens and rejects replay. Team-owner claims create persisted team-scoped `owner` grants. Current room checks do not consume these team grants, so do not claim that Prism teams automatically own rooms.

## General OAuth 2.0

OAuth mode does not use discovery or verify an ID token. Configure all endpoints and JSON dot paths explicitly:

```dotenv
AUTH_PROVIDER=oauth2
AUTH_CLIENT_ID=<OAUTH_CLIENT_ID>
AUTH_CLIENT_SECRET=<OAUTH_CLIENT_SECRET>
ALLOWED_HOSTS=https://lag.example.com
OAUTH_AUTHORIZATION_ENDPOINT=https://provider.example.com/oauth/authorize
OAUTH_TOKEN_ENDPOINT=https://provider.example.com/oauth/token
OAUTH_USERINFO_ENDPOINT=https://provider.example.com/api/user
OAUTH_SUBJECT_PATH=id
OAUTH_NAME_PATH=display_name
OAUTH_EMAIL_PATH=email
AUTH_SCOPES=profile email
```

The user-info endpoint must return a stable subject and display name at the configured paths. OAuth 2.0 is not itself an identity protocol; only use this mode when the provider documents the identity semantics and transport security of that endpoint.

## Administration and guests

The first newly created external identity receives a bootstrap `platform_admin` grant. Later logins receive that grant only when `AUTH_ADMIN_CLAIM_PATH` resolves to `AUTH_ADMIN_CLAIM_VALUE` (array membership or string equality). Protect first startup and audit the database grant.

Set `GUEST_ENABLED=true` only to permit nickname-only `POST /api/session` accounts. Guests cannot create private or guest-disabled rooms, cannot enter private rooms, and cannot accept user-targeted invitations. They can use public rooms that allow guests.

## Security notes

- `AUTH_PKCE` is `required` by default; `auto` follows provider advertisement, and `disabled` requires a client secret.
- Preserve HTTPS and exact origins. State is single-use and expires after `OAUTH_TRANSACTION_SECONDS` (default 600).
- The code supports one provider configuration, not concurrent providers or account linking.
- `PROXY_HEADER` is only a trusted client-IP header name. Strip it at the edge and set it only from a trusted proxy.
