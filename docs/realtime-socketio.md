# 实时通信（Socket.io）

面向开发者的架构与事件协议说明。实时能力（私信、频道、通知、在线状态、输入指示器）由独立的 Socket.io 进程承载。

## 双进程架构

```
浏览器  ──ws──►  Socket.io 进程 (src/socket/, 端口 3001)
                      │  ▲
        Redis adapter │  │ Redis emitter
                      ▼  │
                 ┌──────────┐
                 │  Redis   │
                 └──────────┘
                      ▲
        socketEmitter │  (publish)
                      │
   Next.js 进程 (tRPC mutation 里发消息/建通知)
```

- **Socket.io 进程**（`src/socket/server.ts`，端口 `SOCKET_PORT`，默认 3001）独立于 Next.js 运行。直接处理「对端实时」事件：房间加入、输入指示器、在线状态。
- **Next.js 进程** 里的 tRPC mutation（发私信、发频道消息、建通知）**不能直接 `io.emit`**——它用 `socketEmitter`（`@socket.io/redis-emitter`，见 `src/lib/socket-emitter.ts`）把事件 publish 进 Redis；Socket.io 进程通过 `@socket.io/redis-adapter` 订阅并投递。
- 这套 adapter + emitter 也让 Socket.io **多实例水平扩展**成为可能。

## 连接与鉴权

**客户端**（`src/lib/socket-client.ts` 的 `getSocket()` 单例）：

```
NEXT_PUBLIC_SOCKET_URL || `${protocol}//${hostname}:3001`
withCredentials: true        // 带 cookie，用于鉴权
autoConnect: false           // 会话就绪后才 connect()
reconnection: true           // 10 次重连，2s → 30s 退避
```

生命周期由 `useSocket(userId)`（`src/hooks/use-socket.ts`）管理：拿到 `userId` 后 `socket.connect()`，卸载时断开；并监听 `connect` / `disconnect` / `presence:*` 更新 `useSocketStore`。

**服务端鉴权**（`src/socket/auth.ts`，`io.use(authenticateSocket)`）：

1. 从 handshake cookie 取 Better Auth 会话 token（`better-auth.session_token` 或 `__Secure-better-auth.session_token`）。
2. 查 `Session` 表（`sessionToken` 匹配且未过期）。
3. 命中则把 `userId` 挂到 `socket.data.userId`；否则拒绝连接。

连接建立后，服务端自动 `socket.join('user:<userId>')`。

## 房间约定

| 房间 | 加入方式 | 用途 |
| --- | --- | --- |
| `user:<userId>` | 连接时自动加入 | 个人定向推送（通知、未读、在线、已读回执） |
| `conversation:<conversationId>` | `conversation:join`（校验是会话参与者） | 私信会话 |
| `channel:<channelId>` | `channel:join`（`PRIVATE` 频道校验成员资格） | 聊天频道 |

## 客户端 → 服务端事件

| 事件 | 入参 | 行为 |
| --- | --- | --- |
| `conversation:join` | `conversationId: string` | 校验参与者后加入会话房间 |
| `conversation:leave` | `conversationId: string` | 离开会话房间 |
| `typing:start` / `typing:stop` | `{ conversationId }` | 向会话内**其他人**广播输入状态（需已在房间内） |
| `channel:join` | `channelId: string` | 校验后加入频道房间（PRIVATE 需成员） |
| `channel:leave` | `channelId: string` | 离开频道房间 |
| `channel:typing:start` / `channel:typing:stop` | `{ channelId }` | 向频道内其他人广播输入状态 |
| `presence:check` | `{ userIds: string[] }` + ack 回调 | 批量查在线（≤100 个），回调返回 `Record<userId, boolean>` |

## 服务端 → 客户端事件

**来自 Socket.io 进程**（对端实时，房间内广播）：

| 事件 | 房间 | 载荷 |
| --- | --- | --- |
| `typing:start` / `typing:stop` | `conversation:<id>` | `{ conversationId, userId }` |
| `channel:typing:start` / `channel:typing:stop` | `channel:<id>` | `{ channelId, userId }` |
| `presence:online` / `presence:offline` | `user:<contactId>` | `{ userId }` |

**来自 tRPC（经 Redis emitter）**：

| 事件 | 房间 | 载荷 | 触发点 |
| --- | --- | --- | --- |
| `notification:new` | `user:<uid>` | `Notification` 对象 | `src/lib/notification.ts` 创建通知 |
| `message:new` | `conversation:<id>` | `DirectMessage` 对象 | `message` 路由：发私信 |
| `message:unread` | `user:<uid>` | `{ conversationId }` | 发私信（提醒不在会话房间的对方） |
| `message:read` | `conversation:<id>` | `{ conversationId, userId }` | 标记已读 |
| `message:deleted` | `conversation:<id>` | `{ messageId }` | 删私信 |
| `channel:message:new` | `channel:<id>` | `ChannelMessage` 对象 | `channel` 路由：发频道消息 |
| `channel:message:deleted` | `channel:<id>` | `{ messageId }` | 删频道消息 |
| `channel:member:join` | `channel:<id>` | `{ channelId, userId }` | 加入频道 |
| `channel:member:leave` | `channel:<id>` | `{ channelId, userId }` | 退出频道 |

## 在线状态机制

`src/socket/handlers/presence.ts`，基于 Redis key `online:<userId>`：

- **连接时**：`SET online:<uid> EX 60`，并向「有共同会话的联系人」广播 `presence:online`。
- **心跳**：每 30s 刷新一次 TTL。
- **断开时**：若该用户在 `user:<uid>` 房间已无其他 socket（多标签页安全），则 `DEL` key 并广播 `presence:offline`。
- 联系人范围 = 与该用户存在共同 `Conversation` 的其他参与者。

## 客户端状态（`src/stores/socket.ts`）

`useSocketStore`：`connected`、`onlineUsers: Set<string>`、`unreadNotifications`、`unreadMessages`、`activeConversationId`，及对应 setter / `isOnline(userId)`。

## 相关文件

| 文件 | 职责 |
| --- | --- |
| `src/socket/server.ts` | 进程入口（HTTP + Socket.io + Redis adapter） |
| `src/socket/auth.ts` | 连接鉴权中间件 |
| `src/socket/handlers/{notification,message,channel,presence}.ts` | 事件处理器 |
| `src/lib/socket-emitter.ts` | tRPC → Socket.io 的 Redis emitter |
| `src/lib/socket-client.ts` | 浏览器端 socket 单例 |
| `src/hooks/use-socket.ts` / `use-notifications.ts` / `use-typing.ts` | 连接生命周期 / 通知 / 输入指示器 |
| `src/stores/socket.ts` | 客户端实时状态 |

## 新增一个实时事件

1. **对端实时**（输入、在线类）：在对应 `src/socket/handlers/*.ts` 里 `socket.on` 接收、`socket.to(room).emit` 广播。
2. **业务推送**（由 tRPC 触发）：在路由 mutation 里用 `socketEmitter.to(room).emit("event", payload)`；客户端在相应 hook/组件里 `socket.on("event", ...)`。
3. 约定房间名沿用 `user:` / `conversation:` / `channel:` 前缀；定向到人用 `user:<uid>`。
