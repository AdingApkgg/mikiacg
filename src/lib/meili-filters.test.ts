import { describe, expect, it } from "vitest";
import {
  gameListMeiliFilter,
  gameListMeiliSort,
  imageListMeiliFilter,
  imageListMeiliSort,
  videoListMeiliFilter,
  videoListMeiliSort,
} from "@/lib/meili-filters";

describe("meili list sorting", () => {
  it("uses publishedAtTs for latest sorting with createdAtTs as fallback", () => {
    expect(videoListMeiliSort("latest")).toEqual(["publishedAtTs:desc", "createdAtTs:desc"]);
    expect(gameListMeiliSort("latest")).toEqual(["publishedAtTs:desc", "createdAtTs:desc"]);
    expect(imageListMeiliSort("latest")).toEqual(["publishedAtTs:desc", "createdAtTs:desc"]);
  });
});

describe("meili list time filters", () => {
  it("uses publishedAtTs for video, game, and image time windows", () => {
    const since = new Date("2026-05-25T00:00:00.000Z");
    const ts = since.getTime();

    expect(videoListMeiliFilter({ timeFilter: since })).toContain(`publishedAtTs >= ${ts}`);
    expect(gameListMeiliFilter({ timeFilter: since })).toContain(`publishedAtTs >= ${ts}`);
    expect(imageListMeiliFilter({ timeFilter: since })).toContain(`publishedAtTs >= ${ts}`);
  });
});
