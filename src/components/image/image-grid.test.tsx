import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./image-post-card", () => ({
  ImagePostCard: ({ post }: { post: { title: string } }) => <article>{post.title}</article>,
}));

describe("ImageGrid", () => {
  it("loading skeleton matches the default 16:9 card ratio", async () => {
    const { ImageGrid } = await import("./image-grid");

    const html = renderToStaticMarkup(<ImageGrid posts={[]} isLoading />);

    expect(html).toContain("aspect-video");
    expect(html).not.toContain("aspect-square");
  });
});
