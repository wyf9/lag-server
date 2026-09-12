# Lag Server (independent fork)

An independently maintained fork of Lag's self-hosted voice and chat server. The all-in-one container bundles the SvelteKit web UI, Fastify API, PostgreSQL, and LiveKit. This repository is not the upstream Lag service and is not endorsed by its maintainers.

独立维护的 Lag 自托管语音与聊天服务器分支。单容器包含 SvelteKit Web UI、Fastify API、PostgreSQL 和 LiveKit。本仓库并非 Lag 上游服务，也不代表其维护者。

## Start / 启动

The image location for this fork has not been finalized. Build locally instead of pulling an upstream image:

本分支的镜像地址尚未确定。请从源码构建，不要默认拉取上游镜像：

```bash
git clone <FORK_REPOSITORY_URL>
cd <FORK_DIRECTORY>
# Configure the required identity-provider values documented at lag.p.wyf9.top
docker compose up -d --build
```

Open `http://localhost:3000`. Remote voice requires TCP `7880-7881`, UDP `50000-50200`, and a correct `EXTERNAL_IP`.

访问 `http://localhost:3000`。远程语音还需要开放 TCP `7880-7881`、UDP `50000-50200`，并正确设置 `EXTERNAL_IP`。

Full English and Chinese documentation: **https://lag.p.wyf9.top/**

完整中英文文档：**https://lag.p.wyf9.top/zh/**

Component development uses Bun 1.3.14 with lockfiles in `api/`, `web/`, and `docs/`; the production container continues to run the built applications on Node.js 20. See the development guide for frozen-install and validation commands.

组件开发使用 Bun 1.3.14，锁文件分别位于 `api/`、`web/` 和 `docs/`；生产容器仍使用 Node.js 20 运行构建后的应用。冻结安装与验证命令请参阅开发指南。

## Current scope / 当前范围

- Prism-flavored OIDC, standard OIDC, and explicit-endpoint OAuth 2.0 login are implemented in the API; optional nickname guests are disabled by default. / API 已实现 Prism 风格 OIDC、标准 OIDC 和显式端点 OAuth 2.0 登录；可选昵称访客默认关闭。
- Room roles, private/unlisted rooms, invitations, bans, ownership transfer, history controls, and a platform administrator grant are implemented in the API. Check web-client support before relying on every management flow. / API 已实现房间角色、私有/不公开房间、邀请、封禁、所有权转移、历史控制及平台管理员授权；依赖所有管理流程前请确认 Web 客户端支持情况。
- PostgreSQL data persists in `lag_data`; operators own backup, TLS, firewall, upgrades, and identity-provider policy. / PostgreSQL 数据保存在 `lag_data`；备份、TLS、防火墙、升级与身份提供商策略由运维者负责。
- See [architecture](docs/guide/architecture.md), [configuration](docs/guide/configuration.md), [authentication](docs/guide/authentication.md), and [operations](docs/guide/operations.md). / 参阅[架构](docs/zh/guide/architecture.md)、[配置](docs/zh/guide/configuration.md)、[认证](docs/zh/guide/authentication.md)与[运维](docs/zh/guide/operations.md)。

## Fork publication checklist / 分支发布清单

The application still contains inherited external identifiers. Documentation does not guess replacements. Before publishing releases, maintainers must audit and replace each item deliberately:

应用中仍有继承的外部标识。文档不会猜测替代值。发布版本前，维护者必须逐项审核并明确替换：

- [ ] Set `<FORK_REPOSITORY_URL>`, `<FORK_DIRECTORY>`, and the canonical issue/discussion URLs. / 设置仓库、目录及 issue/discussion 的规范地址。
- [ ] Choose `<FORK_IMAGE>` and replace inherited `ghcr.io/lag-app/self-host` defaults in runtime scripts and release automation. / 确定镜像地址，并替换脚本和发布流程中继承的镜像地址。
- [ ] Choose `<MAINTAINER_NAME>` and private `<SECURITY_CONTACT>`; update community contact points. / 确定维护者名称和私密安全联系方式，并更新社区联系地址。
- [ ] Review inherited `trylag.com`, `lag-app`, logos, trademarks, package names, and browser storage keys for legal and product fit. / 审核继承的域名、组织名、Logo、商标、包名及浏览器存储键。
- [ ] Configure GitHub Pages for `lag.p.wyf9.top`, including DNS and the repository Pages source. / 配置自定义域名的 DNS 与 GitHub Pages 发布源。
- [ ] Update image publishing only after registry ownership, tags, provenance, and rollback policy are decided. / 仅在确定镜像仓库归属、标签、来源证明和回滚策略后更新镜像发布流程。

## Contributing and security / 贡献与安全

Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes. Report vulnerabilities using the private channel described in [SECURITY.md](SECURITY.md); its contact is intentionally a placeholder until the fork maintainer publishes one.

提交更改前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。漏洞请通过 [SECURITY.md](SECURITY.md) 中的私密渠道报告；在分支维护者公布联系方式前，其中会保留明确占位符。

Licensed under the [MIT License](LICENSE). Documentation describes this repository's current code; where a capability is absent, it says so explicitly.
