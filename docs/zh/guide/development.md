# 开发

## 前置条件

- Bun 1.3.14（生产应用运行时仍为 Node.js 20）
- 用于集成运行的 Docker、Podman 或 nerdctl
- 在容器外运行 API 时所需的 PostgreSQL 实例

规范分支地址公布后，从 `<FORK_REPOSITORY_URL>` 克隆。最稳妥的集成开发方式是：

```bash
docker compose up -d --build
curl http://localhost:3000/api/health
```

## 组件命令

```bash
cd api
bun install --frozen-lockfile
bun run build
bun run test

cd ../web
bun install --frozen-lockfile
bun run check
bun run build

cd ../docs
bun install --frozen-lockfile
bun run docs:dev
bun run docs:build
```

单独运行 API 需要 `DATABASE_URL` 以及[配置](./configuration)列出的认证与 origin 值。单独运行 Web 客户端时默认使用同源 `/api`；如确需跨来源开发，可在构建时提供 `VITE_API_URL`。安全 `__Host-` 会话 Cookie 要求 HTTPS，因此明文 HTTP 身份测试应使用 HTTPS 开发代理，而不是削弱生产 Cookie 行为。

## 变更纪律

- 先阅读根目录 `CONTEXT.md` 和已跟踪的 `AGENTS.md`。
- 行为描述必须与代码、部署文件一致。
- 同时更新 `docs/` 和 `docs/zh/` 下对应页面。
- 不要编辑生成的 VitePress、SvelteKit 或依赖输出。
- 未确定的分支所有权值继续使用占位符。
- 测试或示例中绝不使用真实密钥。

运行时/网络改动需验证页面加载、REST 健康检查、会话创建、WebSocket 更新、重启后持久化，以及来自另一网络的语音。仅文档改动至少运行 `bun run docs:build`。
