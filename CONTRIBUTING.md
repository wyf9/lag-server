# Contributing / 贡献指南

Contributions to this independent fork are welcome. 本独立分支欢迎贡献。

## Before opening a change / 提交更改前

1. Read [CONTEXT.md](CONTEXT.md) and the [development guide](docs/guide/development.md).
2. Create a focused branch from the repository's default branch.
3. Keep fork links and identifiers aligned with `https://github.com/wyf9/lag-server`, `ghcr.io/wyf9/lag-server`, `https://lag.p.wyf9.top`, and `security@wyf9.top`.
4. Keep secrets out of commits, examples, logs, screenshots, and fixtures.

1. 阅读 [CONTEXT.md](CONTEXT.md) 与[开发指南](docs/zh/guide/development.md)。
2. 从仓库默认分支创建目标单一的分支。
3. 保持分支链接和标识与 `https://github.com/wyf9/lag-server`、`ghcr.io/wyf9/lag-server`、`https://lag.p.wyf9.top` 和 `security@wyf9.top` 一致。
4. 不要在提交、示例、日志、截图或测试数据中包含密钥。

## Local validation / 本地验证

```bash
# Whole application (build from local source)
mv compose-build.override.yml compose.override.yml
docker compose up -d --build
# Note: provide the required auth/origin environment from docs/guide/configuration.md.
curl http://localhost:3000/api/health

# API
cd api && bun install --frozen-lockfile && bun run build && bun run test

# Web
cd web && bun install --frozen-lockfile && bun run check && bun run build

# Documentation
cd docs && bun install --frozen-lockfile && bun run docs:build
```

Run the checks relevant to your change and report exact results in the pull request. Container changes should also verify browser loading, WebSocket chat, and voice from a second network when networking is affected.

请运行与改动相关的检查，并在拉取请求中准确记录结果。容器或网络改动还应验证浏览器加载、WebSocket 聊天，以及跨网络语音。

## Pull requests / 拉取请求

- Explain what changed, why, operational impact, and rollback considerations.
- Keep application, infrastructure, and documentation claims aligned.
- Add or update both English and Chinese docs when behavior or operator steps change.
- Do not combine unrelated formatting or refactoring with a functional change.
- Contributions are licensed under the repository's [MIT License](LICENSE).

- 说明改动内容、原因、运维影响和回滚考虑。
- 保持应用、基础设施与文档描述一致。
- 行为或运维步骤变化时，同时更新中英文文档。
- 不要把无关的格式化或重构混入功能改动。
- 贡献内容采用仓库的 [MIT License](LICENSE)。

## Issues / Issue

Search existing issues before filing. Include versions, deployment topology, sanitized configuration, reproduction steps, expected/actual behavior, and relevant logs.
