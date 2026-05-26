import { describe, expect, it } from "vitest";
import {
  comparePublicationFeedItems,
  decodePublicationFeedCursor,
  encodePublicationFeedCursor,
  publicationDate,
  shouldRefreshPublishedAt,
  videoCreatedFallbackFeedCursorWhere,
  videoFeedCreatedFallbackOrderBy,
  videoFeedPublishedOrderBy,
  videoPublishedFeedCursorWhere,
  videoPublicationDateWhere,
  videoPublicationOrderBy,
} from "@/lib/publication";

describe("publication helpers", () => {
  it("refreshes publishedAt only when content becomes published from a non-published status", () => {
    expect(shouldRefreshPublishedAt("PENDING", "PUBLISHED")).toBe(true);
    expect(shouldRefreshPublishedAt("REJECTED", "PUBLISHED")).toBe(true);
    expect(shouldRefreshPublishedAt("PUBLISHED", "PUBLISHED")).toBe(false);
    expect(shouldRefreshPublishedAt("PUBLISHED", "REJECTED")).toBe(false);
    expect(shouldRefreshPublishedAt("PENDING", "PENDING")).toBe(false);
  });

  it("orders latest content by publishedAt first with createdAt fallback", () => {
    expect(videoPublicationOrderBy).toEqual([
      { publishedAt: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
      { id: "desc" },
    ]);
  });

  it("orders feed DB subsets by the same publication timestamp keys used by the cursor", () => {
    expect(videoFeedPublishedOrderBy).toEqual([{ publishedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }]);
    expect(videoFeedCreatedFallbackOrderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
  });

  it("filters publication windows using publishedAt with createdAt fallback for old rows", () => {
    const since = new Date("2026-05-25T00:00:00.000Z");
    expect(videoPublicationDateWhere({ gte: since })).toEqual({
      OR: [{ publishedAt: { gte: since } }, { publishedAt: null, createdAt: { gte: since } }],
    });
  });

  it("returns publishedAt as display publication date when available", () => {
    const createdAt = new Date("2026-05-01T00:00:00.000Z");
    const publishedAt = new Date("2026-05-25T00:00:00.000Z");

    expect(publicationDate({ createdAt, publishedAt })).toBe(publishedAt);
    expect(publicationDate({ createdAt, publishedAt: null })).toBe(createdAt);
  });

  it("sorts mixed feed items by publication time, type, then id", () => {
    const publishedAt = new Date("2026-05-25T00:00:00.000Z");
    const older = new Date("2026-05-24T00:00:00.000Z");

    const items = [
      { type: "image" as const, id: "img-1", createdAt: older, publishedAt },
      { type: "video" as const, id: "vid-1", createdAt: older, publishedAt },
      { type: "video" as const, id: "vid-3", createdAt: older, publishedAt },
      { type: "game" as const, id: "game-1", createdAt: older, publishedAt },
      { type: "video" as const, id: "vid-old", createdAt: older, publishedAt: older },
    ];

    expect(items.sort(comparePublicationFeedItems).map((item) => `${item.type}:${item.id}`)).toEqual([
      "video:vid-3",
      "video:vid-1",
      "game:game-1",
      "image:img-1",
      "video:vid-old",
    ]);
  });

  it("encodes feed cursors with publication time, type, and id", () => {
    const item = {
      type: "video" as const,
      id: "vid-2",
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      publishedAt: new Date("2026-05-25T00:00:00.000Z"),
    };

    const cursor = encodePublicationFeedCursor(item);

    expect(decodePublicationFeedCursor(cursor)).toEqual({
      publicationTime: item.publishedAt.getTime(),
      type: "video",
      id: "vid-2",
    });
  });

  it("builds feed cursor filters that continue within the same publication time", () => {
    const publishedAt = new Date("2026-05-25T00:00:00.000Z");

    expect(
      videoPublishedFeedCursorWhere({ publicationTime: publishedAt.getTime(), type: "video", id: "vid-2" }),
    ).toEqual({
      OR: [{ publishedAt: { lt: publishedAt } }, { publishedAt, id: { lt: "vid-2" } }],
    });
    expect(
      videoCreatedFallbackFeedCursorWhere({ publicationTime: publishedAt.getTime(), type: "video", id: "vid-2" }),
    ).toEqual({
      OR: [{ createdAt: { lt: publishedAt } }, { createdAt: publishedAt, id: { lt: "vid-2" } }],
    });
  });
});
