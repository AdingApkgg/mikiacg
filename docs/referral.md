# 推广 / 推荐系统

面向开发者的架构说明。覆盖推广链接、点击归因、注册/付费回填与积分联动。逻辑集中在 `src/server/routers/referral.ts`。

## 数据模型

| 模型 | 说明 |
| --- | --- |
| `ReferralLink` | 链接：`code`(8 位 nanoid)、`label`、`channel`、`targetUrl`、`note`、统计字段（`clicks`/`uniqueClicks`/`registers`/`paymentCount`/`paymentAmount`/`isActive`） |
| `ReferralClick` | 点击：`visitorHash`、`ip`、`referer`、`date`，唯一约束 `(referralLinkId, visitorHash, date)` |
| `ReferralDailyStat` | 每日聚合：`(referralLinkId, date)` 维度的 clicks/uniqueClicks/registers/paymentCount/paymentAmount |
| `ReferralRecord` | 推荐记录：`referrerId`、`referredUserId`(唯一)、`referralLinkId?`、`pointsAwarded`、`hasPaid`、`firstPaidAt` |

每用户链接上限由 `UserGroup.referralMaxLinks` 控制（0=不限）。

## 点击追踪（`/r/[code]`）

`src/app/r/[code]/route.ts`：校验 `referralEnabled` + 链接存在且 `isActive` → 取 IP/UA/Referer → `visitorHash = SHA-256(IP|UA)` → 尝试建 `ReferralClick`（唯一约束做**同访客同天同链接去重**，冲突则 `isUnique=false`）→ `clicks += 1`、唯一则 `uniqueClicks += 1`、upsert `ReferralDailyStat` → 写 `ref_code` cookie（30 天，非 httpOnly，供注册时恢复）→ 跳转 `targetUrl` 或站点首页。

> 去重为**日级**粒度；跨天同访客会重复计入 clicks（用于活跃度度量）。无频率风控（可在 WAF 层补）。

## 注册与付费回填

- **注册**（`user.register`，带 `referralCode` 时）：事务内设 `user.referredById`，建 `ReferralRecord`，推广者积分 += `referralPointsPerUser`（默认 100）+ 写 `PointsTransaction(REFERRAL_REWARD)`，`ReferralLink.registers += 1`，upsert 日统计。`referredUserId` 唯一 → 一人只被记录一次推荐。
- **付费**（支付确认时，`payment.ts` 的 `updateReferralPaymentStats`）：`ReferralLink.paymentCount/Amount` 累加、upsert 日统计、`ReferralRecord.updateMany({referredUserId, hasPaid:false}, {hasPaid:true, firstPaidAt:now})`（幂等：仅首笔标记）。详见[支付文档](points-payment.md)。

## 积分联动（签到/登录）

`referral` 路由同时承载积分相关：`claimDailyLogin`（`awardDailyLogin`）、`checkin`（`awardCheckin`，正态分布随机积分 + Redis/DB 防重复）、`getCheckinStatus`、`getPointsHistory`、`adminAdjustPoints`。详见[积分文档](points-payment.md)。

## tRPC 路由

- **用户**：`getMyStats` / `getMyTrendStats` / `getMyDailyHistory` / `getChannelStats` / `getTopLinks` / `ensureReferralCode` / `getMyLinks` / `createLink` / `updateLink` / `deleteLink` / `getMyReferrals` / `getPointsHistory` / `claimDailyLogin` / `checkin` / `getCheckinStatus`。
- **管理**：`adminGetOverview` / `adminGetTrendStats` / `adminGetTopReferrers` / `adminGetAllLinks`（需 `requireScope("referral:view_all")`）/ `adminAdjustPoints` / `adminGetChannelBreakdown` / `adminGetFunnel`。

前台：`/promotion`（推广中心，渠道选项 bilibili/twitter/telegram/…）、`/r/[code]`（跳转）。后台：`/dashboard/referral-admin`。

## 注意点 / 陷阱

- `ReferralRecord.referredUserId` 唯一 —— 已有推荐记录的用户无法被二次归因。
- 点击日级去重、跨天重复计数是有意设计。
- 付费回填幂等，仅首笔订单把 `hasPaid` 置 true，后续订单不重复奖励。
- `channel` 可为 null，聚合时归入 "direct"/"other"；前台 "_none" 存为 null。
- 只有 `adminGetAllLinks` 加了 `referral:view_all` scope，其余管理端为默认 `adminProcedure`。

## 如何扩展

- **多级分销**：`ReferralRecord` 加 `parentReferralRecordId` + 级联奖励逻辑（当前仅一级）。
- **动态佣金**：`ReferralLink` 加 `bonusMultiplier` 或 `PaymentOrder` 加 `referralBonus`，在 `updateReferralPaymentStats` 按订单金额算推广者奖励（当前付费仅标记 `hasPaid`，不额外发积分）。
- **风控**：`ReferralLink` 加 `status`（ACTIVE/SUSPICIOUS/BANNED）+ 审核队列。
