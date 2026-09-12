# 指南概览

本文档描述该 Lag 独立分支中**当前存在的代码**，并明确区分“已实现行为”和“集成方案或未来工作”。

## 运行内容

默认构建是一个包含 Web 网关、Fastify API、PostgreSQL 和 LiveKit 的容器。用户通过一种已配置的 Prism/OIDC/OAuth 提供商认证（或使用可选昵称访客模式），使用带角色的房间、交换持久化文本消息并连接语音。改变部署拓扑前，请先阅读[架构与上下文](./architecture)。

## 推荐阅读顺序

1. [配置](./configuration)：运行时参数与安全默认值。
2. 对外开放前阅读[认证](./authentication)和[权限](./permissions)。
3. [部署与网络](./deployment)：TLS、防火墙、NAT 与反向代理。
4. [运维](./operations)：备份、健康检查、升级与故障排查。
5. [开发](./development)：源码构建与验证。

::: danger 生产环境警告
Compose 默认值 `devkey` 和 `secret` 不安全，继承的 Compose 文件也缺少必需身份提供商设置。暴露到互联网前必须配置认证与密钥；仅在明确需要时启用昵称访客。
:::
