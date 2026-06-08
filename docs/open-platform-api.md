# 开放平台 API（API Key）

面向开发者的架构说明，介绍平台对外编程接口的鉴权、权限模型与扩展方式。终端用户向导（含每个接口的参数与示例）见站内 [`/api-docs`](../src/app/api-docs)（MDX 页面）。

## 两个容易混淆的「API」

| | 程序化 API | `/.well-known/openapi.yaml` |
| --- | --- | --- |
| 用途 | 脚本 / 爬虫 / 自动化**调用平台功能** | 给 AI 代理 / 搜索引擎**发现公开页面** |
| 形态 | tRPC over HTTP + API Key | 静态 OpenAPI 3.1 规范，描述 HTML 页面 URL |
| 鉴权 | `Authorization: Bearer sk-...` | 无（公开内容） |
| 实现 | `openApi` 等 tRPC 路由 | `src/app/.well-known/openapi.yaml/route.ts` |

本文只讲第一种（程序化 API）。

## 请求格式

所有接口都是标准 tRPC HTTP 调用，统一走 `POST /api/trpc/<router>.<procedure>`：

```bash
curl -X POST 'https://your-domain.com/api/trpc/video.list' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer sk-your-api-key' \
  -d '{"json":{"limit":10,"page":1}}'
```

- 入参包裹在 `{"json": {...}}`（superjson transformer）。
- 成功响应数据在 `result.data.json`，错误在 `error.data.code` / `httpStatus`。
- 公开接口（以 `publicProcedure` 定义、无需登录的查询）可不带 Key 调用；标注「需登录」的接口必须带 Key 或 cookie session。scope 映射只在请求**带 Key**时生效。

## 鉴权流程

入口在 [`src/server/trpc.ts`](../src/server/trpc.ts) 的 `resolveApiKey()`：

1. 读取 `Authorization` 头，要求以 `Bearer sk-` 开头。
2. 对完整 Key 取 `sha256` 得到 `keyHash`，按 `keyHash` 查 `ApiKey` 表（数据库**不存明文**，仅存 `keyHash` + 展示用 `keyPrefix`）。
3. 校验：Key 存在、未过期（`expiresAt`）、所属用户未被封禁（`isBanned`）。
4. 异步更新 `lastUsedAt`（不阻塞请求）。
5. 用 `resolveRole(user.role, group.role)` 计算有效角色，合成一个 `AppSession` 注入 `ctx.session`，并把该 Key 的 scope 列表放入 `ctx.apiKeyScopes`。

未命中 Key 时回退到 cookie session（浏览器用户）。因此**同一套 tRPC 路由同时服务浏览器与 API Key 客户端**。

## 权限模型（两层）

### 第 1 层：全局路由级 scope（`enforceApiKeyScope`）

`baseProcedure`（所有 procedure 的基类）挂了全局中间件 `enforceApiKeyScope`。**仅当请求是 API Key 时生效**（`ctx.apiKeyScopes` 非空）；浏览器 session 不受此限制。

它按路由名查 `API_SCOPE_ROUTER_MAP`（`src/server/trpc.ts`），规则：

- `{ read, write }` —— query 需要 `read` scope，mutation 需要 `write` scope；缺写则该路由对 Key 只读。
- `"self"` —— 路由自行管理 scope（见第 2 层），中间件放行。
- `"block"` —— 该路由不支持 Key 访问，直接 `FORBIDDEN`。
- 未在表中登记的路由 —— 同样拒绝 Key 访问。

当前映射（节选，以代码为准）：

| 路由 | 映射 | 说明 |
| --- | --- | --- |
| `video` `game` `image` `tag` `series` `import` `playlist` | `content:read` / `content:write` | 内容 |
| `sticker` | `content:read`（仅读） | |
| `comment` `gameComment` `imagePostComment` | `comment:read` / `comment:write` | 评论 |
| `follow` `message` `channel` `guestbook` | `social:read` / `social:write` | 社交 |
| `file` | `file:read` / `file:write` | 文件 |
| `user` `apiKey` | `user:read` / `user:write` | 用户 / 密钥自管理 |
| `referral` | `referral:read` / `referral:write` | 推广 |
| `payment` `redeem` | `payment:read` / `payment:write` | 支付 / 兑换 |
| `notification` | `notification:read` / `notification:write` | 通知 |
| `site` | `system:read`（仅读） | 系统信息 |
| `admin` | `admin:read` / `admin:write` | **额外**仍要求管理员角色 |
| `openApi` | `self` | 自管理（统计 / feed / 推广报表等） |
| `ticket` `setup` | `block` | 禁止 Key 访问 |

### 第 2 层：显式 scope（`apiScopedProcedure`）

`openApi` 路由用 `apiScopedProcedure("stats:read")` 这类显式声明（底层是 `requireApiScope` 中间件）。同样**只校验 Key 请求**——浏览器 session 用户可直接访问。用于那些不属于某个 CRUD 资源、需要单独标注 scope 的端点（如 `openApi.overview`、`openApi.search`、`openApi.feed`、`openApi.referral*`）。

> 注意：`admin` 路由即使带了 `admin:*` scope，仍会经 `enforceUserIsAdmin` 校验有效角色（ADMIN / OWNER），普通用户的 Key 拿不到管理接口。

## 速率限制

`enforceApiKeyRateLimit`（同样挂在 `baseProcedure`，仅对 Key 生效）：

- Redis 滑动窗口（zset），按 `api_rate:<userId>` 计数。
- 默认 **120 次 / 60 秒**（`API_RATE_LIMIT` / `API_RATE_WINDOW_SECONDS`）。
- 超限抛 `TOO_MANY_REQUESTS`；Redis 不可用时跳过限流。

## Scope 定义

全部 scope 在 [`src/lib/api-scopes.ts`](../src/lib/api-scopes.ts)，前后端共享：

- `API_SCOPE_GROUPS` —— 分组（content / comment / social / file / user / referral / payment / notification / stats / system / admin）× 操作（`:read` / `:write`），含中文 label/desc，用于「设置 → 开发者」的勾选 UI。
- `API_SCOPE_TEMPLATES` —— 预设模板（全部权限 / 仅发布内容 / 只读访问 / 数据分析 / 推广运营）。
- 工具函数：`ALL_SCOPE_IDS`、`isValidScope`、`validateScopes`、`summarizeScopes`、`getScopeGroupLabel`。

## API Key 管理

通过 `apiKey` 路由（`protectedProcedure`，需登录；页面在 [`/settings/developer`](../src/app/settings/developer)）：

- `apiKey.list` —— 列出当前用户的 Key（返回 `keyPrefix`、`scopes`、`lastUsedAt`、`expiresAt`，**不返回明文**）。
- `apiKey.create` —— 创建，入参 `{ name, scopes, expiresAt? }`；**明文 `sk-...` 仅在创建响应中返回一次**，之后只存 `keyHash` + `keyPrefix`。
- `apiKey.delete` —— 删除（校验归属当前用户）。

## 如何新增一个 API 端点

1. **属于已登记路由**（如 `video`）：直接在该路由加 `protectedProcedure`/`publicProcedure` 即可，scope 由全局映射按 query/mutation 自动套用，无需改鉴权代码。
2. **自管理端点**（统计、报表类）：放进 `openApi` 路由，用 `apiScopedProcedure("<scope>")` 声明所需 scope。
3. **需要新增 scope**：在 `api-scopes.ts` 的 `API_SCOPE_GROUPS` 加条目 → 在 `API_SCOPE_ROUTER_MAP` 给对应路由登记（或在 openApi 中显式引用）→ 在 `/api-docs` 对应 MDX 补文档。
4. **完全不对外**：在 `API_SCOPE_ROUTER_MAP` 标 `"block"`（如 `setup`、`ticket`）。

## 相关文件

- 鉴权 / 中间件 / 路由映射：`src/server/trpc.ts`
- scope 定义：`src/lib/api-scopes.ts`
- 对外数据端点：`src/server/routers/open-api.ts`
- Key 管理：`src/server/routers/api-key.ts`
- 用户向导文档（MDX）：`src/app/api-docs/`
- AI/SEO 发现规范：`src/app/.well-known/openapi.yaml/route.ts`
