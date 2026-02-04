/**
 * 迁移视频 ID 到 6 位数字格式
 * 
 * 运行方式: npx tsx scripts/migrate-video-ids.ts
 */

import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as dotenv from "dotenv";

// 加载 .env.development 或 .env.production
dotenv.config({ path: ".env.development" });
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: ".env.production" });
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function migrateVideoIds() {
  console.log("开始迁移视频 ID...\n");

  // 获取所有视频，按创建时间排序（保持顺序）
  const videos = await prisma.video.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
    },
  });

  console.log(`共找到 ${videos.length} 个视频\n`);

  // 分离已经是 6 位数字的视频和需要迁移的视频
  const alreadyMigrated: typeof videos = [];
  const needsMigration: typeof videos = [];

  for (const video of videos) {
    if (/^\d{6}$/.test(video.id)) {
      alreadyMigrated.push(video);
    } else {
      needsMigration.push(video);
    }
  }

  console.log(`已是 6 位数字 ID: ${alreadyMigrated.length} 个`);
  console.log(`需要迁移: ${needsMigration.length} 个\n`);

  if (needsMigration.length === 0) {
    console.log("没有需要迁移的视频，退出。");
    return;
  }

  // 找到当前最大的数字 ID
  let maxId = -1;
  for (const video of alreadyMigrated) {
    const num = parseInt(video.id, 10);
    if (num > maxId) {
      maxId = num;
    }
  }

  console.log(`当前最大数字 ID: ${maxId === -1 ? "无" : maxId.toString().padStart(6, "0")}`);
  console.log("\n开始迁移...\n");

  // 使用直接 SQL 更新，需要临时禁用外键约束
  const client = await pool.connect();
  
  try {
    // 开始事务
    await client.query("BEGIN");
    
    // 禁用触发器（临时禁用外键检查）
    await client.query("SET session_replication_role = replica");
    
    let successCount = 0;
    let errorCount = 0;

    for (const video of needsMigration) {
      const newId = (++maxId).toString().padStart(6, "0");
      const oldId = video.id;

      try {
        // 更新所有关联表的 videoId
        await client.query(`UPDATE "TagOnVideo" SET "videoId" = $1 WHERE "videoId" = $2`, [newId, oldId]);
        await client.query(`UPDATE "SeriesEpisode" SET "videoId" = $1 WHERE "videoId" = $2`, [newId, oldId]);
        await client.query(`UPDATE "Favorite" SET "videoId" = $1 WHERE "videoId" = $2`, [newId, oldId]);
        await client.query(`UPDATE "WatchHistory" SET "videoId" = $1 WHERE "videoId" = $2`, [newId, oldId]);
        await client.query(`UPDATE "Like" SET "videoId" = $1 WHERE "videoId" = $2`, [newId, oldId]);
        await client.query(`UPDATE "Dislike" SET "videoId" = $1 WHERE "videoId" = $2`, [newId, oldId]);
        await client.query(`UPDATE "Confused" SET "videoId" = $1 WHERE "videoId" = $2`, [newId, oldId]);
        await client.query(`UPDATE "PlaylistItem" SET "videoId" = $1 WHERE "videoId" = $2`, [newId, oldId]);
        await client.query(`UPDATE "Comment" SET "videoId" = $1 WHERE "videoId" = $2`, [newId, oldId]);
        
        // 更新视频表本身
        await client.query(`UPDATE "Video" SET "id" = $1 WHERE "id" = $2`, [newId, oldId]);

        console.log(`✓ ${oldId} → ${newId} (${video.title.substring(0, 40)}${video.title.length > 40 ? '...' : ''})`);
        successCount++;
      } catch (error) {
        console.error(`✗ ${oldId} 迁移失败:`, error);
        errorCount++;
        maxId--; // 回滚 ID
      }
    }

    // 恢复外键检查
    await client.query("SET session_replication_role = DEFAULT");
    
    // 提交事务
    await client.query("COMMIT");

    console.log("\n迁移完成！");
    console.log(`成功: ${successCount} 个`);
    console.log(`失败: ${errorCount} 个`);
  } catch (error) {
    // 回滚事务
    await client.query("ROLLBACK");
    console.error("迁移失败，已回滚:", error);
    throw error;
  } finally {
    client.release();
  }
}

migrateVideoIds()
  .catch(console.error)
  .finally(() => {
    prisma.$disconnect();
    pool.end();
  });
