"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const COOKIE = "composite-hide-nsfw";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 年

function readHideNsfwCookie() {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .some((part) => part === `${COOKIE}=1`);
}

function writeHideNsfwCookie(hideNsfw: boolean) {
  document.cookie = hideNsfw
    ? `${COOKIE}=1; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`
    : `${COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/**
 * 综合页 NSFW 显示开关：通过 cookie 控制服务端查询。
 * 切换后调用 router.refresh() 让 RSC 重新拉取数据，无需整页 reload。
 */
export function CompositeNsfwToggle({
  hideNsfw,
  collapsed = false,
  className,
}: {
  hideNsfw?: boolean;
  collapsed?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const switchId = useId();
  const [fallbackInitial] = useState(() => hideNsfw ?? readHideNsfwCookie());
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const current = optimistic ?? hideNsfw ?? fallbackInitial;

  const applyValue = (next: boolean) => {
    setOptimistic(next);
    writeHideNsfwCookie(next);
    startTransition(() => router.refresh());
  };

  const Icon = current ? EyeOff : Eye;
  const title = current ? "当前已隐藏 NSFW，点击恢复显示" : "当前显示全部内容，点击隐藏 NSFW";

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => applyValue(!current)}
        disabled={pending}
        aria-pressed={current}
        title={title}
        className={cn(
          "flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-3 transition-[background-color] duration-150 ease-out hover:bg-accent/60",
          current && "bg-accent",
          pending && "opacity-60 cursor-wait",
          className,
        )}
      >
        <Icon className={cn("h-5 w-5", current ? "stroke-[2.5px]" : "stroke-[1.5px]")} />
        <span className={cn("text-[10px] leading-tight", current ? "font-semibold" : "font-normal")}>NSFW</span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-[background-color] duration-150 ease-out hover:bg-accent/60",
        current && "bg-accent/70",
        className,
      )}
      title={title}
    >
      <Icon className={cn("h-[22px] w-[22px] shrink-0", current ? "stroke-[2.5px]" : "stroke-[1.5px]")} />
      <label htmlFor={switchId} className="flex min-w-0 flex-1 cursor-pointer flex-col">
        <span className="truncate font-medium">{current ? "隐藏 NSFW" : "显示全部"}</span>
        <span className="truncate text-xs text-muted-foreground">
          {current ? "仅显示普通内容" : "包含 NSFW 内容"}
        </span>
      </label>
      <Switch
        id={switchId}
        size="sm"
        checked={current}
        onCheckedChange={applyValue}
        disabled={pending}
        aria-label={current ? "隐藏 NSFW" : "显示全部"}
      />
    </div>
  );
}
