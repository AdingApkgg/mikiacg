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
  });

  it("默认锚点不包含标签入口", () => {
    expect(COMPOSITE_ANCHOR_ITEMS.map((item) => item.id)).not.toContain("tags");
  });
});
