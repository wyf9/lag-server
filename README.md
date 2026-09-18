# Lag Server (independent fork)

An independently maintained fork of Lag's self-hosted voice and chat server. The all-in-one container bundles the SvelteKit web UI, Fastify API, PostgreSQL, and LiveKit. This repository is not the upstream Lag service and is not endorsed by its maintainers. Copyright in the original project remains with Lag; this fork is made and distributed only under the terms of the repository's MIT License.

独立维护的 Lag 自托管语音与聊天服务器分支。单容器包含 SvelteKit Web UI、Fastify API、PostgreSQL 和 LiveKit。本仓库并非 Lag 上游服务，也不代表其维护者。原项目版权归 Lag 所有；本分支仅依据仓库 MIT License 的条款进行 Fork、修改与分发。

## Start / 启动

Clone this fork and either pull its GHCR image (default) or build locally:

克隆本分支后，可直接拉取其 GHCR 镜像（默认）或从源码构建：

```bash
git clone https://github.com/wyf9/lag-server.git
cd lag-server
cp .env.example .env
# Configure the required identity-provider values
docker compose up -d
```

To build the local source instead, rename `compose-build.override.yml` to `compose.override.yml`, then run `docker compose up -d --build`.

若要从本地源码构建，请将 `compose-build.override.yml` 重命名为 `compose.override.yml`，然后运行 `docker compose up -d --build`。

Open `http://localhost:3000`. Remote voice requires TCP `7880-7881`, UDP `50000-50200`, and a correct `EXTERNAL_IP`.

访问 `http://localhost:3000`。远程语音还需要开放 TCP `7880-7881`、UDP `50000-50200`，并正确设置 `EXTERNAL_IP`。

Full English and Chinese documentation: **[lag.p.wyf9.top](https://lag.p.wyf9.top/)**

完整中英文文档：**[lag.p.wyf9.top](https://lag.p.wyf9.top/zh/)**

Component development uses Bun 1.3.14 with lockfiles in `api/`, `web/`, and `docs/`; the production container continues to run the built applications on Node.js 20. See the development guide for frozen-install and validation commands.

组件开发使用 Bun 1.3.14，锁文件分别位于 `api/`、`web/` 和 `docs/`；生产容器仍使用 Node.js 20 运行构建后的应用。冻结安装与验证命令请参阅开发指南。

## Current scope / 当前范围

- Prism-flavored OIDC, standard OIDC, and explicit-endpoint OAuth 2.0 login are implemented in the API; optional nickname guests are disabled by default. / API 已实现 Prism 风格 OIDC、标准 OIDC 和显式端点 OAuth 2.0 登录；可选昵称访客默认关闭。
- Room roles, private/unlisted rooms, invitations, bans, ownership transfer, history controls, and a platform administrator grant are implemented in the API. / API 已实现房间角色、私有/不公开房间、邀请、封禁、所有权转移、历史控制及平台管理员授权。
- See [architecture](https://lag.p.wyf9.top/guide/architecture), [configuration](https://lag.p.wyf9.top/guide/configuration), [authentication](https://lag.p.wyf9.top/guide/authentication), and [operations](https://lag.p.wyf9.top/guide/operations). / 参阅[架构](https://lag.p.wyf9.top/zh/guide/architecture)、[配置](https://lag.p.wyf9.top/zh/guide/configuration)、[认证](https://lag.p.wyf9.top/zh/guide/authentication)与[运维](https://lag.p.wyf9.top/zh/guide/operations)。

## Contributing and security / 贡献与安全

Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

提交更改前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。漏洞请按照 [SECURITY.md](SECURITY.md) 私下报告。

*The original project is copyright Lag. This fork is licensed and distributed under the [MIT License](LICENSE), whose copyright notice and permission terms must be preserved. Documentation describes this repository's current code; where a capability is absent, it says so explicitly.*
