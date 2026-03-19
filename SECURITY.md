# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

**Do not open a public issue.**

Email: security@trylag.com

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact

We will acknowledge receipt within 48 hours and aim to provide a fix within 7 days for critical issues.

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |

## Best Practices for Operators

- Set `LAG_VOICE_SECRET` to a strong 32+ character secret
- Set `SESSION_SECRET` explicitly rather than relying on auto-generation
- Do not expose ports 3001, 5432, or internal services to the public internet
- Keep the container image updated to the latest release
- Back up your PostgreSQL data volume regularly
