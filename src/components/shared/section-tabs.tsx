"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SectionTabItem<T extends string = string> {
  id: T;
  label: string;
  count?: number;
}

interface SectionTabsProps<T extends string> {
  tabs: readonly SectionTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  /** 右侧附加节点（例如"显示更多"链接、视图模式切换） */
  trailing?: ReactNode;
}

export function SectionTabs<T extends string>({ tabs, value, onChange, className, trailing }: SectionTabsProps<T>) {
  return (
    <div className={cn("flex items-end gap-2 border-b border-border/60", className)}>
      <div className="flex flex-1 items-end gap-0.5 overflow-x-auto overflow-y-hidden scrollbar-hide">
        {tabs.map((tab) => {
          const active = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                "relative shrink-0 px-3.5 py-2.5 text-sm font-medium transition-colors outline-none",
                "focus-visible:text-foreground",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={active}
            >
              <span className="inline-flex items-center gap-1.5">
                {tab.label}
                {typeof tab.count === "number" && (
                  <span className={cn("text-xs tabular-nums", active ? "text-primary" : "text-muted-foreground/70")}>
                    {tab.count}
                  </span>
                )}
              </span>
              <span
                aria-hidden
                className={cn(
                  "absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-primary transition-[opacity,transform] duration-300 ease-out origin-center",
                  active ? "opacity-100 scale-x-100" : "opacity-0 scale-x-0",
                )}
              />
            </button>
          );
        })}
      </div>
      {trailing && <div className="shrink-0 pb-1.5">{trailing}</div>}
    </div>
  );
}
