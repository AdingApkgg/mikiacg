# Next-Auth → Better Auth 迁移说明

> **历史记录**：本文档记录当初从 next-auth 迁移到 Better Auth 的过程与决策，仅作存档参考，不代表当前实现的全貌。下文「账号切换」一节已更新，反映现状。

## 已完成的修改

- **认证库**：移除 `next-auth`、`@auth/prisma-adapter`，接入 `better-auth`。
- **服务端**：`src/lib/auth.ts` 使用 Better Auth + Prisma + bcrypt + username 插件，并做了与现有 User/Session/Account 的字段映射。
- **客户端**：`src/lib/auth-client.ts` 提供 `authClient` 与兼容的 `useSession()`。
- **API**：`/api/auth/[...all]` 使用 `toNextJsHandler(auth)`；`/api/auth/session-info`、`/api/auth/switch`、`/api/upload`、`/api/indexnow` 等改为使用 `getSession()`。
- **tRPC**：`createContext` 与鉴权中间件改为使用 `getSession()` 与 `AppSession` 类型。
- **前端**：所有原 `next-auth/react` 的 `useSession`/`signIn`/`signOut` 已替换为 `@/lib/auth-client`；登录页支持「邮箱或用户名」登录（邮箱用 `signIn.email`，用户名用 `signIn.username`）。
- **Prisma**：为 Better Auth 增加/调整字段：`Account.password`、`Session` 的 `ipAddress`/`userAgent`/`createdAt`/`updatedAt`、新表 `Verification`、`User.displayUsername`。

## 数据库迁移与既有用户

1. **执行 Prisma 迁移**
   ```bash
   pnpm prisma migrate dev --name better-auth-schema
   ```
   或已有生产数据时先检查生成的 SQL，再 `prisma migrate deploy`。

2. **既有用户（仅密码登录）**
   - 原 next-auth 把密码存在 `User.password`，Better Auth 把密码存在 `Account` 表（`providerId = "credential"`）。
   - 需要为每个「只有密码、没有 Account」的用户补一条 Account：
     - `userId` = 用户 id
     - `provider` = `"credential"`
     - `providerAccountId` = 用户 id（或与现有唯一约束一致）
     - `password` = 该用户当前的 `User.password`（已是 bcrypt 哈希）
     - `type` = `"credential"`
   - 可写一次性脚本：查 `User` 中 `password != null` 且不存在对应 `Account`（provider=credential）的记录，插入上述 Account。迁移完成后可择机清空 `User.password` 或保留一段时间。

3. **环境变量**
   - 建议设置 `BETTER_AUTH_BASE_URL`（或 `NEXT_PUBLIC_APP_URL`），与站点实际访问地址一致，避免回调/重定向异常。
   - `AUTH_SECRET` 可继续使用，Better Auth 会读；若用 `BETTER_AUTH_SECRET` 则与文档一致。

## 账号切换

> **现状（已更新）**：登录页（`src/app/(auth)/login/page.tsx`）已提供「添加账号 / 切换账号」流程——基于**重新输入密码鉴权**实现，而非无密码即时切换。迁移初期的 `/api/auth/switch`（返回 501 的无密码切换端点）已不再使用。

历史说明：当初 Better Auth 下没有现成的「以目标用户创建 session 并写 cookie」的无密码切换方案，因此切换账号统一走重新登录鉴权的流程。

## 登录行为

- **邮箱**：`authClient.signIn.email({ email, password })`
- **用户名**：`authClient.signIn.username({ username, password })`
- 登录页「邮箱或用户名」输入框：若包含 `@` 则走邮箱，否则走用户名。

## 会话与权限

- 服务端统一用 `getSession()` 获取当前用户与 session（含从 DB 补全的 role、canUpload 等）。
- tRPC 的 `protectedProcedure` / `adminProcedure` / `ownerProcedure` 逻辑不变，仍基于 `ctx.session.user`。
