# 全文搜索（Meilisearch）

面向开发者的架构说明。平台的全文搜索已从 PostgreSQL `pg_trgm` 迁移到 Meilisearch（旧的 `pnpm db:search-indexes` 仅在回滚时保留）。

## 组成

| 文件 | 职责 |
| --- | --- |
| `src/lib/meilisearch.ts` | 客户端单例 + 索引名常量 `INDEX` + `safeSync` |
| `src/lib/search-index-config.ts` | 各索引的 settings 与 `ensureIndexes()` |
| `src/lib/search-sync.ts` | 文档增量同步 / 删除（`syncX` / `deleteX`） |
| `src/lib/meili-filters.ts` | 列表页查询的 filter / sort 字符串构建 |
| `src/server/routers/search.ts` | 搜索查询 tRPC 路由 |
| `scripts/reindex-meilisearch.ts` | 初始化与全量重建脚本 |

## 客户端与索引

`src/lib/meilisearch.ts`：

- `getMeili()` —— 懒加载单例，首次调用时读 `MEILISEARCH_URL` / `MEILISEARCH_MASTER_KEY`，缺失才 fail-fast（避免 import 期即抛错）。
- `meili` —— 一个 `Proxy`，用法与官方 SDK 一致（`meili.index(INDEX.video)`）；用 Proxy 是为了让 getter（如 `tasks`）以真实实例为 receiver，否则会触发私有字段访问错误。
- `safeSync(promise)` —— fire-and-forget 包装，吞掉并打印同步错误，**不阻塞、不影响主流程**。

索引（`primaryKey: "id"`）：

| `INDEX` key | uid | 内容 |
| --- | --- | --- |
| `video` | `videos` | 视频 |
| `game` | `games` | 游戏 |
| `image` | `imagePosts` | 图片帖 |
| `tag` | `tags` | 标签 |
| `user` | `users` | 用户 |

## 索引配置

`src/lib/search-index-config.ts` 为每个索引声明 `searchableAttributes` / `filterableAttributes` / `sortableAttributes`，并设置对中文更友好的 `typoTolerance`（3 字符容 1 错，6 字符容 2 错）。`ensureIndexes()` 会创建缺失索引并下发 settings。

| 索引 | 可搜索字段 | 可过滤字段 | 可排序字段 |
| --- | --- | --- | --- |
| videos | title, description, tagNames, uploaderNickname, uploaderUsername, author, keywords | status, tagSlugs, tagIds, uploaderId, isNsfw, createdAtTs, publishedAtTs | createdAtTs, publishedAtTs, views, likes |
| games | title, aliases, originalName, description, tagNames, originalAuthor, uploader*, keywords | status, tagSlugs, tagIds, gameType, isFree, isNsfw, createdAtTs, publishedAtTs | createdAtTs, publishedAtTs, views, downloads, likes |
| imagePosts | title, description, tagNames, uploaderNickname, uploaderUsername | status, tagSlugs, tagIds, isNsfw, createdAtTs, publishedAtTs | createdAtTs, publishedAtTs, views, likes |
| tags | name, slug, aliasNames, description | categoryId, videoCount, gameCount, imagePostCount | videoCount, gameCount, imagePostCount, name |
| users | nickname, username, bio | isBanned, role | videoCount |

> 时间字段以数值时间戳 `*Ts`（`createdAtTs` / `publishedAtTs`）入索引，便于排序与范围过滤。

## 文档同步

`src/lib/search-sync.ts` 对每种类型导出 `syncX(id)` 与 `deleteX(id)`（X = `Video` / `Game` / `ImagePost` / `Tag` / `User`）：从 Prisma 读取记录、拼装文档、upsert 到对应索引。

**触发点（增量同步）**：在内容相关路由里以 fire-and-forget 方式调用——

```ts
import { syncVideo, deleteVideo } from "@/lib/search-sync";
import { safeSync } from "@/lib/meilisearch";

void safeSync(syncVideo(video.id));   // 创建 / 编辑 / 审核通过
void safeSync(deleteVideo(input.id)); // 删除 / 驳回
```

调用方包括：`video.ts`、`game.ts`、`image.ts`、`tag.ts`、`user.ts` 以及后台审核路由 `admin/videos.ts`、`admin/games.ts`、`admin/images.ts`、`admin/tags.ts`、`admin/users.ts`。

> 同步是「尽力而为」：失败只记日志，不回滚业务。若怀疑索引漂移，跑一次全量重建（见下）。

## 查询

- **统一搜索页**：`search` 路由（`search.all` / `search.counts` / `search.guessForMe` / `search.getHotContents`）对多个 `meili.index(...).search(raw, ...)` 并行查询后聚合。
- **列表页**：当带搜索词时（`shouldMeiliListSearch()`）走 Meilisearch，用 `meili-filters.ts` 的 `videoListMeiliFilter` / `videoListMeiliSort` 等构建 filter/sort 字符串；无搜索词时回退到 Prisma 直查。
- NSFW、审核状态、标签、发布时间等过滤都通过 `filterableAttributes` + filter 字符串实现。

## 初始化与重建

脚本 `scripts/reindex-meilisearch.ts`：

```bash
pnpm meili:init            # 仅 ensureIndexes（创建索引 + 下发 settings）
pnpm meili:reindex         # ensureIndexes + 全量写文档（会先清空各索引）
pnpm meili:reindex:prod    # 同上，读 .env.production

# 直接调脚本可加参数：
pnpm exec tsx --require dotenv/config scripts/reindex-meilisearch.ts --init-only
pnpm exec tsx --require dotenv/config scripts/reindex-meilisearch.ts --only video,tag
```

全量重建按 `BATCH = 1000` 分批，`--only` 限定类型（`video|game|image|tag|user`），`--init-only` 只下发 settings 不写文档。

## 环境与部署

- 必需环境变量：`MEILISEARCH_URL`、`MEILISEARCH_MASTER_KEY`；Compose 场景下 `meilisearch` 容器额外读 `MEILI_MASTER_KEY`（须与前者一致）。
- 镜像：`getmeili/meilisearch:v1.12`，数据卷 `meilisearch_data`；本地默认 `http://127.0.0.1:7700`。
- 生产首次部署后执行一次 `pnpm meili:init && pnpm meili:reindex:prod`（容器内：`podman compose exec app pnpm meili:reindex:prod`）。

## 新增可搜索字段的步骤

1. 在 `search-index-config.ts` 把字段加入对应索引的 `searchableAttributes` / `filterableAttributes` / `sortableAttributes`。
2. 在 `search-sync.ts` 的 `syncX` 文档拼装里补上该字段（过滤/排序字段记得提供 `*Ts` 数值形式）。
3. 跑 `pnpm meili:reindex`（或 `--only <type>`）让旧文档带上新字段。
4. 如用于列表过滤，相应更新 `meili-filters.ts`。
