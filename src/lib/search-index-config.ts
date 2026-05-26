import type { Settings } from "meilisearch";
import { meili, INDEX, type SearchIndexKey } from "@/lib/meilisearch";

/** 中文容错阈值：3 字符允许 1 个 typo，6 字符允许 2 个；比默认(5/9)更激进，对短中文更友好 */
const TYPO_TOLERANCE_CN: Settings["typoTolerance"] = {
  enabled: true,
  minWordSizeForTypos: { oneTypo: 3, twoTypos: 6 },
};

const VIDEO_SETTINGS: Settings = {
  searchableAttributes: [
    "title",
    "description",
    "tagNames",
    "uploaderNickname",
    "uploaderUsername",
    "author",
    "keywords",
  ],
  filterableAttributes: ["status", "tagSlugs", "tagIds", "uploaderId", "isNsfw", "createdAtTs", "publishedAtTs"],
  sortableAttributes: ["createdAtTs", "publishedAtTs", "views", "likes"],
  typoTolerance: TYPO_TOLERANCE_CN,
};

const GAME_SETTINGS: Settings = {
  searchableAttributes: [
    "title",
    "aliases",
    "originalName",
    "description",
    "tagNames",
    "originalAuthor",
    "uploaderNickname",
    "uploaderUsername",
    "keywords",
  ],
  filterableAttributes: [
    "status",
    "tagSlugs",
    "tagIds",
    "gameType",
    "isFree",
    "isNsfw",
    "createdAtTs",
    "publishedAtTs",
  ],
  sortableAttributes: ["createdAtTs", "publishedAtTs", "views", "downloads", "likes"],
  typoTolerance: TYPO_TOLERANCE_CN,
};

const IMAGE_SETTINGS: Settings = {
  searchableAttributes: ["title", "description", "tagNames", "uploaderNickname", "uploaderUsername"],
  filterableAttributes: ["status", "tagSlugs", "tagIds", "isNsfw", "createdAtTs", "publishedAtTs"],
  sortableAttributes: ["createdAtTs", "publishedAtTs", "views", "likes"],
  typoTolerance: TYPO_TOLERANCE_CN,
};

const TAG_SETTINGS: Settings = {
  searchableAttributes: ["name", "slug", "aliasNames", "description"],
  filterableAttributes: ["categoryId", "videoCount", "gameCount", "imagePostCount"],
  sortableAttributes: ["videoCount", "gameCount", "imagePostCount", "name"],
  typoTolerance: TYPO_TOLERANCE_CN,
};

const USER_SETTINGS: Settings = {
  searchableAttributes: ["nickname", "username", "bio"],
  filterableAttributes: ["isBanned", "role"],
  sortableAttributes: ["videoCount"],
  typoTolerance: TYPO_TOLERANCE_CN,
};

const SETTINGS_BY_UID: Record<(typeof INDEX)[SearchIndexKey], Settings> = {
  [INDEX.video]: VIDEO_SETTINGS,
  [INDEX.game]: GAME_SETTINGS,
  [INDEX.image]: IMAGE_SETTINGS,
  [INDEX.tag]: TAG_SETTINGS,
  [INDEX.user]: USER_SETTINGS,
};

/** Meilisearch 过滤值中的引号与反斜杠转义 */
export function meiliQuoteFilterValue(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * 创建缺失索引并更新 settings（幂等）。
 * 生产首次部署或 schema 变更后执行 `pnpm meili:init`。
 */
export async function ensureIndexes(): Promise<void> {
  const client = meili;
  const { results } = await client.getIndexes({ limit: 100 });
  const existing = new Set(results.map((i: { uid: string }) => i.uid));

  for (const uid of Object.values(INDEX)) {
    if (!existing.has(uid)) {
      const created = await client.createIndex(uid, { primaryKey: "id" });
      await client.tasks.waitForTask(created.taskUid);
    }
    const task = await client.index(uid).updateSettings(SETTINGS_BY_UID[uid]);
    await client.tasks.waitForTask(task.taskUid);
  }
}
