/**
 * 将现有顺序 ID 随机化
 * 
 * 运行方式: npx tsx scripts/randomize-video-ids.ts
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

// 生成随机 6 位数字 ID
function generateRandomId(): string {
  const randomNum = Math.floor(Math.random() * 1000000);
  return randomNum.toString().padStart(6, "0");
}

async function randomizeVideoIds() {
  console.log("开始随机化视频 ID...\n");

  // 获取所有视频
  const videos = await prisma.video.findMany({
    select: {
      id: true,
      title: true,
    },
  });

  console.log(`共找到 ${videos.length} 个视频\n`);

  // 收集已使用的 ID
  const usedIds = new Set<string>();
  
  // 生成所有新的随机 ID
  const idMapping: { oldId: string; newId: string; title: string }[] = [];
  
  for (const video of videos) {
    let newId: string;
    do {
      newId = generateRandomId();
    } while (usedIds.has(newId));
    
    usedIds.add(newId);
    idMapping.push({ oldId: video.id, newId, title: video.title });
  }

  console.log("开始迁移...\n");

  // 使用直接 SQL 更新
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");
    await client.query("SET session_replication_role = replica");
    
    let successCount = 0;
    let errorCount = 0;

    for (const { oldId, newId, title } of idMapping) {
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

        console.log(`✓ ${oldId} → ${newId} (${title.substring(0, 40)}${title.length > 40 ? '...' : ''})`);
        successCount++;
      } catch (error) {
        console.error(`✗ ${oldId} 迁移失败:`, error);
        errorCount++;
      }
    }

    await client.query("SET session_replication_role = DEFAULT");
    await client.query("COMMIT");

    console.log("\n随机化完成！");
    console.log(`成功: ${successCount} 个`);
    console.log(`失败: ${errorCount} 个`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("迁移失败，已回滚:", error);
    throw error;
  } finally {
    client.release();
  }
}

randomizeVideoIds()
  .catch(console.error)
  .finally(() => {
    prisma.$disconnect();
    pool.end();
  });
