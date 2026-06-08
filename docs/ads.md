# 广告系统

面向开发者的架构说明。广告配置存于 `SiteConfig.sponsorAds`，逻辑核心在 `src/lib/ads.ts`，埋点落 `AdMetric`。

## 广告位

`AdPosition`（`src/lib/ads.ts`）：通用 `sidebar` / `header` / `header-carousel` / `in-feed` / `floating` / `popup`，页面特定 `video-detail` / `comment` / `profile` / `search` / `category`，特殊 `ad-gate`、`all`（默认匹配所有位置）。`SLOT_CONFIG` 把 `slotId` 映射到位置与图片尺寸（banner/card/sidebar）。

组件：`<AdSlot slotId>`、`<AdCard>`、`<InlineAdList>` / `<InlineAdGrid>`（列表/网格内插广告）、`<HeaderBannerCarousel>`。

## 广告门（Ad Gate）

配置（`SiteConfig`）：`adGateEnabled`、`adGateViewsRequired`（默认 3）、`adGateHours`（默认 12）。

机制（`src/components/ads/ad-gate.tsx`，纯浏览器存储）：点击广告新开标签 → 在广告页停留 1s~10min → 返回（`visibilitychange`/`focus`）计数 +1（localStorage `acgn_ad_gate_view_count`）→ 达标后写 `acgn_ad_gate_free_until = now + adGateHours*3600s`，期内隐藏广告门。

## 定向与排期

- `Ad.targeting`：`devices`（desktop/mobile/tablet/tauri）、`loginStates`（guest/user）、`categories`、`locales`。
- `Ad.schedule`：`daysOfWeek`（0=周日）、`hourRanges`（`[[9,17],[22,24]]`，跨午夜需拆两段）；另有 `startDate`/`endDate` 粗排期。
- `Ad.caps`：`dailyImpressions/Clicks`、`totalImpressions/Clicks`（总量达上限永久下线）。
- 选取链路：`getActiveAds(ads, slotPosition, ctx)` = 粗排期 → 细排期 → 位置匹配 → 定向匹配；最后用加权随机不重复（权重 1–100）挑选。

## HTML 代码位

`Ad.kind = "html"` + `Ad.html`（≤20000 字）。`src/components/ads/ad-html.tsx` 用 `innerHTML` 注入并**手动克隆 `<script>` 重新挂载**（否则不执行），用于 AdSense/联盟 SDK。⚠️ 支持任意 JS，存在 XSS 风险，编辑权限应受控。

## 信息流广告

`useInlineAds<T>`（`src/hooks/use-inline-ads.ts`）：参数 `count`(默认4) / `interval`(默认3) / `firstAdPosition`(默认2) / `minItemsForAds`(默认4) / `seed`（分页+筛选，保证位置稳定）。返回 `gridItems`（content/ad 混合）。首条插在高可见区，其余按 `step` 均匀分布。

## 埋点统计

- 上报：`ad.report({ adId, type: "impression" | "click" })`（publicProcedure）。Redis 去重（曝光 30s、点击 5s 同 IP+adId+type 只记一次；Redis 不可用则不去重但仍计数）。
- 存储：`AdMetric { adId, date(UTC 日), impressions, clicks }`，主键 `(adId, date)`。
- 客户端：`useAdTracking()`（`trackEvent`）、`useAdImpression(ref, adId)`（IntersectionObserver，500ms 可见上报，本地 1min 去重）。
- 管理查询：`admin.ads.getAllMetrics/getMetricsByAd/getDailyTrend/getTopAds`。

## 是否展示广告

`useAds`（`src/hooks/use-ads.ts`）：`showAds = SiteConfig.adsEnabled && (未登录 || user.adsEnabled !== false)`。用户级 `User.adsEnabled` 可后台单独关闭（会员免广告），用户组 `permissions.adsEnabled` 亦可参与。

## 导入导出

后台 `/dashboard/ads`：导出 `{ _format:"moestream-ads", _version:1, ads:[] }`；导入支持 `replace`（全量替换）/ `merge`（按 id 去重合并，补缺失 id/createdAt）。

## tRPC 路由 / 配置

- 公开 `ad.report`；管理 `admin.getSiteConfig`/`updateSiteConfig`（含 `sponsorAds`、`adsEnabled`）需 `requireScope("settings:manage")`，及 `admin.ads.*` 指标。
- 广告配置全部存 `SiteConfig`，无专用 env。`sponsorAds` 的 Zod 校验在 `src/server/routers/admin/config.ts`。

## 注意点 / 陷阱

- `header-carousel` **不被 `"all"` 匹配**，必须显式配置 `positions`。
- 旧数据用单个 `position`，`normalizePositions()` 兼容为 `positions[]`（默认 `["all"]`）。
- `AdRuntimeContext.exhaustedIds`（cap 耗尽集合）接口已预留，但客户端**当前未填充**，cap 需服务端预算后注入才生效。
- `<AdSlot>` 用 `useSyncExternalStore` 仅在 mount 后渲染，避免 hydration 不匹配。
- 广告门状态存本地，清缓存/换设备即重置，不与服务端同步。

## 如何扩展

- **新增广告位**：扩 `AdPosition` → `AD_POSITIONS` → `SLOT_CONFIG` → 后台 config Zod enum。
- **新增定向/排期/cap 维度**：扩对应 interface（`AdTargeting`/`AdSchedule`/`AdCaps`）+ `parseXxx()` + 匹配逻辑（`isAdTargetingMatched`/`isAdInFineSchedule`）。
