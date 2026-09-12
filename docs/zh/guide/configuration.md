# 配置

通过 Compose `environment`、`docker run -e` 或密钥管理系统传递参数。不要提交 `.env` 文件。当前 API 缺少提供商、origin 或数据库必需值时会启动失败；仓库内默认值仅为开发示例，不适用于生产环境。

## 核心与网络

| 变量 | 默认值 | 含义 |
| --- | --- | --- |
| `DATABASE_URL` | 镜像：`postgres://postgres@127.0.0.1:5432/lag` | 必需的 PostgreSQL 连接 |
| `API_PORT` | `3001` | Fastify/网关目标内部端口 |
| `PORT` | 镜像：`3000` | 容器内公共 Web 网关端口 |
| `ALLOWED_HOSTS` | 无；必需 | 逗号分隔的精确浏览器 origin |
| `PROXY_HEADER` | 未设置 | 小写的可信客户端 IP 头名 |
| `EXTERNAL_IP` | Compose：`127.0.0.1`；脚本：自动 | LiveKit 公布地址 |
| `LAG_VOICE_KEY` | `devkey` | LiveKit/API 共享 key；默认值不安全 |
| `LAG_VOICE_SECRET` | `secret` | LiveKit/API 共享 secret；默认值不安全 |
| `VOICE_URL` | 镜像：`ws://localhost:7880` | 加入语音时返回浏览器的 URL |
| `NODE_ENV` | 镜像：`production` | Node 运行模式 |

`EXTERNAL_HOST`、`WEB_PORT`、`VOICE_PORT` 只影响 `/api/discover`；不会配置监听器、TLS 或代理路由。

## 身份与会话

| 变量 | 默认值 | 含义 |
| --- | --- | --- |
| `AUTH_PROVIDER` | 无；必需 | `prism`、`oidc` 或 `oauth2` |
| `AUTH_CLIENT_ID` | 无；必需 | 提供商 client ID |
| `AUTH_CLIENT_SECRET` | 可选 | 提供商 secret；禁用 PKCE 时必需 |
| `ALLOWED_HOSTS` | 无；必需 | 逗号分隔的应用完整 Origin；每项对应 `/api/auth/callback` |
| `AUTH_SCOPES` | `openid profile email` | 空格分隔的 scope |
| `AUTH_PKCE` | `required` | `required`、`auto` 或 `disabled` |
| `GUEST_ENABLED` | `false` | 允许纯昵称会话创建 |
| `SESSION_IDLE_SECONDS` | `604800` | 滑动空闲期限（7 天） |
| `SESSION_ABSOLUTE_SECONDS` | `2592000` | 绝对期限（30 天） |
| `OAUTH_TRANSACTION_SECONDS` | `600` | 登录 state 有效期 |
| `AUTH_ADMIN_CLAIM_PATH` | 未设置 | 管理员 claim 点路径 |
| `AUTH_ADMIN_CLAIM_VALUE` | 未设置 | 精确预期值/数组成员 |

提供商特定变量见 [Prism、OIDC 与 OAuth](./authentication)。会话是不透明数据库记录，浏览器会话不使用签名密钥配置。

## 最小 OIDC 示例

```dotenv
ALLOWED_HOSTS=https://lag.example.com
AUTH_PROVIDER=oidc
OIDC_ISSUER=https://id.example.com
AUTH_CLIENT_ID=<OIDC_CLIENT_ID>
AUTH_CLIENT_SECRET=<OIDC_CLIENT_SECRET>
GUEST_ENABLED=false
LAG_VOICE_KEY=<RANDOM_VOICE_KEY>
LAG_VOICE_SECRET=<RANDOM_VOICE_SECRET>
EXTERNAL_IP=203.0.113.10
```

使用部署密钥系统。轮换语音凭据时，API 与 LiveKit 必须使用匹配值一起重启。现有应用会话以哈希后的不透明 token 保存在 PostgreSQL，并按会话设置过期。

## 容器镜像

本分支规范镜像为 `ghcr.io/wyf9/lag-server`。便捷脚本默认使用 `latest`；生产环境请通过 `LAG_IMAGE` 固定已审核的版本标签或不可变摘要。
