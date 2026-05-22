"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Flame, Sparkles, Play, Images, Gamepad2, Trophy, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AnchorItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface CompositeAnchorNavProps {
  items: AnchorItem[];
  /** Sticky 时相对当前滚动容器的距顶 offset。AppLayout 已为 Header 预留高度，首页默认 0。 */
  topOffset?: number;
  className?: string;
}

/** 常用锚点定义（id 必须跟 page 上的 section id 对齐） */
export const COMPOSITE_ANCHOR_ITEMS: AnchorItem[] = [
  { id: "hero", label: "本月热门", icon: Flame },
  { id: "mixed-hot", label: "综合热门", icon: Sparkles },
  { id: "latest-video", label: "最新视频", icon: Play },
  { id: "latest-game", label: "最新游戏", icon: Gamepad2 },
  { id: "latest-image", label: "最新图集", icon: Images },
  { id: "ranking", label: "本月排行", icon: Trophy },
];

const SECTION_ACTIVATION_GAP = 8;

/**
 * 综合页顶部锚点快跳条：滚动时变 sticky，点击平滑滚到对应 section。
 * 当前可视 section 的 anchor 自动高亮：
 *  - 滚动时按「sticky 条下方判定线」落在哪个 section 内来判定
 *  - 滚到页面底部时强制激活最后一项（最后一段往往滚不到顶部）
 *  - 用户刚点击后短暂锁定激活态，避免平滑滚动期间被回写覆盖
 */
export function CompositeAnchorNav({ items, topOffset = 0, className }: CompositeAnchorNavProps) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const navRef = useRef<HTMLDivElement>(null);
  // 点击锁：刚点击后 800ms 内忽略 scroll 自动判定，避免平滑滚动中途穿过多个 section 抖动
  const lockUntilRef = useRef<number>(0);

  const getViewportAnchorLine = useCallback(() => {
    const rect = navRef.current?.getBoundingClientRect();
    if (rect && rect.height > 0) return rect.bottom + SECTION_ACTIVATION_GAP;
    return topOffset + 24;
  }, [topOffset]);

  useEffect(() => {
    if (items.length === 0) return;

    const compute = () => {
      if (Date.now() < lockUntilRef.current) return;
      const checkLine = getViewportAnchorLine();
      // 到达页面底部时直接选最后一个
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        setActiveId(items[items.length - 1].id);
        return;
      }
      // 找「checkLine」处于哪个 section 内（top <= checkLine < bottom）
      for (let i = items.length - 1; i >= 0; i--) {
        const el = document.getElementById(items[i].id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= checkLine) {
          setActiveId(items[i].id);
          return;
        }
      }
      setActiveId(items[0].id);
    };

    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, [getViewportAnchorLine, items]);

  const scrollTo = useCallback(
    (id: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      // 立刻置为 active 并锁定，避免平滑滚动途中被错位高亮
      setActiveId(id);
      lockUntilRef.current = Date.now() + 800;
      const navBottom = navRef.current?.getBoundingClientRect().bottom ?? topOffset;
      const top = el.getBoundingClientRect().top + window.scrollY - (navBottom + SECTION_ACTIVATION_GAP);
      window.scrollTo({ top, behavior: "smooth" });
    },
    [topOffset],
  );

  if (items.length === 0) return null;

  return (
    <div
      ref={navRef}
      className={cn(
        "sticky z-30 -mx-4 md:-mx-6 px-4 md:px-6 py-2 backdrop-blur-md bg-background/85 border-b border-border/60",
        className,
      )}
      style={{ top: topOffset }}
    >
      <div className="flex gap-1 sm:gap-2 overflow-x-auto scrollbar-hide">
        {items.map(({ id, label, icon: Icon }) => {
          const active = activeId === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => scrollTo(id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
