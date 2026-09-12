# Frontend API expectations

The cookie-session frontend tolerates missing optional discovery and administration fields. To expose all controls, the API should use these response shapes.

## Authentication discovery

`GET /api/discover` remains public and may add either top-level fields or an `auth` object:

```json
{
  "auth": {
    "guestEnabled": false,
    "provider": "oidc",
    "providerName": "Company SSO"
  }
}
```

The client also recognizes top-level `guestEnabled`, `allowGuests`, `authProvider`, and `providerName`. If none are returned, guest login is hidden and OAuth login remains available.

## Session identity

`GET /api/session` returns `{ "user": ... }`. Alongside `id`, `nickname`, and `avatarColor`, the client accepts `email`, `isGuest`, `identity`, `provider`, `platformRole`, `roles`, and scoped `grants`. Administration is enabled when any role representation contains `platform_admin`.

## Administration

The read-only administration views request:

- `GET /api/admin/users` returning `{ "users": [] }`
- `GET /api/admin/rooms` returning `{ "rooms": [] }`
- `GET /api/admin/settings` returning `{ "settings": [] }` or a settings object
- `GET /api/admin/audit` returning `{ "events": [] }`

Each view presents explicit unavailable and forbidden states for 404 and 403 responses. Mutation controls should only be added once concrete endpoint contracts exist.

## Room departure

`DELETE /api/rooms/:id/leave` removes active voice presence, while `DELETE /api/rooms/:id/membership` removes durable membership. The frontend presents these as disconnect and leave-room actions respectively.
