# 排行榜系统

面向开发者的架构说明。后台定时计算榜单，写入 Redis ZSet 与 `RankingSnapshot` 快照，前台 `/ranking` 三栏读取。

## 榜单维度

类型定义在 `src/lib/ranking/types.ts`：

- **ContentType**：`video` / `image` / `game` / `combined`（综合混排）/ `tag`。
- **Category**：`score`（综合分）/ `surge`（飙升，当前 24h − 前 24h）/ `fav_period`（周期新增收藏）/ `fav_total`（累计收藏）/ `tag_hot` / `tag_surge`。
- **Period**：`1d` / `7d` / `30d` / `all`。

前台 `/ranking`（`src/app/ranking/client.tsx`）三栏 Tab：**热门排行**（上述榜单矩阵）、**内容排行**（按 views/likes/favorites/comments/downloads 取 Top 20）、**用户排行**（积分/投稿/评论/点赞/收藏 Top 20）。`/rankings` 已合并至此。

## 评分算法

`src/lib/ranking/score.ts` 的 `calculateScore`：
```
score = views*0.1 + likes*1 + favorites*3 + comments*2   // DEFAULT_WEIGHTS
```
- 权重可由 `SiteConfig.rankingWeights` 覆盖。
- 视图按周期衰减（1d×0.05、7d×0.2、30d×0.5、all×1.0）。
- 飙升榜取「近 24h 新增互动分 − 前 24h 同期」，仅保留 delta>0。
- 标签榜用「近 24h 新内容携带标签计数环比增量」近似（`tag_hot` 用 Tag 表预计算的 `videoCount+gameCount+imagePostCount`）。

## 计算与快照

`src/lib/ranking/compute.ts`：各类型分别 `computeScore/Surge/FavPeriod/FavTotal`，综合榜 `computeCombinedRanking` 按 `DEFAULT_COMBINED_QUOTA`（video 40 / image 30 / game 30）各取 N 条后按归一化分混排（id 编码为 `"<type>:<id>"`，前端拆分）。

`persistRanking()`：写 Redis（`setRanking`）+ 落 `RankingSnapshot { category, contentType, period, items(JSON [{id,score,rank}]), createdAt }`。计算只统计 `status=PUBLISHED`。

## 缓存

`src/lib/ranking/cache.ts`，Redis ZSet：

- Key：`rank:<contentType>:<category>:<period>`（如 `rank:video:score:1d`）。
- 写：先 `DEL` 后批量 `ZADD`；读：`ZREVRANGE`。TTL 21600s（略大于最长刷新间隔，防 cron 失败空窗）。
- `REDIS_URL` 未配则缓存层 no-op、查询返回空数组（前台显示「暂无排名」，不报错）。

## 调度

`src/lib/ranking/scheduler.ts`，`startRankingScheduler()` 在 `src/instrumentation.ts` 启动（仅生产、非 serverless；受 `SiteConfig.rankingEnabled` 控制）。

- 约 25 个任务，刷新间隔随周期变化（如 1d 榜 10min、7d 榜 1h、30d 榜 2h、surge 30min、combined 略大于基础榜）。
- 每任务执行前抢分布式锁 `rank:lock:<taskName>`（`SET NX EX`，TTL≈interval×0.8），失败静默跳过 → 多实例只有一个执行。
- 启动有 30s warmup 延迟，避免冷启动同时触发。

## tRPC 路由

- 公开：`ranking.list({ contentType, category, period, limit, offset, excludeNsfw })`、`ranking.tags({ category, limit, offset })`。`list` 自动归一周期（surge→1d、fav_total→all、tag_hot→all、tag_surge→1d），combined 拆 `type:id` 后回查详情。
- 管理：`admin.ranking.getConfig` / `updateConfig`（改 weights/topN/quota，**自动重启调度器**）/ `getSnapshots(days)` / `refresh`（手动立即重算）。

## 配置（SiteConfig）

`rankingEnabled`（默认 true）、`rankingTopN`（默认 100，上限 1000）、`rankingWeights`（JSON）、`rankingCombinedQuota`（JSON）。env：`REDIS_URL`。

## 注意点 / 陷阱

- combined 榜 id 是 `"<type>:<id>"`，消费端必须拆分。
- 互动聚合预取 `max(topN*5, 200)` 条再排序，应对分布不均。
- `tag_hot` 依赖 Tag 表计数字段的准确维护，非实时聚合。
- 改配置后 `updateConfig` 主动 `restartRankingScheduler()`；权重变更下个周期生效，无需重启应用。

## 如何扩展

新增榜单：`types.ts` 加 category/contentType → `compute.ts` 写 `computeXxx` → `scheduler.ts` 注册任务（`persistRanking`）→（如需公开）`ranking.ts` 加端点 → 前台加 Tab。调权重直接在 `/dashboard/rankings` 改。
