import { Prisma } from "@/generated/prisma/client";

type PublicationDateFilter = {
  gte?: Date;
  lte?: Date;
  lt?: Date;
};

type PublicationTimestamps = {
  createdAt: Date;
  publishedAt: Date | null;
};

type ContentStatus = "PENDING" | "PUBLISHED" | "REJECTED" | "DELETED";
export type PublicationContentType = "video" | "game" | "image";

export type PublicationFeedCursor = {
  publicationTime: number;
  type: PublicationContentType;
  id: string;
};

type PublicationFeedRow = PublicationTimestamps & {
  type: PublicationContentType;
  id: string;
};

const PUBLICATION_TYPE_ORDER = ["video", "game", "image"] as const;

export function shouldRefreshPublishedAt(currentStatus: ContentStatus, nextStatus: ContentStatus): boolean {
  return nextStatus === "PUBLISHED" && currentStatus !== "PUBLISHED";
}

export function publicationDate(row: PublicationTimestamps): Date {
  return row.publishedAt ?? row.createdAt;
}

export function publicationTimestamp(row: PublicationTimestamps): number {
  return publicationDate(row).getTime();
}

export function publicationTypeRank(type: PublicationContentType): number {
  return PUBLICATION_TYPE_ORDER.indexOf(type);
}

export function comparePublicationFeedItems(a: PublicationFeedRow, b: PublicationFeedRow): number {
  const timeDelta = publicationTimestamp(b) - publicationTimestamp(a);
  if (timeDelta !== 0) return timeDelta;

  const typeDelta = publicationTypeRank(a.type) - publicationTypeRank(b.type);
  if (typeDelta !== 0) return typeDelta;

  return b.id.localeCompare(a.id);
}

function normalizePublicationFeedCursor(value: unknown): PublicationFeedCursor | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const publicationTime =
    typeof record.publicationTime === "number"
      ? record.publicationTime
      : typeof record.publicationTime === "string"
        ? Number(record.publicationTime)
        : Number.NaN;
  const type = record.type;
  const id = record.id;

  if (!Number.isFinite(publicationTime)) return null;
  if (!PUBLICATION_TYPE_ORDER.includes(type as PublicationContentType)) return null;
  if (typeof id !== "string") return null;

  return { publicationTime, type: type as PublicationContentType, id };
}

export function encodePublicationFeedCursor(row: PublicationFeedRow): string {
  return Buffer.from(
    JSON.stringify({
      publicationTime: publicationTimestamp(row),
      type: row.type,
      id: row.id,
    } satisfies PublicationFeedCursor),
  ).toString("base64url");
}

export function decodePublicationFeedCursor(cursor: string): PublicationFeedCursor | null {
  const trimmed = cursor.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(Buffer.from(trimmed, "base64url").toString("utf8"));
    const decoded = normalizePublicationFeedCursor(parsed);
    if (decoded) return decoded;
  } catch {
    // Fall through to plain JSON and legacy ISO parsing.
  }

  try {
    const decoded = normalizePublicationFeedCursor(JSON.parse(trimmed));
    if (decoded) return decoded;
  } catch {
    // Fall through to legacy ISO parsing.
  }

  const legacyDate = new Date(trimmed);
  if (!Number.isNaN(legacyDate.getTime())) {
    return { publicationTime: legacyDate.getTime(), type: "image", id: "" };
  }

  return null;
}

function publicationCursorWhere(
  type: PublicationContentType,
  cursor: PublicationFeedCursor,
  dateField: "publishedAt" | "createdAt",
): { OR: Array<Record<string, unknown>> } {
  const date = new Date(cursor.publicationTime);
  const clauses: Array<Record<string, unknown>> = [{ [dateField]: { lt: date } }];

  const rankDelta = publicationTypeRank(type) - publicationTypeRank(cursor.type);
  if (rankDelta > 0) {
    clauses.push({ [dateField]: date });
  } else if (rankDelta === 0) {
    clauses.push({ [dateField]: date, id: { lt: cursor.id } });
  }

  return { OR: clauses };
}

export const videoFeedPublishedOrderBy = [
  { publishedAt: { sort: "desc", nulls: "last" } },
  { id: "desc" },
] satisfies Prisma.VideoOrderByWithRelationInput[];

export const videoFeedCreatedFallbackOrderBy = [
  { createdAt: "desc" },
  { id: "desc" },
] satisfies Prisma.VideoOrderByWithRelationInput[];

export const gameFeedPublishedOrderBy = [
  { publishedAt: { sort: "desc", nulls: "last" } },
  { id: "desc" },
] satisfies Prisma.GameOrderByWithRelationInput[];

export const gameFeedCreatedFallbackOrderBy = [
  { createdAt: "desc" },
  { id: "desc" },
] satisfies Prisma.GameOrderByWithRelationInput[];

export const imageFeedPublishedOrderBy = [
  { publishedAt: { sort: "desc", nulls: "last" } },
  { id: "desc" },
] satisfies Prisma.ImagePostOrderByWithRelationInput[];

export const imageFeedCreatedFallbackOrderBy = [
  { createdAt: "desc" },
  { id: "desc" },
] satisfies Prisma.ImagePostOrderByWithRelationInput[];

export const videoPublicationOrderBy = [
  { publishedAt: { sort: "desc", nulls: "last" } },
  { createdAt: "desc" },
  { id: "desc" },
] satisfies Prisma.VideoOrderByWithRelationInput[];

export const gamePublicationOrderBy = [
  { publishedAt: { sort: "desc", nulls: "last" } },
  { createdAt: "desc" },
  { id: "desc" },
] satisfies Prisma.GameOrderByWithRelationInput[];

export const imagePublicationOrderBy = [
  { publishedAt: { sort: "desc", nulls: "last" } },
  { createdAt: "desc" },
  { id: "desc" },
] satisfies Prisma.ImagePostOrderByWithRelationInput[];

export function videoPublicationDateWhere(range: PublicationDateFilter): Prisma.VideoWhereInput {
  return {
    OR: [{ publishedAt: range }, { publishedAt: null, createdAt: range }],
  };
}

export function gamePublicationDateWhere(range: PublicationDateFilter): Prisma.GameWhereInput {
  return {
    OR: [{ publishedAt: range }, { publishedAt: null, createdAt: range }],
  };
}

export function imagePublicationDateWhere(range: PublicationDateFilter): Prisma.ImagePostWhereInput {
  return {
    OR: [{ publishedAt: range }, { publishedAt: null, createdAt: range }],
  };
}

export function videoPublishedFeedCursorWhere(cursor: PublicationFeedCursor): Prisma.VideoWhereInput {
  return publicationCursorWhere("video", cursor, "publishedAt") as Prisma.VideoWhereInput;
}

export function videoCreatedFallbackFeedCursorWhere(cursor: PublicationFeedCursor): Prisma.VideoWhereInput {
  return publicationCursorWhere("video", cursor, "createdAt") as Prisma.VideoWhereInput;
}

export function gamePublishedFeedCursorWhere(cursor: PublicationFeedCursor): Prisma.GameWhereInput {
  return publicationCursorWhere("game", cursor, "publishedAt") as Prisma.GameWhereInput;
}

export function gameCreatedFallbackFeedCursorWhere(cursor: PublicationFeedCursor): Prisma.GameWhereInput {
  return publicationCursorWhere("game", cursor, "createdAt") as Prisma.GameWhereInput;
}

export function imagePublishedFeedCursorWhere(cursor: PublicationFeedCursor): Prisma.ImagePostWhereInput {
  return publicationCursorWhere("image", cursor, "publishedAt") as Prisma.ImagePostWhereInput;
}

export function imageCreatedFallbackFeedCursorWhere(cursor: PublicationFeedCursor): Prisma.ImagePostWhereInput {
  return publicationCursorWhere("image", cursor, "createdAt") as Prisma.ImagePostWhereInput;
}

export function addWhereAnd<T extends { AND?: T | T[] }>(where: T, clause: T): void {
  const current = where.AND;
  where.AND = Array.isArray(current) ? [...current, clause] : current ? [current, clause] : [clause];
}
