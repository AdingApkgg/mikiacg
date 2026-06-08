# 权限、角色与用户组

面向开发者的架构说明。注意：本文的「管理范围 adminScopes」与[开放平台 API 的 apiScopes](open-platform-api.md)是**两套独立**的权限系统。

## 角色（Role）

`Role` 枚举（`prisma/schema.prisma`）：`USER` / `ADMIN` / `OWNER`。

- `isPrivileged(role)` = ADMIN 或 OWNER；`isOwner(role)` = OWNER（`src/lib/permissions.ts`）。
- OWNER 拥有全部权限，不可被改角色或封禁；系统通常只允许一个 OWNER。

## 有效角色解析

`resolveRole(userRole, groupRole?)`（`src/lib/group-permissions.ts`）：**`group.role` 优先**，无组或组无 role 时回退 `user.role`。在 API Key 鉴权、`adminProcedure`、`ownerProcedure`、投稿/上传权限检查等处都用它得到 effectiveRole。

## 管理范围（adminScopes）

`ADMIN_SCOPES`（`src/lib/constants.ts`，共 10 个）：

| scope | 含义 |
| --- | --- |
| `video:moderate` | 视频审核 |
| `video:manage` | 视频管理 |
| `user:view` | 查看用户 |
| `user:manage` | 管理用户 |
| `tag:manage` | 标签管理 |
| `settings:manage` | 系统设置 |
| `comment:manage` | 评论管理 |
| `referral:view_all` | 全站推广查看 |
| `stats:view` | 数据总览 |
| `ticket:manage` | 工单管理 |

- 解析：`resolveAdminScopes(role, groupAdminScopes?)` —— OWNER 返回全部；ADMIN 返回 `group.adminScopes ?? user.adminScopes` 中的有效项（过滤非法 scope）；USER 返回 `[]`。
- 运行时检查：`requireScope(scope)` 中间件，挂在 `adminProcedure` 之后链式使用，例：`adminProcedure.use(requireScope("video:moderate"))`；缺权限抛 `FORBIDDEN`。
- 静态判定：`userHasScope(role, adminScopes, scope)`（OWNER 恒 true）。

## 用户组（UserGroup）

`UserGroup`（`prisma/schema.prisma`）字段要点：

| 字段 | 说明 |
| --- | --- |
| `role` | 组角色，决定成员有效 role（被 `resolveRole` 使用） |
| `permissions` (Json) | `{ canUpload, canComment, canDanmaku, canChat, canDownload, adsEnabled }` |
| `adminScopes` (Json?) | 组级管理范围 |
| `storageQuota` (BigInt) | 默认存储配额（默认 5GB） |
| `referralMaxLinks` (Int) | 每用户推广链接上限（0=不限） |
| `isDefault` / `isSystem` | 新用户默认组 / 系统内置组（不可删） |

- 改 `group.role` 会**事务内同步**所有成员的 `User.role`；删除组时成员迁移到默认组并同步 role；`assignUsersToGroup` 同样同步。
- 权限合并 `resolvePermissions(role, groupPermissions?)`：OWNER 全量，其他角色用 `DEFAULT_PERMISSIONS` 合并组权限覆盖。

## Procedure 层级

| Procedure | 中间件 | 注入 ctx |
| --- | --- | --- |
| `publicProcedure` | API Key scope + 限流 | — |
| `protectedProcedure` | + 登录校验 | `session.user` |
| `adminProcedure` | + 管理员校验 | `adminRole`、`adminScopes` |
| `ownerProcedure` | + 站长校验 | — |

`enforceUserIsAdmin` 流程：查 `role/adminScopes/group` → `resolveRole` → `isPrivileged` 校验 → `resolveAdminScopes` → 注入 `ctx.adminRole` / `ctx.adminScopes`。

## 投稿权限（三层 OR）

`assertCanUpload`（`src/server/publish-utils.ts`）：
```
canUpload = isPrivileged(effectiveRole)
         || groupPermissions.canUpload
         || user.canUpload
```

## tRPC 路由

- `admin.groups.*`（**ownerProcedure**）：`listGroups` / `getGroup` / `createGroup` / `updateGroup` / `deleteGroup` / `assignUsersToGroup` / `setDefaultGroup` / `reorderGroups`。
- `admin.users.*`：用户管理、`banUser`/`unbanUser`（`requireScope("user:manage")`）。
- 内容审核 / 评论管理等在各自 admin 路由用 `requireScope(...)`。

## 注意点 / 陷阱

- `adminScopes` 优先用组的，组没有才用用户自身的；改组 scope 对已分配成员在下次请求即生效（动态解析，不回写 user 表）。
- `apiKeyScopes`（开放平台）与 `adminScopes`（后台）相互独立；一个带 ADMIN 角色的 API Key 调管理接口要**同时**满足两套校验。
- 角色按 USER/ADMIN/OWNER 三层硬编码，新增角色需改 `resolveRole`/`isPrivileged`/`resolveAdminScopes` 及所有中间件，成本高、不推荐。

## 如何扩展

- **新增 adminScope**：在 `constants.ts` 的 `ADMIN_SCOPES` 加 `"x:y": "中文名"` → 在对应 `adminProcedure` 上 `.use(requireScope("x:y"))` → 后台用户组/用户编辑 UI 自动从 `ADMIN_SCOPES` 读取展示。
