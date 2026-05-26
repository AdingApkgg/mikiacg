import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/redis", () => ({ REDIS_AVAILABLE: false, redis: {} }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));

import { createCallerFactory, type Context } from "../trpc";
import { openApiRouter } from "../routers/open-api";
import { createMockContext, createMockSession } from "./helpers";

type FeedDbRow = {
  id: string;
  title: string;
  coverUrl?: string | null;
  images?: string[];
  views: number;
  isNsfw: boolean;
  status: "PUBLISHED";
  createdAt: Date;
  publishedAt: Date | null;
  uploader: { id: string; nickname: string | null; username: string; avatar: string | null };
};

function matchesDate(value: Date | null, condition: unknown): boolean {
  if (condition === null) return value === null;
  if (condition instanceof Date) return value?.getTime() === condition.getTime();
  if (!value || !condition || typeof condition !== "object") return false;

  const filter = condition as { lt?: Date; gte?: Date; lte?: Date; not?: Date | null };
  if ("not" in filter) {
    if (filter.not === null && value === null) return false;
    if (filter.not instanceof Date && value.getTime() === filter.not.getTime()) return false;
  }
  if (filter.lt && value >= filter.lt) return false;
  if (filter.gte && value < filter.gte) return false;
  if (filter.lte && value > filter.lte) return false;
  return true;
}

function matchesId(value: string, condition: unknown): boolean {
  if (typeof condition === "string") return value === condition;
  if (!condition || typeof condition !== "object") return false;

  const filter = condition as { in?: string[]; lt?: string };
  if (filter.in && !filter.in.includes(value)) return false;
  if (filter.lt && !(value < filter.lt)) return false;
  return true;
}

function matchesWhere(row: FeedDbRow, where: Record<string, unknown>): boolean {
  for (const [key, condition] of Object.entries(where)) {
    if (key === "OR") {
      const clauses = condition as Array<Record<string, unknown>>;
      if (!clauses.some((clause) => matchesWhere(row, clause))) return false;
      continue;
    }
    if (key === "status" && condition !== row.status) return false;
    if (key === "id" && !matchesId(row.id, condition)) return false;
    if (key === "publishedAt" && !matchesDate(row.publishedAt, condition)) return false;
    if (key === "createdAt" && !matchesDate(row.createdAt, condition)) return false;
  }

  return true;
}

function compareNullableValues(
  a: Date | string | number | null,
  b: Date | string | number | null,
  direction: "asc" | "desc",
  nulls: "first" | "last" = "last",
): number {
  if (a === null || b === null) {
    if (a === b) return 0;
    return a === null ? (nulls === "first" ? -1 : 1) : nulls === "first" ? 1 : -1;
  }

  const aValue = a instanceof Date ? a.getTime() : a;
  const bValue = b instanceof Date ? b.getTime() : b;
  const result =
    typeof aValue === "string" && typeof bValue === "string"
      ? aValue.localeCompare(bValue)
      : Number(aValue) - Number(bValue);
  return direction === "asc" ? result : -result;
}

function sortByOrderBy(
  rows: FeedDbRow[],
  orderBy: Array<Record<string, unknown>> | Record<string, unknown> | undefined,
): FeedDbRow[] {
  const orderRules = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
  return rows.sort((a, b) => {
    for (const rule of orderRules) {
      const [field, config] = Object.entries(rule)[0] ?? [];
      if (!field) continue;
      const direction =
        typeof config === "object" && config
          ? ((config as { sort?: "asc" | "desc" }).sort ?? "asc")
          : (config as "asc" | "desc");
      const nulls = typeof config === "object" && config ? (config as { nulls?: "first" | "last" }).nulls : undefined;
      const result = compareNullableValues(
        a[field as keyof FeedDbRow] as Date | string | number | null,
        b[field as keyof FeedDbRow] as Date | string | number | null,
        direction,
        nulls,
      );
      if (result !== 0) return result;
    }
    return 0;
  });
}

function findManyFor(rows: FeedDbRow[]) {
  return vi.fn(
    async (args: {
      where?: Record<string, unknown>;
      orderBy?: Array<Record<string, unknown>> | Record<string, unknown>;
      take?: number;
    }) => {
      const filtered = rows.filter((row) => matchesWhere(row, args.where ?? {}));
      return sortByOrderBy(filtered, args.orderBy).slice(0, args.take);
    },
  );
}

function row(id: string, publishedAt: Date | null, createdAt = new Date("2026-05-01T00:00:00.000Z")): FeedDbRow {
  return {
    id,
    title: id,
    coverUrl: `/covers/${id}.webp`,
    images: [`/images/${id}.webp`],
    views: 1,
    isNsfw: false,
    status: "PUBLISHED",
    createdAt,
    publishedAt,
    uploader: { id: "u1", nickname: "Uploader", username: "uploader", avatar: null },
  };
}

describe("openApi.feed", () => {
  it("continues within identical publishedAt values without duplicates or gaps", async () => {
    const publishedAt = new Date("2026-05-25T12:00:00.000Z");
    const prisma = {
      video: { findMany: findManyFor([row("v3", publishedAt), row("v2", publishedAt), row("v1", publishedAt)]) },
      game: { findMany: findManyFor([row("g2", publishedAt), row("g1", publishedAt)]) },
      imagePost: { findMany: findManyFor([row("i1", publishedAt)]) },
    } as unknown as Context["prisma"];
    const ctx = createMockContext({
      prisma,
      session: createMockSession(),
      apiKeyScopes: null,
    });
    const caller = createCallerFactory(openApiRouter)(ctx);

    const first = await caller.feed({ limit: 2 });
    const second = await caller.feed({ limit: 2, cursor: first.nextCursor });
    const third = await caller.feed({ limit: 2, cursor: second.nextCursor });

    expect(first.items.map((item) => `${item.type}:${item.id}`)).toEqual(["video:v3", "video:v2"]);
    expect(second.items.map((item) => `${item.type}:${item.id}`)).toEqual(["video:v1", "game:g2"]);
    expect(third.items.map((item) => `${item.type}:${item.id}`)).toEqual(["game:g1", "image:i1"]);

    const allIds = [...first.items, ...second.items, ...third.items].map((item) => `${item.type}:${item.id}`);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds.sort()).toEqual(["game:g1", "game:g2", "image:i1", "video:v1", "video:v2", "video:v3"]);
  });

  it("pages same-type rows by id when identical publishedAt rows have opposite createdAt order", async () => {
    const publishedAt = new Date("2026-05-25T12:00:00.000Z");
    const prisma = {
      video: {
        findMany: findManyFor([
          row("v5", publishedAt, new Date("2026-05-01T00:00:00.000Z")),
          row("v4", publishedAt, new Date("2026-05-02T00:00:00.000Z")),
          row("v3", publishedAt, new Date("2026-05-03T00:00:00.000Z")),
          row("v2", publishedAt, new Date("2026-05-04T00:00:00.000Z")),
          row("v1", publishedAt, new Date("2026-05-05T00:00:00.000Z")),
        ]),
      },
      game: { findMany: findManyFor([]) },
      imagePost: { findMany: findManyFor([]) },
    } as unknown as Context["prisma"];
    const ctx = createMockContext({
      prisma,
      session: createMockSession(),
      apiKeyScopes: null,
    });
    const caller = createCallerFactory(openApiRouter)(ctx);

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 3; page++) {
      const result = await caller.feed({ types: ["video"], limit: 2, cursor });
      seen.push(...result.items.map((item) => item.id));
      cursor = result.nextCursor;
    }

    expect(seen).toEqual(["v5", "v4", "v3", "v2", "v1"]);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("pages mixed published and legacy fallback rows across types without duplicates or gaps", async () => {
    const time = new Date("2026-05-25T12:00:00.000Z");
    const prisma = {
      video: {
        findMany: findManyFor([row("v2", time, new Date("2026-05-01T00:00:00.000Z")), row("v1", null, time)]),
      },
      game: {
        findMany: findManyFor([row("g2", null, time), row("g1", time, new Date("2026-05-01T00:00:00.000Z"))]),
      },
      imagePost: {
        findMany: findManyFor([row("i2", time, new Date("2026-05-01T00:00:00.000Z")), row("i1", null, time)]),
      },
    } as unknown as Context["prisma"];
    const ctx = createMockContext({
      prisma,
      session: createMockSession(),
      apiKeyScopes: null,
    });
    const caller = createCallerFactory(openApiRouter)(ctx);

    const first = await caller.feed({ limit: 2 });
    const second = await caller.feed({ limit: 2, cursor: first.nextCursor });
    const third = await caller.feed({ limit: 2, cursor: second.nextCursor });

    expect(first.items.map((item) => `${item.type}:${item.id}`)).toEqual(["video:v2", "video:v1"]);
    expect(second.items.map((item) => `${item.type}:${item.id}`)).toEqual(["game:g2", "game:g1"]);
    expect(third.items.map((item) => `${item.type}:${item.id}`)).toEqual(["image:i2", "image:i1"]);

    const allIds = [...first.items, ...second.items, ...third.items].map((item) => `${item.type}:${item.id}`);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds.sort()).toEqual(["game:g1", "game:g2", "image:i1", "image:i2", "video:v1", "video:v2"]);
  });
});
