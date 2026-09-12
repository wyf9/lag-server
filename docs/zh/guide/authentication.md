# Prism、OIDC 与 OAuth

API 要求通过 `AUTH_PROVIDER` 选择且仅选择一种提供商：`prism`、`oidc` 或 `oauth2`。它使用 Authorization Code 流程，在 PostgreSQL 保存一次性 state，支持 PKCE，将提供商 subject 映射到本地用户，并创建服务端不透明会话。安全会话和 CSRF Cookie 要求 HTTPS。

当前 Web 客户端可能尚未提供 API 新增的全部登录与管理界面。请验证所部署版本的浏览器体验。

## 通用注册

在提供商处注册以下回调，scheme、host 与 path 必须完全一致：

```text
https://lag.example.com/api/auth/callback
```

通用设置：

```dotenv
AUTH_PROVIDER=oidc
AUTH_CLIENT_ID=<PROVIDER_CLIENT_ID>
AUTH_CLIENT_SECRET=<PROVIDER_CLIENT_SECRET>
AUTH_SCOPES=openid profile email
AUTH_PKCE=required
ALLOWED_HOSTS=https://lag.example.com
```

从 `GET /api/auth/login` 开始登录。回调会重定向至 `ALLOWED_HOSTS` 中第一个 origin。`ALLOWED_HOSTS` 是逗号分隔的精确 origin 列表，不得包含 path 或末尾斜线。

## 标准 OIDC

```dotenv
AUTH_PROVIDER=oidc
OIDC_ISSUER=https://id.example.com
AUTH_CLIENT_ID=<OIDC_CLIENT_ID>
AUTH_CLIENT_SECRET=<OIDC_CLIENT_SECRET>
ALLOWED_HOSTS=https://lag.example.com
```

Lag 获取 `${OIDC_ISSUER}/.well-known/openid-configuration`，要求 issuer 精确匹配，交换 code，验证 ID token 的签名、issuer、audience 与 nonce，默认使用 `sub` 和 `name`。Discovery 必须提供授权、token 与 JWKS 数据。如果存在 `end_session_endpoint`，注销响应会返回 `logoutUrl`。

## Prism 模式

Prism 模式遵循 OIDC discovery 和 token 验证，并增加团队角色映射与后通道注销：

```dotenv
AUTH_PROVIDER=prism
PRISM_ISSUER=https://prism.example.com
AUTH_CLIENT_ID=<PRISM_CLIENT_ID>
AUTH_CLIENT_SECRET=<PRISM_CLIENT_SECRET>
ALLOWED_HOSTS=https://lag.example.com
PRISM_TEAM_CLAIM_PATH=teams
PRISM_TEAM_ID_PATH=id
PRISM_TEAM_ID=<TEAM_ID>
PRISM_TEAM_ROLE_PATH=role
PRISM_OWNER_ROLES=owner,co-owner
```

将 Prism 后通道注销 URL 配置为 `https://lag.example.com/api/auth/backchannel-logout`。端点验证已签名 logout token 并拒绝重放。团队 owner claim 会创建持久化、团队范围的 `owner` grant。当前房间检查不会使用这些团队 grant，因此不能宣称 Prism 团队会自动拥有房间。

## 通用 OAuth 2.0

OAuth 模式不执行 discovery，也不验证 ID token。必须显式配置全部端点和 JSON 点路径：

```dotenv
AUTH_PROVIDER=oauth2
AUTH_CLIENT_ID=<OAUTH_CLIENT_ID>
AUTH_CLIENT_SECRET=<OAUTH_CLIENT_SECRET>
ALLOWED_HOSTS=https://lag.example.com
OAUTH_AUTHORIZATION_ENDPOINT=https://provider.example.com/oauth/authorize
OAUTH_TOKEN_ENDPOINT=https://provider.example.com/oauth/token
OAUTH_USERINFO_ENDPOINT=https://provider.example.com/api/user
OAUTH_SUBJECT_PATH=id
OAUTH_NAME_PATH=display_name
OAUTH_EMAIL_PATH=email
AUTH_SCOPES=profile email
```

用户信息端点必须在配置路径返回稳定 subject 与显示名称。OAuth 2.0 本身并非身份协议；只有提供商明确记录该端点的身份语义与传输安全时才使用此模式。

## 管理员与访客

首个新建外部身份会获得启动用 `platform_admin` grant。之后只有在 `AUTH_ADMIN_CLAIM_PATH` 解析值与 `AUTH_ADMIN_CLAIM_VALUE` 匹配时才授予该权限（数组成员或字符串相等）。保护首次启动，并审核数据库授权。

仅在允许纯昵称 `POST /api/session` 账号时设置 `GUEST_ENABLED=true`。访客不能创建私有或禁止访客的房间、不能进入私有房间，也不能接受指定用户邀请；可以使用允许访客的公开房间。

## 安全说明

- `AUTH_PKCE` 默认 `required`；`auto` 遵循提供商声明，`disabled` 则必须设置 client secret。
- 保持 HTTPS 与精确 origin。State 仅可使用一次，在 `OAUTH_TRANSACTION_SECONDS` 后过期（默认 600）。
- 代码只支持一个提供商配置，不支持同时多个提供商或账号关联。
- `PROXY_HEADER` 只是可信客户端 IP 头的名称。边缘代理必须移除客户端值，并只由可信代理写入。
