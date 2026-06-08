# 内容发布与审核

面向开发者的架构说明。视频 / 游戏 / 图片帖共用同一套状态机与发布时间语义。

## 状态机

`VideoStatus`（`prisma/schema.prisma`，三类内容共用）：`PENDING` / `PUBLISHED` / `REJECTED` / `DELETED`。

```
普通用户投稿 ──► PENDING ──审核──► PUBLISHED
管理员投稿   ──► PUBLISHED          └──► REJECTED
普通用户编辑已发布/被驳回内容 ──► 回到 PENDING（管理员编辑保持 PUBLISHED）
```

- 投稿初始状态由 `resolvePublishStatus(role)`（`src/server/publish-utils.ts`）决定：`isPrivileged` → `PUBLISHED`，否则 `PENDING`。**无自动审核**。
- 改状态：管理员审核（`admin.moderateVideo/Game/Image` 及批量版）。

## publishedAt 语义

- **何时写**：状态从非 PUBLISHED 转为 PUBLISHED 时写 `publishedAt = now`（审核通过 / 管理员直接发布）。用 `updateMany where status != PUBLISHED` 原子条件，已发布内容再次「通过」不会刷新时间（count=0）。
- **语义**：发布时间 = 最近一次上架；被驳回后再次通过会重写为新时间。`shouldRefreshPublishedAt(old, new)`（`src/lib/publication.ts`）判断是否刷新。
- **可空**：PENDING/REJECTED/DELETED 的 `publishedAt` 为 null。
- **排序/游标**：`src/lib/publication.ts` 提供 `*FeedPublishedOrderBy`（`publishedAt DESC nulls last, id DESC`）与 `*FeedCreatedFallbackOrderBy`（老数据无 publishedAt 时回退 `createdAt`）；跨内容类型的混合游标用 `encode/decodePublicationFeedCursor`（`publicationTime + type + id`）。展示日期取 `publishedAt ?? createdAt`。

## 审核动作副作用

审核通过（`src/server/routers/admin/{videos,games,images}.ts`，事务内）：

1. 写 `status = PUBLISHED` + `publishedAt`。
2. **搜索同步**：`void safeSync(syncVideo/Game/ImagePost(id))` —— `status != PUBLISHED` 会从 Meilisearch 删文档，否则索引（含 `publishedAtTs = (publishedAt ?? createdAt).getTime()`）。详见[搜索文档](search-meilisearch.md)。
3. **站内通知**：`TICKET`/`CONTENT_STATUS` 类通知告知投稿人结果。
4. **搜索引擎推送**：发布时提交 IndexNow + Google Search Console（`src/lib/indexnow.ts`，覆盖视频/游戏/图片帖/合集）。

驳回：仅改状态（Meilisearch 文档随同步被删除），不推送搜索引擎。

## 投稿权限

见[权限文档](permissions-roles.md)：`canUpload = isPrivileged(role) || group.permissions.canUpload || user.canUpload`（三层 OR）。

## tRPC 路由

- 用户：`video.create` / `batchCreate` / `update`（game / image 同构）。`update` 按角色决定是否回到 PENDING，并用 `shouldRefreshPublishedAt` 决定是否刷新 `publishedAt`。
- 管理：`admin.moderateVideo` / `batchModerateVideos`（game / image 同构）。批量返回 `count`（实际更新数）与 `targetCount`（目标数），已发布内容再批准不计入 count。

## 注意点 / 陷阱

- 已发布内容被普通用户编辑会降级回 PENDING 重新审核；管理员编辑不降级。
- 旧数据迁移用 `scripts/migrate-published-at.ts`（幂等：仅回填 `status=PUBLISHED && publishedAt=null` 的记录，用 `updatedAt`；未过审记录保持 null）。
- Meilisearch 的 `publishedAtTs` 是 filterable+sortable；引入该字段后需全量 reindex，否则旧文档缺该字段会被范围过滤排除。

## 如何扩展（新增内容类型）

新增第四类内容（如小说/漫画）需接入：Prisma 模型（`status` + `publishedAt`）→ `publication.ts`（排序/游标/where 帮助函数）→ `search-sync.ts`（`syncX`/`deleteX`）→ `search-index-config.ts`（新索引）→ `indexnow.ts`（路径前缀 + 提交函数）→ admin 路由（审核，仅 `status != PUBLISHED` 时写 `publishedAt`）→ 用户路由（`resolvePublishStatus` + `shouldRefreshPublishedAt`）→ 前台列表/feed。
