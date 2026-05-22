import { renderToStaticMarkup } from "react-dom/server";
import { Flame } from "lucide-react";
import { describe, expect, it } from "vitest";
import { COMPOSITE_ANCHOR_ITEMS, CompositeAnchorNav, type AnchorItem } from "./composite-anchor-nav";

describe("CompositeAnchorNav", () => {
  it("items 为空时不渲染导航外壳", () => {
    const html = renderToStaticMarkup(<CompositeAnchorNav items={[]} />);

    expect(html).toBe("");
  });

  it("items 非空时渲染锚点按钮", () => {
    const items: AnchorItem[] = [{ id: "hero", label: "本月热门", icon: Flame }];
    const html = renderToStaticMarkup(<CompositeAnchorNav items={items} />);

    expect(html).toContain("button");
    expect(html).toContain("本月热门");
    expect(html).toContain("overflow-x-auto");
  });

  it("默认 sticky top 为 0，避免首页重复叠加 Header 占位", () => {
    const items: AnchorItem[] = [{ id: "hero", label: "本月热门", icon: Flame }];
    const html = renderToStaticMarkup(<CompositeAnchorNav items={items} />);

    expect(html).toMatch(/style="top:0(?:px)?"/);
    expect(html).not.toContain("top:56");
  });

  it("传入 topOffset 时仍用于 sticky top", () => {
    const items: AnchorItem[] = [{ id: "hero", label: "本月热门", icon: Flame }];
    const html = renderToStaticMarkup(<CompositeAnchorNav items={items} topOffset={24} />);

    expect(html).toContain('style="top:24px"');
  });

  it("默认锚点不包含标签入口", () => {
    expect(COMPOSITE_ANCHOR_ITEMS.map((item) => item.id)).not.toContain("tags");
  });
});
