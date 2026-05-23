/**
 * publishedAt 回填脚本
 *
 * 背景：新增 Video / Game / ImagePost 的 publishedAt 字段，用于记录"首次过审时间"。
 * 前台时间展示策略为 publishedAt ?? createdAt。
 * 本脚本为存量 status='PUBLISHED' 且 publishedAt 为空的记录，把 publishedAt 回填为 updatedAt
 * （updatedAt 通常近似首次过审时间，是最实用的近似）。
 *
 * 运行方式:
 *   开发环境: npx tsx scripts/migrate-published-at.ts
 *   生产环境: NODE_ENV=production npx tsx scripts/migrate-published-at.ts
 *
 * 幂等：脚本只会回填 publishedAt 仍为 null 的记录，可重复执行。
 */

import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
import { Pool } from "pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

if (process.env.NODE_ENV === "production") {
  dotenv.config({ path: ".env.production" });
} else {
  dotenv.config({ path: ".env.development" });
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function backfill(label: string, countFn: () => Promise<number>, runFn: () => Promise<unknown>) {
  const target = await countFn();
  console.log(`📊 ${label} 待回填：${target} 条`);
  if (target === 0) {
    console.log(`✅ ${label} 无需回填\n`);
    return;
  }
  // 用原生 SQL，避免 Prisma 一次性把整张表载进内存
  await runFn();
  console.log(`✅ ${label} 完成回填\n`);
}

async function main() {
  console.log("🔄 开始回填 publishedAt 字段...\n");

  await backfill(
    "Video",
    () => prisma.video.count({ where: { status: "PUBLISHED", publishedAt: null } }),
    () =>
      prisma.$executeRaw`UPDATE "Video" SET "publishedAt" = "updatedAt" WHERE "status" = 'PUBLISHED' AND "publishedAt" IS NULL`,
  );

  await backfill(
    "Game",
    () => prisma.game.count({ where: { status: "PUBLISHED", publishedAt: null } }),
    () =>
      prisma.$executeRaw`UPDATE "Game" SET "publishedAt" = "updatedAt" WHERE "status" = 'PUBLISHED' AND "publishedAt" IS NULL`,
  );

  await backfill(
    "ImagePost",
    () => prisma.imagePost.count({ where: { status: "PUBLISHED", publishedAt: null } }),
    () =>
      prisma.$executeRaw`UPDATE "ImagePost" SET "publishedAt" = "updatedAt" WHERE "status" = 'PUBLISHED' AND "publishedAt" IS NULL`,
  );

  console.log("提示：未过审记录(PENDING/REJECTED)的 publishedAt 保持为空，符合预期。");
}

main()
  .catch((err) => {
    console.error("❌ 迁移失败:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
