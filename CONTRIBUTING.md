# Contributing to Lag Self-Hosted

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/lag-app/self-host.git
cd lag/self-hosting
podman compose up -d --build
# or: docker compose up -d --build
```

Open `http://localhost:3000` to test.

## Making Changes

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Test locally with `podman compose up -d --build`
5. Open a pull request

## Pull Requests

- Keep PRs focused on a single change
- Include a clear description of what and why
- Test your changes locally before submitting
- Follow existing code patterns and conventions

## Reporting Bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) when filing issues. Include:

- Steps to reproduce
- Expected vs actual behavior
- Container logs (`podman logs lag` or `docker logs lag`)
- Browser console errors if applicable

## Code Style

- **API**: TypeScript, Fastify 5, Drizzle ORM
- **Web**: SvelteKit, Svelte 5, Tailwind CSS
- **Infrastructure**: Dockerfile, s6-overlay, YAML configs

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
