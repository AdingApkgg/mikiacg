import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SectionTabs } from "./section-tabs";

describe("SectionTabs", () => {
  it("隐藏横向滚动条但保留横向滚动能力", () => {
    const html = renderToStaticMarkup(
      <SectionTabs
        tabs={[
          { id: "latest", label: "最新" },
          { id: "views", label: "热门" },
          { id: "likes", label: "高赞" },
        ]}
        value="latest"
        onChange={vi.fn()}
      />,
    );

    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("overflow-y-hidden");
    expect(html).toContain("scrollbar-hide");
    expect(html).not.toContain("scrollbar-thin");
  });
});
