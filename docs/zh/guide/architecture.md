# 架构与上下文

## 请求流

```text
浏览器
  | HTTP + /api/ws WebSocket
  v
Node 网关 :3000
  |-- 页面/资源 --> SvelteKit Node 服务 :3002
  `-- /api/* -----> Fastify :3001 ------> PostgreSQL :5432
                              `----------> 签发 LiveKit 令牌

浏览器 <------ LiveKit 信令 TCP :7880 / :7881
浏览器 <---------- LiveKit 媒体 UDP :50000-50200
```

s6-overlay 监管 PostgreSQL、LiveKit、API 和 Web 进程。PostgreSQL 初始化和迁移先于 API 启动。网关在同一来源提供 UI 和 API；默认情况下 API 与数据库端口仅在容器内部使用。

## 数据与状态

PostgreSQL 存储用户、外部身份、不透明会话、OAuth 事务、角色 grant、房间策略/成员、邀请/封禁、审计事件和消息。`lag_data` 卷保存数据库文件；继承的镜像启动逻辑也可能创建 `.session_secret`，但当前不透明会话不会使用它。WebSocket 连接和订阅位于进程内存，重启后消失，也不会在多个 API 副本之间共享。

LiveKit 承载实时语音和媒体。API 使用 `LAG_VOICE_KEY` 与 `LAG_VOICE_SECRET` 签发短期参与者授权，内置 LiveKit 进程使用相同值启动。

## 信任边界

- 公共网关接收浏览器流量，并代理 API/WebSocket 请求。
- Fastify 信任令牌哈希存在于 PostgreSQL 且未过期的不透明会话。OIDC/OAuth 将稳定的外部 subject 映射到本地用户；可选昵称访客没有外部证明。
- PostgreSQL 与 API 端口 `3001` 应保持私有。
- LiveKit 信令和媒体必须能被客户端访问，通常需要穿越 NAT。
- 反向代理可以提供 TLS 与准入认证，但本身不会改变 Lag 内部身份或权限。

## 明确限制

当前设计实现一种已配置的 Prism/OIDC/OAuth 提供商、房间角色、平台管理员 API 与基础管理控制台。它**没有**实现密码、同时使用多个提供商、多节点 WebSocket 状态、外部 PostgreSQL 生命周期管理或水平扩展。长期仓库约束见根目录 `CONTEXT.md`。
