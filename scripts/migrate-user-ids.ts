/**
 * 迁移用户 ID：从 CUID 改为自增数字 ID
 * 站长 (OWNER) 分配 ID 1，其余按注册时间递增
 *
 * 运行方式: npx tsx scripts/migrate-user-ids.ts
 *
 * ⚠️ 重要：
 * - 迁移前请备份数据库！
 * - 迁移后所有已登录会话失效，用户需要重新登录
 * - localStorage 中缓存的账号切换信息会失效
 */

import { Pool } from "pg";
import * as dotenv from "dotenv";

// 加载环境变量
dotenv.config({ path: ".env.development" });
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: ".env.production" });
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const pool = new Pool({ connectionString });

async function migrateUserIds() {
  console.log("========================================");
  console.log("  用户 ID 迁移：CUID → 自增数字");
  console.log("========================================\n");

  const client = await pool.connect();

  try {
    // 1. 获取所有用户，站长优先，然后按注册时间排序
    const { rows: users } = await client.query(`
      SELECT id, username, role, "createdAt"
      FROM "User"
      ORDER BY
        CASE WHEN role = 'OWNER' THEN 0 ELSE 1 END,
        "createdAt" ASC
    `);

    console.log(`共找到 ${users.length} 个用户\n`);

    if (users.length === 0) {
      console.log("没有用户需要迁移。");
      return;
    }

    // 检查是否已经迁移过（所有 ID 都是数字）
    const allNumeric = users.every((u: { id: string }) => /^\d+$/.test(u.id));
    if (allNumeric) {
      console.log("所有用户 ID 已经是数字格式，跳过迁移。");
      // 仍然确保序列存在且值正确
      await ensureSequence(client, users);
      return;
    }

    // 2. 构建映射 oldId → newId
    const mapping: { oldId: string; newId: string; username: string; role: string }[] = [];
    for (let i = 0; i < users.length; i++) {
      mapping.push({
        oldId: users[i].id,
        newId: String(i + 1), // 从 1 开始
        username: users[i].username,
        role: users[i].role,
      });
    }

    console.log("ID 分配预览：");
    for (const m of mapping) {
      const roleTag = m.role === "OWNER" ? " [站长]" : m.role === "ADMIN" ? " [管理员]" : "";
      console.log(`  ${m.newId.padStart(4)} ← ${m.oldId} (@${m.username})${roleTag}`);
    }
    console.log();

    // 3. 开始事务
    await client.query("BEGIN");

    // 临时禁用外键检查（使用 replica 模式跳过触发器）
    await client.query("SET session_replication_role = replica");

    console.log("开始迁移...\n");

    // 所有包含 userId 外键的表（引用 User.id）
    const fkTables = [
      { table: "Account", column: "userId" },
      { table: "Session", column: "userId" },
      { table: "LoginSession", column: "userId" },
      { table: "Video", column: "uploaderId" },
      { table: "Series", column: "creatorId" },
      { table: "Favorite", column: "userId" },
      { table: "Like", column: "userId" },
      { table: "Dislike", column: "userId" },
      { table: "Confused", column: "userId" },
      { table: "WatchHistory", column: "userId" },
      { table: "Playlist", column: "userId" },
      { table: "Comment", column: "userId" },
      { table: "Comment", column: "replyToUserId" },
      { table: "CommentReaction", column: "userId" },
      { table: "SearchRecord", column: "userId" },
    ];

    let successCount = 0;

    for (const m of mapping) {
      if (m.oldId === m.newId) {
        console.log(`  ○ ${m.newId} (@${m.username}) — 无需变更`);
        successCount++;
        continue;
      }

      try {
        // 更新所有外键表
        for (const fk of fkTables) {
          await client.query(
            `UPDATE "${fk.table}" SET "${fk.column}" = $1 WHERE "${fk.column}" = $2`,
            [m.newId, m.oldId]
          );
        }

        // 更新用户表自身
        await client.query(
          `UPDATE "User" SET id = $1 WHERE id = $2`,
          [m.newId, m.oldId]
        );

        console.log(`  ✓ ${m.newId} ← ${m.oldId} (@${m.username})`);
        successCount++;
      } catch (error) {
        console.error(`  ✗ ${m.oldId} (@${m.username}) 迁移失败:`, error);
        throw error; // 回滚整个事务
      }
    }

    // 恢复外键检查
    await client.query("SET session_replication_role = DEFAULT");

    // 4. 创建/重置序列
    const maxId = users.length;
    await client.query(`CREATE SEQUENCE IF NOT EXISTS user_id_seq`);
    await client.query(`SELECT setval('user_id_seq', $1)`, [maxId]);

    console.log(`\n序列 user_id_seq 设置为 ${maxId}（下一个用户 ID 为 ${maxId + 1}）`);

    // 5. 设置列默认值
    await client.query(`ALTER TABLE "User" ALTER COLUMN id SET DEFAULT nextval('user_id_seq')::text`);

    // 6. 清除所有会话（迁移后旧会话无效）
    const { rowCount: sessionCount } = await client.query(`DELETE FROM "Session"`);
    const { rowCount: loginSessionCount } = await client.query(
      `UPDATE "LoginSession" SET "isRevoked" = true WHERE "isRevoked" = false`
    );
    console.log(`\n已清除 ${sessionCount} 个会话，撤销 ${loginSessionCount} 个登录会话`);

    // 提交事务
    await client.query("COMMIT");

    console.log(`\n========================================`);
    console.log(`  迁移完成！成功迁移 ${successCount}/${users.length} 个用户`);
    console.log(`  站长 ID: 1`);
    console.log(`  ⚠️ 所有用户需要重新登录`);
    console.log(`========================================`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("\n迁移失败，已回滚:", error);
    throw error;
  } finally {
    client.release();
  }
}

async function ensureSequence(
  client: import("pg").PoolClient,
  users: { id: string }[]
) {
  const maxId = Math.max(...users.map((u) => parseInt(u.id, 10)), 0);
  await client.query(`CREATE SEQUENCE IF NOT EXISTS user_id_seq`);
  await client.query(`SELECT setval('user_id_seq', $1)`, [maxId]);
  await client.query(`ALTER TABLE "User" ALTER COLUMN id SET DEFAULT nextval('user_id_seq')::text`);
  console.log(`序列 user_id_seq 已确认，当前值: ${maxId}`);
}

migrateUserIds()
  .catch(console.error)
  .finally(() => pool.end());
