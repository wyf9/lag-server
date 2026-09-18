# Security Policy / 安全策略

## Reporting a vulnerability / 报告漏洞

Do **not** open a public issue or discussion. Send the report privately to:

请**不要**创建公开 issue 或 discussion。请将报告私下发送至：

> **<security@wyf9.top>**
> OR **[wyf9.top/contact](https://wyf9.top/contact)** for other contact methods (其他联系方式)

Include the affected version or commit, deployment assumptions, reproduction steps or proof of concept, impact, and any suggested mitigation. Do not include production credentials or personal data. No acknowledgement or remediation deadline is guaranteed.

请包含受影响版本或提交、部署前提、复现步骤或概念验证、影响及建议缓解措施。不要包含生产凭据或个人数据。本项目不保证确认或修复时限。

## Supported versions / 支持版本

No formal support window has been declared. Treat the default branch as development code and pin a reviewed commit or image digest for deployments. Maintainers must replace this section with a release support matrix before claiming stable support.

目前尚未声明正式支持周期。请将默认分支视为开发代码，部署时固定到已审核的提交或镜像摘要。维护者在宣称稳定支持前必须补充版本支持矩阵。

## Operator baseline / 运维安全基线

- Set strong, independent provider credentials, `LAG_VOICE_KEY`, and `LAG_VOICE_SECRET`; never use documented development defaults in production.
- Terminate HTTPS/WSS at a maintained reverse proxy and restrict trusted forwarding headers there.
- Expose only required ports. Never publish bundled PostgreSQL (`5432`) or the internal API (`3001`) directly.
- Keep `GUEST_ENABLED=false` unless nickname-only guests are intended. Configure one supported identity provider and audit administrator claim mapping; the first external identity receives the bootstrap `platform_admin` grant.
- Back up and restore-test `lag_data`; patch the host, runtime, base image, Node.js dependencies, PostgreSQL, and LiveKit.
- Treat room messages, nicknames, IP addresses, session tokens, voice tokens, and logs as sensitive data.

- 为身份提供商凭据、`LAG_VOICE_KEY`、`LAG_VOICE_SECRET` 设置独立强随机值；生产环境禁止使用开发默认值。
- 在持续维护的反向代理终止 HTTPS/WSS，并仅在那里接受可信转发头。
- 只暴露必需端口，绝不直接公开内置 PostgreSQL (`5432`) 或内部 API (`3001`)。
- 除非明确需要仅昵称访客，否则保持 `GUEST_ENABLED=false`。配置一种受支持的身份提供商并审核管理员 claim 映射；首个外部身份会获得启动用 `platform_admin` 授权。
- 备份并实际演练恢复 `lag_data`；及时更新宿主机、容器运行时、基础镜像、Node.js 依赖、PostgreSQL 和 LiveKit。
- 将房间消息、昵称、IP 地址、会话令牌、语音令牌和日志视为敏感数据。

See the [operator guide](https://lag.p.wyf9.top/guide/operations) / 参阅[运维指南](https://lag.p.wyf9.top/zh/guide/operations)。
