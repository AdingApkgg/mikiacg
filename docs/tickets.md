# 工单 / 反馈系统

面向开发者的架构说明。前台入口 `/feedback`，后台在 `/dashboard/tickets`。

## 数据模型

- `Ticket`：`userId`、`category`、`status`(默认 PENDING)、`priority`(默认 NORMAL)、`title`、`content`、`attachments`(Json)、`metadata`(Json，分类相关字段)、`assigneeId?`、`resolvedAt?`、`closedAt?`、`lastReplyAt?`（排序与自动关闭基准）、`duplicateOfId?`（合并去向）。
- `TicketReply`：`ticketId`、`userId`、`content`、`attachments?`、`isStaff`、`isInternal`（仅管理员可见）、`isSystem`（自动状态变更消息）。

枚举：
- `TicketCategory`：`BUG` / `RESOURCE_REQUEST` / `FEATURE_REQUEST` / `CONTENT_REPORT` / `ACCOUNT_ISSUE` / `OTHER`。
- `TicketStatus`：`PENDING` / `IN_PROGRESS` / `WAITING_USER` / `RESOLVED` / `CLOSED`。
- `TicketPriority`：`LOW` / `NORMAL` / `HIGH` / `URGENT`。

校验在 `src/lib/ticket-schema.ts`（title 2–120、content 5–5000、附件 ≤6；各分类的 `metadata` 有独立 Zod schema）。

## 生命周期

- **创建**（`ticket.create`，仅登录用户）：`status=PENDING`、`lastReplyAt=now`；限流 5 分钟最多 3 条（Redis `ticket_rate:<userId>`）。
- **用户回复**（`ticket.reply`，仅本人，CLOSED 不可回复）：`WAITING_USER → IN_PROGRESS`，刷新 `lastReplyAt`，通知 assignee。
- **用户关闭**（`ticket.close`）：`status=CLOSED` + `closedAt` + 系统消息。
- **管理员回复**（`admin.tickets.replyTicket`，`requireScope("ticket:manage")`）：可 `isInternal`（内部备注不更新 `lastReplyAt`、用户不可见）；对外回复时 PENDING→IN_PROGRESS、无 assignee 则自动认领、刷新 `lastReplyAt`、通知用户 + 邮件。
- **管理员更新**（`updateTicket`）：改 status/priority/assignee，每项变更生成系统消息；RESOLVED/WAITING_USER/CLOSED 时通知用户 + 邮件。
- **批量**（`batchUpdate`，≤200）：改状态/优先级/分配/删除（硬删，Cascade）；状态变更才发通知。
- **合并**（`mergeTicket`）：source 标记 `duplicateOfId` 并关闭，两侧插系统消息，通知源工单提交人 + 邮件。

## 自动关闭

`src/lib/ticket-scheduler.ts`，`startTicketScheduler()` 在 `src/instrumentation.ts` 启动（仅生产、非 serverless，幂等）。

- 规则（基于 `lastReplyAt`）：`RESOLVED` 超 7 天、`WAITING_USER` 超 14 天无新回复 → `CLOSED` + 系统消息。
- 每小时跑一次（启动后延迟 5 分钟首跑），单批 200 条，抢分布式锁 `ticket:lock:auto_close`（`SET NX EX`，TTL≈interval×0.8）；无 Redis 则直接执行（无并发保护）。
- 因 `isInternal` 回复不更新 `lastReplyAt`，内部备注不会重置自动关闭倒计时。

## 通知

- **邮件**（`src/lib/ticket-email.ts`）：`staff_reply` / `status_change`（RESOLVED/WAITING_USER/CLOSED）/ `merged` 三类事件，异步发送，失败仅记日志；同工单同用户 30 分钟冷却（Redis `ticket_email:<ticketId>:<userId>`）。主题 `【<siteName>】<heading> - <title>`，正文含变更摘要/回复前 200 字 + 工单链接。
- **站内**：`NotificationType.TICKET_UPDATE`，data `{ ticketId, kind }`（`user_reply`/`staff_reply`/`status_change`/`merged`），异步不阻塞。

## tRPC 路由

- 用户：`ticket.create` / `list` / `myStats` / `getById`（仅本人，过滤 `isInternal`）/ `reply` / `close`。
- 管理（`requireScope("ticket:manage")`）：`listTickets` / `stats` / `getTicketById`（含内部备注与合并关系）/ `replyTicket` / `updateTicket` / `deleteTicket` / `batchUpdate` / `assigneeOptions` / `exportTickets`（CSV，≤5000）/ `searchForMerge` / `mergeTicket`。

## 注意点 / 陷阱

- 仅登录用户可提工单（`/feedback` 未登录跳 `/login?callbackUrl=/feedback`），匿名不可提。
- 自动关闭基准是 `lastReplyAt` 而非 `updatedAt`；内部备注不重置倒计时。
- 系统消息（合并/自动关闭）的 `userId` 为执行者/系统，非工单提交人。
- 批量改优先级/分配人**不**发用户通知，只有状态变更发。

## 如何扩展

- **新增分类**：`TicketCategory` 枚举 + `ticket-schema.ts`（`TICKET_CATEGORIES`/标签/`ticketMetadataSchemas`）+ 前台 `feedback` 图标。
- **新增优先级/状态**：对应枚举 + `ticket-schema.ts` 数组/标签 + 前台 Badge。
- **新增自动化规则**：在 `ticket-scheduler.ts` 加 `autoCloseXxx` 并在 `runOnce()` 调用，复用 Redis 锁。
- **新增通知事件**：扩 `NotificationType` + 在触发处 `createNotification(type, ...)`。
