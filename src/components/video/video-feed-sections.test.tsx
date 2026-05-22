import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listCalls: [] as Array<{ limit: number; sortBy: string; page: number; timeRange: string }>,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    video: {
      list: {
        useQuery: (input: { limit: number; sortBy: string; page: number; timeRange: string }) => {
          mocks.listCalls.push(input);
          return {
            data: {
              videos: Array.from({ length: input.limit }).map((_, index) => ({
                id: `${input.sortBy}-${index}`,
                title: `${input.sortBy}-video-${index}`,
                coverUrl: null,
                duration: 60,
                views: 1,
                createdAt: "2026-01-01T00:00:00.000Z",
                uploader: { id: "user-1", username: "user", nickname: null, avatar: null },
                _count: { likes: 0 },
              })),
            },
            isLoading: false,
          };
        },
      },
      progressMap: { useQuery: () => ({ data: { progressByVideoId: {} } }) },
      favoritedMap: { useQuery: () => ({ data: { favoritedIds: [] } }) },
    },
  },
}));

vi.mock("./video-card", () => ({
  VideoCard: ({ video }: { video: { title: string } }) => <article>{video.title}</article>,
}));

describe("VideoFeedSections", () => {
  beforeEach(() => {
    mocks.listCalls = [];
  });

  it("不渲染按标签浏览和全部标签入口", async () => {
    const { VideoFeedSections } = await import("./video-feed-sections");
    const html = renderToStaticMarkup(<VideoFeedSections />);

    expect(html).not.toContain("按标签浏览");
    expect(html).not.toContain("全部标签");
  });

  it("最新发布最多请求并渲染 8 条，使用网格而非横向滚动", async () => {
    const { VideoFeedSections } = await import("./video-feed-sections");
    const html = renderToStaticMarkup(<VideoFeedSections />);

    const latestCall = mocks.listCalls.find((call) => call.sortBy === "latest");
    expect(latestCall?.limit).toBe(8);
    expect(html.match(/latest-video-/g)?.length).toBe(8);
    expect(html).toContain("grid-cols-2");
    expect(html).toContain("lg:grid-cols-4");
    expect(html).not.toContain("overflow-hidden");
  });
});
