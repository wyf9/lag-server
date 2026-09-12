# Guide overview

This documentation describes the code currently present in this independent Lag fork. It separates **implemented behavior** from **integration patterns or future work**.

## What runs

The default build is one container with a web gateway, Fastify API, PostgreSQL, and LiveKit. Users authenticate through one configured Prism/OIDC/OAuth provider (or optional nickname guest mode), use role-aware rooms, exchange persistent text messages, and connect to voice. Start with [architecture and context](./architecture) before changing topology.

## Suggested reading

1. [Configuration](./configuration) for runtime values and safe defaults.
2. [Authentication](./authentication) and [permissions](./permissions) before exposing an instance.
3. [Deployment and networking](./deployment) for TLS, firewall, NAT, and reverse proxies.
4. [Operations](./operations) for backups, health checks, upgrades, and troubleshooting.
5. [Development](./development) for source builds and validation.

::: danger Production warning
The compose defaults `devkey` and `secret` are insecure, and the inherited Compose file omits required identity-provider settings. Configure authentication and secrets before internet exposure; enable nickname guests only deliberately.
:::
