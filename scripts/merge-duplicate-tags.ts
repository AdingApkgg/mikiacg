#!/usr/bin/env npx tsx
/**
 * 合并重复标签（按规范化名去重）
 *
 * 背景：
 *   早期批量导入时，源数据自带 ` (N)` 计数后缀（如 `1080p (1)`、`黑皮肤 (3)`），
 *   被原样写入 Tag 表，形成大量"同基名、不同 (N)"的重复标签。
 *   `src/server/publish-utils.ts` 现已在 upsert 前 normalizeTagName 防止再次累积，
 *   此脚本一次性把已有重复合并掉。
 *
 * 合并规则：
 *   - 用 normalizeTagName 计算 canonical = 剥离尾部 `(N)` 后的基名
 *   - 同一 canonical 下的所有 Tag 视为一组重复
 *   - 优先级选 canonical：
 *       1) name 恰好等于 canonical 的 Tag
 *       2) 已用总量最大（videoCount + gameCount + imagePostCount）
 *       3) createdAt 最早
 *   - 把其它 Tag 的 TagOnVideo/TagOnGame/TagOnImagePost 关联改指 canonical
 *     （若 canonical 已与该实体关联，直接删除重复关联行）
 *   - 把其它 Tag 的 TagAlias / TagImplication 改指 canonical（冲突项跳过）
 *   - 给 canonical 写入"原始名 → canonical"的 TagAlias，保留可回溯查询
 *   - 删除被合并的 Tag
 *   - 重新计算 canonical 的 videoCount / gameCount / imagePostCount
 *
 * 运行方式：
 *   pnpm tsx scripts/merge-duplicate-tags.ts            # dry-run（默认，仅打印计划）
 *   pnpm tsx scripts/merge-duplicate-tags.ts --apply    # 真正执行
 *   pnpm tsx scripts/merge-duplicate-tags.ts --limit=5  # dry-run 只看前 5 组（调试）
 *
 * 环境变量：
 *   优先读 .env.development，找不到再尝试 .env.production；也可在命令前显式指定
 *   DATABASE_URL=... pnpm tsx scripts/merge-duplicate-tags.ts
 *
 * 注意：
 *   - 默认 dry-run，需要 `--apply` 才会写库
 *   - 被合并的 Tag.slug 会被删除，原 /video/tag/<old-slug> 等链接会 404
 *     （TagAlias 只记录 name，schema 没有 slug 别名表）。如需保留旧 URL 兼容，
 *     需要额外增加 slug 别名表 + 在 tag 详情页查询时优先做重定向；本脚本不涉及。
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as dotenv from "dotenv";
import { normalizeTagName } from "../src/server/publish-utils";

dotenv.config({ path: ".env.development" });
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: ".env.production" });
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const APPLY = process.argv.includes("--apply");
const LIMIT = (() => {
  const arg = process.argv.find((a) => a.startsWith("--limit="));
  if (!arg) return Number.POSITIVE_INFINITY;
  const n = Number.parseInt(arg.slice("--limit=".length), 10);
  return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
})();

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

type TagRow = {
  id: string;
  name: string;
  slug: string;
  categoryId: string | null;
  videoCount: number;
  gameCount: number;
  imagePostCount: number;
  createdAt: Date;
};

function pickCanonical(group: TagRow[], canonical: string): TagRow {
  const exact = group.find((t) => t.name === canonical);
  if (exact) return exact;
  const sorted = [...group].sort((a, b) => {
    const aUse = a.videoCount + a.gameCount + a.imagePostCount;
    const bUse = b.videoCount + b.gameCount + b.imagePostCount;
    if (bUse !== aUse) return bUse - aUse;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return sorted[0]!;
}

async function moveTagOn(
  table: "tagOnVideo" | "tagOnGame" | "tagOnImagePost",
  entityKey: "videoId" | "gameId" | "imagePostId",
  canonicalId: string,
  dupId: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = prisma[table] as any;
  const dupRows: { [k: string]: string }[] = await t.findMany({
    where: { tagId: dupId },
    select: { [entityKey]: true },
  });
  if (dupRows.length === 0) return { moved: 0, deletedDup: 0 };

  const entityIds = dupRows.map((r) => r[entityKey]!);
  const existingCanonical: { [k: string]: string }[] = await t.findMany({
    where: { tagId: canonicalId, [entityKey]: { in: entityIds } },
    select: { [entityKey]: true },
  });
  const existingSet = new Set(existingCanonical.map((r) => r[entityKey]!));

  const toMove = entityIds.filter((id) => !existingSet.has(id));
  const toDelete = entityIds.filter((id) => existingSet.has(id));

  let moved = 0;
  let deletedDup = 0;

  if (toMove.length > 0) {
    const res = await t.updateMany({
      where: { tagId: dupId, [entityKey]: { in: toMove } },
      data: { tagId: canonicalId },
    });
    moved = res.count;
  }
  if (toDelete.length > 0) {
    const res = await t.deleteMany({
      where: { tagId: dupId, [entityKey]: { in: toDelete } },
    });
    deletedDup = res.count;
  }

  return { moved, deletedDup };
}

async function ensureAlias(canonicalId: string, aliasName: string) {
  // 已存在但指向其它 tag 时，强制改指 canonical（merge 场景下我们要统一）
  const existing = await prisma.tagAlias.findUnique({ where: { name: aliasName }, select: { id: true, tagId: true } });
  if (existing) {
    if (existing.tagId !== canonicalId) {
      await prisma.tagAlias.update({ where: { id: existing.id }, data: { tagId: canonicalId } });
    }
    return;
  }
  await prisma.tagAlias.create({ data: { name: aliasName, tagId: canonicalId } });
}

async function repointAliasesAndImplications(canonicalId: string, dupId: string) {
  // 别名直接改指 canonical（unique on name，所以不会冲突）
  await prisma.tagAlias.updateMany({ where: { tagId: dupId }, data: { tagId: canonicalId } });

  // 蕴含：source/target 中含 dupId 的改成 canonical，避免和现有行冲突
  const implSource = await prisma.tagImplication.findMany({ where: { sourceTagId: dupId } });
  for (const row of implSource) {
    if (row.targetTagId === canonicalId) {
      await prisma.tagImplication.delete({ where: { id: row.id } });
      continue;
    }
    const conflict = await prisma.tagImplication.findUnique({
      where: { sourceTagId_targetTagId: { sourceTagId: canonicalId, targetTagId: row.targetTagId } },
    });
    if (conflict) {
      await prisma.tagImplication.delete({ where: { id: row.id } });
    } else {
      await prisma.tagImplication.update({ where: { id: row.id }, data: { sourceTagId: canonicalId } });
    }
  }
  const implTarget = await prisma.tagImplication.findMany({ where: { targetTagId: dupId } });
  for (const row of implTarget) {
    if (row.sourceTagId === canonicalId) {
      await prisma.tagImplication.delete({ where: { id: row.id } });
      continue;
    }
    const conflict = await prisma.tagImplication.findUnique({
      where: { sourceTagId_targetTagId: { sourceTagId: row.sourceTagId, targetTagId: canonicalId } },
    });
    if (conflict) {
      await prisma.tagImplication.delete({ where: { id: row.id } });
    } else {
      await prisma.tagImplication.update({ where: { id: row.id }, data: { targetTagId: canonicalId } });
    }
  }
}

async function recountTag(tagId: string) {
  const [videoCount, gameCount, imagePostCount] = await Promise.all([
    prisma.tagOnVideo.count({ where: { tagId } }),
    prisma.tagOnGame.count({ where: { tagId } }),
    prisma.tagOnImagePost.count({ where: { tagId } }),
  ]);
  await prisma.tag.update({
    where: { id: tagId },
    data: { videoCount, gameCount, imagePostCount },
  });
  return { videoCount, gameCount, imagePostCount };
}

async function main() {
  const mode = APPLY ? "APPLY (写库)" : "DRY-RUN (默认，不写库)";
  console.log(`合并重复标签 — 模式: ${mode}`);
  console.log(`数据库: ${connectionString!.replace(/:\/\/[^@]*@/, "://***@")}\n`);

  const all = await prisma.tag.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      categoryId: true,
      videoCount: true,
      gameCount: true,
      imagePostCount: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(`共扫描 ${all.length} 个 Tag\n`);

  const groups = new Map<string, TagRow[]>();
  for (const t of all) {
    const canonical = normalizeTagName(t.name);
    if (!canonical) continue;
    if (!groups.has(canonical)) groups.set(canonical, []);
    groups.get(canonical)!.push(t);
  }

  const duplicateGroups = [...groups.entries()].filter(([, list]) => list.length > 1);
  if (duplicateGroups.length === 0) {
    console.log("未发现重复，无需合并。");
    return;
  }

  const totalDupes = duplicateGroups.reduce((s, [, l]) => s + l.length - 1, 0);
  console.log(`待合并：${duplicateGroups.length} 组，共 ${totalDupes} 个 Tag 将被合并并删除。\n`);

  let groupIdx = 0;
  let mergedTotal = 0;
  let movedTotal = 0;
  let dedupedTotal = 0;
  let deletedTagTotal = 0;

  for (const [canonical, group] of duplicateGroups) {
    if (groupIdx >= LIMIT) {
      console.log(`（已达 --limit=${LIMIT}，停止打印剩余组）`);
      break;
    }
    groupIdx++;

    const keep = pickCanonical(group, canonical);
    const dupes = group.filter((t) => t.id !== keep.id);

    console.log(`[${groupIdx}] 规范名 "${canonical}"`);
    console.log(
      `  保留: ${keep.id}  name="${keep.name}"  slug="${keep.slug}"  ` +
        `v=${keep.videoCount} g=${keep.gameCount} i=${keep.imagePostCount}`,
    );
    for (const d of dupes) {
      console.log(
        `  合并: ${d.id}  name="${d.name}"  slug="${d.slug}"  ` +
          `v=${d.videoCount} g=${d.gameCount} i=${d.imagePostCount}`,
      );
    }

    if (!APPLY) continue;

    for (const d of dupes) {
      const v = await moveTagOn("tagOnVideo", "videoId", keep.id, d.id);
      const g = await moveTagOn("tagOnGame", "gameId", keep.id, d.id);
      const i = await moveTagOn("tagOnImagePost", "imagePostId", keep.id, d.id);
      await repointAliasesAndImplications(keep.id, d.id);
      // 把被删 Tag 的 name 落成 alias 指向 canonical（如果与 canonical name 不同）
      if (d.name !== keep.name) {
        await ensureAlias(keep.id, d.name);
      }
      await prisma.tag.delete({ where: { id: d.id } });

      movedTotal += v.moved + g.moved + i.moved;
      dedupedTotal += v.deletedDup + g.deletedDup + i.deletedDup;
      deletedTagTotal++;
      console.log(
        `    -> ${d.id}: 关联改指 ${v.moved + g.moved + i.moved} 条，` +
          `去重 ${v.deletedDup + g.deletedDup + i.deletedDup} 条，已删除`,
      );
    }

    const counts = await recountTag(keep.id);
    console.log(`  重算 ${keep.id} 计数: v=${counts.videoCount} g=${counts.gameCount} i=${counts.imagePostCount}`);
    mergedTotal++;
  }

  console.log("\n汇总：");
  console.log(`  合并 ${mergedTotal} 组`);
  console.log(`  关联改指 ${movedTotal} 条`);
  console.log(`  关联去重删除 ${dedupedTotal} 条`);
  console.log(`  Tag 删除 ${deletedTagTotal} 个`);
  if (!APPLY) {
    console.log("\n(--apply 才会真正写库；现在仅打印计划)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
