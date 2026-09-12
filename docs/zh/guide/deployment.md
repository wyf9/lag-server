# 部署与网络

## 构建并启动

从已检出的源码构建：

```bash
# 先通过部署环境提供 ALLOWED_HOSTS、AUTH_PROVIDER、AUTH_CLIENT_ID
# 与提供商特定值。
docker compose up -d --build
docker compose ps
curl --fail http://localhost:3000/api/health
```

也可以使用已发布镜像 `ghcr.io/wyf9/lag-server:latest`。生产环境应固定版本标签或摘要，不要依赖 `latest`。

将 `/var/lib/postgresql/data` 放在持久化存储上。内置拓扑面向单容器，而非 Kubernetes 风格的独立副本。仓库中的 Compose 文件不是完整生产配置，目前缺少必需认证值。

## 端口表

| 端口 | 协议 | 暴露方式 | 用途 |
| --- | --- | --- | --- |
| `3000` | TCP | 公开或位于 HTTPS 代理后 | Web UI、REST API、`/api/ws` |
| `3001` | TCP | 仅内部 | Fastify API |
| `3002` | TCP | 仅内部 | SvelteKit 服务 |
| `5432` | TCP | 仅内部 | 内置 PostgreSQL |
| `7880` | TCP | 客户端可达 | LiveKit 信令/API |
| `7881` | TCP | 客户端可达 | LiveKit RTC TCP 回退 |
| `50000-50200` | UDP | 客户端可达 | LiveKit RTC 媒体 |

## NAT 与防火墙

将 `EXTERNAL_IP` 设置为客户端可访问的地址。把 TCP `7880-7881` 和完整 UDP 范围 `50000-50200` 转发到容器宿主机。不要只映射 HTTP：UDP 被阻止时，信令可能成功但没有声音。运营商级 NAT 或严格企业网络可能需要 TURN 方案；本仓库没有内置或声称已实现 TURN。

## TLS 与反向代理

在端口 `3000` 前终止 HTTPS，包括 `/api/ws` 的 WebSocket upgrade。保持正确的 host/origin 行为，并为 WebSocket 设置足够长的空闲超时。不要将 `3001` 作为第二条公网 API 路径暴露。

网站使用 HTTPS 时，LiveKit 也需要客户端可达的安全信令设计，否则浏览器可能阻止不安全的 `ws://` 混合内容。当前内置默认值偏向开发环境。上线前必须从外部网络浏览器验证准确的公共 URL、证书、信令路径和媒体端口。

## 扩展限制

不要让多个一体化副本使用复制的数据卷。WebSocket presence 位于内存，PostgreSQL 是内置的，LiveKit 节点路由也未协调。高可用或水平扩展需要架构变更和针对性部署测试。
