import { splitSearchTokens } from "@/lib/search-text";
import { meiliQuoteFilterValue } from "@/lib/search-index-config";

/** 列表「搜索」是否应走 Meilisearch（有有效分词时）。 */
export function shouldMeiliListSearch(search: string | undefined | null): boolean {
  const q = search?.trim();
  if (!q) return false;
  return splitSearchTokens(q).length > 0;
}

export function videoListMeiliFilter(opts: {
  tagId?: string;
  tagSlugs?: string[];
  excludeTagSlugs?: string[];
  timeFilter?: Date;
}): string {
  const parts: string[] = [`status = ${meiliQuoteFilterValue("PUBLISHED")}`];
  if (opts.tagId) {
    parts.push(`tagIds = ${meiliQuoteFilterValue(opts.tagId)}`);
  }
  for (const s of opts.tagSlugs ?? []) {
    parts.push(`tagSlugs = ${meiliQuoteFilterValue(s)}`);
  }
  for (const s of opts.excludeTagSlugs ?? []) {
    parts.push(`(NOT tagSlugs = ${meiliQuoteFilterValue(s)})`);
  }
  if (opts.timeFilter) {
    parts.push(`publishedAtTs >= ${opts.timeFilter.getTime()}`);
  }
  return parts.join(" AND ");
}

export function videoListMeiliSort(sortBy: string): string[] {
  switch (sortBy) {
    case "latest":
      return ["publishedAtTs:desc", "createdAtTs:desc"];
    case "views":
      return ["views:desc"];
    case "likes":
      return ["likes:desc"];
    case "titleAsc":
      return ["title:asc"];
    case "titleDesc":
      return ["title:desc"];
    default:
      return ["publishedAtTs:desc", "createdAtTs:desc"];
  }
}

export function gameListMeiliFilter(opts: {
  tagId?: string;
  tagSlugs?: string[];
  excludeTagSlugs?: string[];
  gameType?: string;
  timeFilter?: Date;
}): string {
  const parts: string[] = [`status = ${meiliQuoteFilterValue("PUBLISHED")}`];
  if (opts.tagId) {
    parts.push(`tagIds = ${meiliQuoteFilterValue(opts.tagId)}`);
  }
  for (const s of opts.tagSlugs ?? []) {
    parts.push(`tagSlugs = ${meiliQuoteFilterValue(s)}`);
  }
  for (const s of opts.excludeTagSlugs ?? []) {
    parts.push(`(NOT tagSlugs = ${meiliQuoteFilterValue(s)})`);
  }
  if (opts.gameType) {
    parts.push(`gameType = ${meiliQuoteFilterValue(opts.gameType)}`);
  }
  if (opts.timeFilter) {
    parts.push(`publishedAtTs >= ${opts.timeFilter.getTime()}`);
  }
  return parts.join(" AND ");
}

export function gameListMeiliSort(sortBy: string): string[] {
  switch (sortBy) {
    case "latest":
      return ["publishedAtTs:desc", "createdAtTs:desc"];
    case "views":
      return ["views:desc"];
    case "downloads":
      return ["downloads:desc"];
    case "likes":
      return ["likes:desc"];
    case "titleAsc":
      return ["title:asc"];
    case "titleDesc":
      return ["title:desc"];
    default:
      return ["publishedAtTs:desc", "createdAtTs:desc"];
  }
}

export function imageListMeiliFilter(opts: {
  tagId?: string;
  tagSlugs?: string[];
  excludeTagSlugs?: string[];
  timeFilter?: Date;
}): string {
  const parts: string[] = [`status = ${meiliQuoteFilterValue("PUBLISHED")}`];
  if (opts.tagId) {
    parts.push(`tagIds = ${meiliQuoteFilterValue(opts.tagId)}`);
  }
  for (const s of opts.tagSlugs ?? []) {
    parts.push(`tagSlugs = ${meiliQuoteFilterValue(s)}`);
  }
  for (const s of opts.excludeTagSlugs ?? []) {
    parts.push(`(NOT tagSlugs = ${meiliQuoteFilterValue(s)})`);
  }
  if (opts.timeFilter) {
    parts.push(`publishedAtTs >= ${opts.timeFilter.getTime()}`);
  }
  return parts.join(" AND ");
}

export function imageListMeiliSort(sortBy: string): string[] {
  switch (sortBy) {
    case "latest":
      return ["publishedAtTs:desc", "createdAtTs:desc"];
    case "views":
      return ["views:desc"];
    case "likes":
      return ["likes:desc"];
    case "titleAsc":
      return ["title:asc"];
    case "titleDesc":
      return ["title:desc"];
    default:
      return ["publishedAtTs:desc", "createdAtTs:desc"];
  }
}

export function tagListMeiliFilter(opts: { type?: "video" | "game" | "image"; categoryId?: string }): string {
  const parts: string[] = [];
  if (opts.type === "video") {
    parts.push("videoCount > 0");
  } else if (opts.type === "game") {
    parts.push("gameCount > 0");
  } else if (opts.type === "image") {
    parts.push("imagePostCount > 0");
  }
  if (opts.categoryId) {
    parts.push(`categoryId = ${meiliQuoteFilterValue(opts.categoryId)}`);
  }
  return parts.length > 0 ? parts.join(" AND ") : "";
}
