/**
 * Next.js Instrumentation Hook
 *
 * 启动时从 DB 加载站点配置到内存。DB 不可用则 fail-fast
 * （systemd Restart=always 自动重试，比静默返回默认值更可靠）。
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
const isServerless = !!process.env.VERCEL || !!process.env.NETLIFY || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const ts = () => new Date().toISOString();

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { reloadPublicSiteConfig } = await import("@/lib/site-config");
  const { reloadServerConfig } = await import("@/lib/server-config");

  await reloadPublicSiteConfig();
  await reloadServerConfig();
  console.log(`[${ts()}][Instrumentation] 站点配置已加载到内存`);

  if (process.env.NODE_ENV === "development" || isServerless) return;

  const { startCoverWorker, startBackfillScheduler } = await import("@/lib/cover-auto");
  startCoverWorker();
  startBackfillScheduler();
  console.log(`[${ts()}][Instrumentation] 封面生成后台服务已启动`);

  const { startBackupScheduler } = await import("@/lib/backup");
  await startBackupScheduler();
  console.log(`[${ts()}][Instrumentation] 数据备份调度器已启动`);

  const { startRankingScheduler } = await import("@/lib/ranking/scheduler");
  await startRankingScheduler();
  console.log(`[${ts()}][Instrumentation] 榜单调度器已启动`);

  const { startTronMonitor } = await import("@/lib/tron-monitor");
  startTronMonitor();
  console.log(`[${ts()}][Instrumentation] USDT 支付监听已启动`);

  const { startTicketScheduler } = await import("@/lib/ticket-scheduler");
  startTicketScheduler();
  console.log(`[${ts()}][Instrumentation] 工单自动关闭调度器已启动`);
}
