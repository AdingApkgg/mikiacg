# 积分与支付（USDT TRC-20）

面向开发者的架构说明，覆盖积分发放、USDT 充值（链上监听）、兑换码。

## 积分系统

- 核心：`src/lib/points.ts` 的 `awardPoints(userId, action)`，按 `SiteConfig.pointsRules`（JSON，内存缓存 60s）发放，支持每日上限（Redis 原子计数）与 `firstTimeOnly`（防重复，如点赞）。
- 记录：`PointsTransaction { userId, amount, balance, type, description, relatedId, createdAt }`。
- 封装：`awardDailyLogin()`（每日登录）、`awardCheckin()`（签到，正态分布随机积分，Redis + DB 双重防重复）。
- `PointsTransactionType`（枚举，节选）：`REFERRAL_REWARD`、`ADMIN_ADJUST`、`DAILY_LOGIN`、`CHECKIN`、`REDEEM_CODE`、`USDT_RECHARGE`、以及 `WATCH/LIKE/FAVORITE/COMMENT_*`（视频/游戏/图片交互）。

## 支付流程（套餐 → 订单 → 链上确认）

```
PaymentPackage ──createOrder──► PaymentOrder(PENDING, 唯一金额)
                                     │
        Tron 链上监听匹配到转账 ──────►  PAID  → 发积分 / 开通投稿 / 回填推广
                                     │
              超时未支付 ───────────►  EXPIRED      用户/管理员取消 → CANCELLED
```

- **下单**（`payment.createOrder`，`src/server/routers/payment.ts`）：校验 `usdtPaymentEnabled`、限制用户未支付订单 ≤3；用 `generateUniqueAmount(base, timeout)` 生成**唯一金额**（小数位差异化防撞单）；生成 `orderNo`，写入 `walletAddress` / `expiresAt` / `pointsAmount` / `grantUpload` / `referralLinkId`。
- `PaymentStatus`：`PENDING` / `PAID` / `EXPIRED` / `CANCELLED`。
- 套餐字段：`PaymentPackage { name, amount(USDT), pointsAmount, grantUpload, isActive, sortOrder }`。

## Tron 链上监听

`src/lib/tron-monitor.ts`，在 `src/instrumentation.ts` 中 `startTronMonitor()` 启动（仅生产、非 serverless）。

- **轮询**：每 15s 拉 TronGrid `/v1/accounts/{address}/transactions/trc20`（无 webhook、无需 API key）。
- **匹配**：`contract_address` = USDT TRC-20 合约（`TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`），`to` = 收款地址；按金额与 PENDING 订单做唯一金额匹配（差异 <0.001）。
- **确认副作用**（事务）：订单 → `PAID`；用户积分 += `pointsAmount` + 写 `PointsTransaction(USDT_RECHARGE)`；`grantUpload` 时置 `canUpload=true`；回填推广统计（`ReferralLink.paymentCount/Amount`、`ReferralDailyStat`、`ReferralRecord.hasPaid`）。
- **过期**：`expireOrders()` 把超 `expiresAt` 的 PENDING 改 `EXPIRED`。
- **Redis 防重放**：`usdt:amt:<amount>`（金额占用，NX）、`usdt:tx:<txHash>`（已处理，TTL 7 天）、`usdt:last_ts`（断点续传时间戳）；`txHash @unique` 为数据库最终防线。

**配置（SiteConfig）**：`usdtPaymentEnabled`、`usdtWalletAddress`、`usdtPointsPerUnit`（1 USDT = X 积分，默认 10000）、`usdtOrderTimeoutMin`（默认 30）、`usdtMinAmount` / `usdtMaxAmount`。

## 兑换码

- `RedeemCode { code, pointsAmount, grantUpload, maxUses(0=无限), usedCount, expiresAt, isActive, batchId }`；`RedeemCodeRedemption` 唯一约束 `(codeId, userId)` 防同人重复兑换。
- 兑换（`redeem.redeem`）事务内：校验有效性 → `usedCount += 1` → 建兑换记录 → 发积分（`REDEEM_CODE`）/ 开通投稿。
- 批量生成（`redeem.adminBatchCreate`）：count 1–500，nanoid 去重，统一 `batchId`。

## tRPC 路由

- **payment**：`getConfig` / `getPackages` / `createOrder` / `checkOrderStatus` / `getMyOrders` / `cancelOrder`；管理端 `admin*`（统计、订单管理、`adminManualConfirm(txHash)`、套餐 CRUD、各类图表）。
- **redeem**：用户 `redeem`；管理端 `adminList/Create/BatchCreate/Update/Delete`。
- **积分相关**（在 `referral` 路由）：`claimDailyLogin` / `checkin` / `getCheckinStatus` / `getPointsHistory` / `adminAdjustPoints`。

## 注意点 / 陷阱

- 金额精度统一保留 2 位小数；唯一金额偏移需保证 `base ≤ 9999.99`。
- 防重放是「唯一金额 + Redis 占用 + 7 天 txHash 缓存 + DB 唯一约束」多层；手动确认与监听并发时推广统计可能重复计（无幂等）。
- 订单过期由轮询触发，存在最长一个轮询周期的延迟；取消/过期都需 `releaseAmount` 释放金额占用。
- `pointsRules` 内存缓存 60s，改配置后非即时生效；Redis 不可用时日限额检查 fail-open。

## 如何扩展

- **新增套餐**：`PaymentPackage` 已支持任意 `pointsAmount` + `grantUpload`，无需改 schema；新增权益则加字段并在 tron-monitor 确认逻辑里处理。
- **新增支付方式**：复制 tron-monitor 的「轮询/回调 → 确认 → 副作用」模式，统一收敛到 payment 路由。
- **新增积分动作**：加 `PointsAction` + `PointsTransactionType` 枚举与标签，在触发处调用 `awardPoints()`，规则走 `SiteConfig.pointsRules` 配置化。
