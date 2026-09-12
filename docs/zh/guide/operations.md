# 运维指南

## 上线前检查

- 替换所有开发密钥，并记录加密备份的位置。
- 配置一种身份提供商、精确 `ALLOWED_HOSTS`、回调注册与首个管理员启动流程。
- 验证 `EXTERNAL_IP`、DNS、TLS/WSS、防火墙、NAT 与外部网络 UDP 媒体。
- 保持 `3001`、`3002` 和 `5432` 私有。
- 除非明确需要昵称访客，否则保持 `GUEST_ENABLED=false`；启动后审核 `platform_admin` grant。
- 固定到已审核的源码提交或 `ghcr.io/wyf9/lag-server` 镜像摘要；不要依赖浮动的 `latest` 标签。

## 健康检查与日志

`GET /api/health` 仅表示应用进程健康，不代表 PostgreSQL/LiveKit 全面就绪：

```bash
curl --fail https://your-host.example/api/health
docker compose logs --follow
```

监控容器重启、HTTP 错误与延迟、WebSocket 断线、磁盘使用、PostgreSQL 健康、备份时效、证书到期和实际合成语音连接。避免在代理日志中长期保存 Cookie、OAuth 回调参数或不必要的个人数据；WebSocket 使用会话 Cookie 认证。

## 备份与恢复

```bash
# 备份
docker exec lag su - postgres -c "pg_dump --clean --if-exists lag" > lag.sql

# 再做快照后，在已停止服务/维护模式的实例恢复
docker exec -i lag su - postgres -c "psql lag" < lag.sql
```

单独备份密钥。加密备份、定义保留周期，并定期恢复到隔离环境。只有恢复和应用检查成功后，备份才算有效。

## 升级与回滚

1. 阅读改动及依赖/安全说明，固定目标提交或摘要。
2. 备份并验证备份可读。
3. 安排中断窗口：启动时会自动应用数据库 schema 变更。
4. 构建/拉取并重启，然后验证健康检查、会话创建、房间/消息 WebSocket 和外部网络语音。
5. 保留旧构件与升级前数据库备份。数据库回滚可能需要兼容备份恢复，而不是只回退镜像。

## 故障排查

**UI 正常但语音失败：**检查浏览器控制台混合内容错误、`EXTERNAL_IP`、TCP `7880-7881`、UDP 范围转发以及匹配的语音 key/secret；从局域网外测试。

**重启后会话失败：**确认 PostgreSQL 持久化卷已挂载，并检查 `sessions` 的过期/撤销状态。当前会话是不透明数据库记录。

**网关返回 502：**查看 API、Web 进程日志与 PostgreSQL 就绪状态。通过端口 `3000` 请求 `/api/health` 可测试网关到 API 的路由。

**磁盘持续增长：**检查 PostgreSQL 卷和日志，再检查各房间 `7`、`30` 或 `forever` 保留设置。定时清理任务会删除过期消息，以及过期的认证事务、会话、邀请、登出防重放和审计记录。

## 事件响应

隔离访问、保留经过脱敏的相关证据、轮换泄漏的提供商/语音密钥、撤销受影响数据库会话，并验证数据库完整性与角色 grant。请将产品漏洞报告发送至 `security@wyf9.top`，绝不要在公开 issue 中提交可利用细节。
