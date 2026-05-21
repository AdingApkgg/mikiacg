import { prisma } from "@/lib/prisma";
import { redis, REDIS_AVAILABLE } from "@/lib/redis";

/**
 * 工单自动关闭调度器
 *
 * - RESOLVED 状态超过 7 天无新回复 → CLOSED
 * - WAITING_USER 状态超过 14 天无新回复 → CLOSED
 *
 * 单独进程执行,基于 Redis 锁防并发。
 */

const RESOLVED_TTL_DAYS = 7;
const WAITING_USER_TTL_DAYS = 14;
const TICK_INTERVAL_MS = 60 * 60 * 1000; // 每小时一次
const BATCH_SIZE = 200;

const ts = () => new Date().toISOString();

interface TaskHandle {
  timer: ReturnType<typeof setInterval>;
  warmup: ReturnType<typeof setTimeout>;
}

let handle: TaskHandle | null = null;

async function acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
  if (!REDIS_AVAILABLE) return true;
  try {
    const result = await redis.set(`ticket:lock:${key}`, "1", "EX", ttlSeconds, "NX");
    return result === "OK";
  } catch (err) {
    console.error(`[ticket] acquireLock("${key}") failed`, err);
    return false;
  }
}

/** 关闭超过指定天数未活跃的指定状态工单。返回关闭数量。 */
async function autoCloseStale(status: "RESOLVED" | "WAITING_USER", days: number): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  let totalClosed = 0;

  // 分批处理避免单次更新过多
  while (true) {
    const stale = await prisma.ticket.findMany({
      where: {
        status,
        OR: [{ lastReplyAt: { lt: cutoff } }, { lastReplyAt: null, updatedAt: { lt: cutoff } }],
      },
      select: { id: true, userId: true },
      take: BATCH_SIZE,
    });

    if (stale.length === 0) break;

    const ids = stale.map((t) => t.id);
    const now = new Date();

    await prisma.$transaction([
      prisma.ticket.updateMany({
        where: { id: { in: ids } },
        data: { status: "CLOSED", closedAt: now, lastReplyAt: now },
      }),
      prisma.ticketReply.createMany({
        data: stale.map((t) => ({
          ticketId: t.id,
          userId: t.userId,
          content:
            status === "RESOLVED"
              ? `工单已解决 ${days} 天无新动态,系统自动关闭`
              : `等待用户补充超过 ${days} 天,系统自动关闭`,
          isSystem: true,
          isStaff: true,
        })),
      }),
    ]);

    totalClosed += stale.length;
    if (stale.length < BATCH_SIZE) break;
  }

  return totalClosed;
}

async function runOnce(): Promise<void> {
  const ok = await acquireLock("auto_close", Math.floor((TICK_INTERVAL_MS / 1000) * 0.8));
  if (!ok) return;

  const t0 = Date.now();
  try {
    const [resolved, waiting] = await Promise.all([
      autoCloseStale("RESOLVED", RESOLVED_TTL_DAYS),
      autoCloseStale("WAITING_USER", WAITING_USER_TTL_DAYS),
    ]);
    if (resolved > 0 || waiting > 0) {
      console.log(`[${ts()}][ticket] auto-close: ${resolved} resolved + ${waiting} waiting (${Date.now() - t0}ms)`);
    }
  } catch (err) {
    console.error(`[${ts()}][ticket] auto-close failed`, err);
  }
}

/** 启动工单调度器。多次调用幂等。 */
export function startTicketScheduler(): void {
  if (handle) return;

  // 启动后 5 分钟先跑一次,避免启动时刻数据库压力
  const warmup = setTimeout(
    () => {
      void runOnce();
    },
    5 * 60 * 1000,
  );

  const timer = setInterval(() => {
    void runOnce();
  }, TICK_INTERVAL_MS);

  handle = { timer, warmup };
  console.log(`[${ts()}][ticket] scheduler started (interval ${TICK_INTERVAL_MS / 1000}s)`);
}

export function stopTicketScheduler(): void {
  if (!handle) return;
  clearInterval(handle.timer);
  clearTimeout(handle.warmup);
  handle = null;
}
