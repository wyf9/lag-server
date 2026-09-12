# Operator guide

## Preflight

- Replace all development secrets and record where encrypted backups are held.
- Configure one identity provider, exact `ALLOWED_HOSTS`, callback registration, and first-admin bootstrap procedure.
- Verify `EXTERNAL_IP`, DNS, TLS/WSS, firewall, NAT, and off-network UDP media.
- Keep `3001`, `3002`, and `5432` private.
- Keep `GUEST_ENABLED=false` unless nickname guests are intentional; audit `platform_admin` grants after bootstrap.
- Pin a reviewed source commit or `ghcr.io/wyf9/lag-server` digest; do not rely on the floating `latest` tag.

## Health and logs

`GET /api/health` returns application process health, not full PostgreSQL/LiveKit readiness:

```bash
curl --fail https://your-host.example/api/health
docker compose logs --follow
```

Monitor container restarts, HTTP error/latency, WebSocket disconnects, disk use, PostgreSQL health, backup age, certificate expiry, and actual synthetic voice connectivity. Avoid retaining cookies, OAuth callback parameters, or unnecessary personal data in proxy logs; WebSockets authenticate with the session cookie.

## Backup and restore

```bash
# Backup
docker exec lag su - postgres -c "pg_dump --clean --if-exists lag" > lag.sql

# Restore into a stopped/maintenance instance after taking another snapshot
docker exec -i lag su - postgres -c "psql lag" < lag.sql
```

Back up the secret values separately. Encrypt backups, define retention, and regularly restore into an isolated environment. A backup is not proven until restoration and application checks succeed.

## Upgrade and rollback

1. Read changes and dependency/security notes; pin the target commit or digest.
2. Back up and test that the backup is readable.
3. Schedule interruption: startup automatically applies database schema changes.
4. Build/pull, restart, and verify health, session creation, room/message WebSockets, and off-network voice.
5. Keep the previous artifact and a pre-upgrade database backup. Database rollback may require a compatible restore rather than only reverting the image.

## Troubleshooting

**UI works, voice does not:** verify browser console mixed-content errors, `EXTERNAL_IP`, TCP `7880-7881`, UDP range forwarding, and matching voice key/secret. Test from outside the server LAN.

**Sessions fail after restart:** verify the persistent PostgreSQL volume is mounted and inspect `sessions` expiry/revocation state. Current sessions are opaque database records.

**502 from the gateway:** inspect API and web process logs plus PostgreSQL readiness. `/api/health` through port `3000` tests gateway-to-API routing.

**Disk growth:** inspect PostgreSQL volume and logs, then review each room's `7`, `30`, or `forever` retention setting. A periodic cleanup removes expired messages and stale authentication, session, invitation, logout-replay, and audit records.

## Incident response

Contain access, preserve relevant sanitized evidence, rotate exposed provider/voice secrets, revoke affected database sessions, and verify database integrity and role grants. Report product vulnerabilities to `security@wyf9.top`; never put exploitable details in a public issue.
