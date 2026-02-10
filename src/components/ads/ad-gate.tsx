"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "@/lib/auth-client";
import { useSiteConfig } from "@/contexts/site-config";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Ad } from "@/lib/ads";
import { pickWeightedRandomAds } from "@/lib/ads";

const STORAGE_FREE_UNTIL = "mikiacg_ad_gate_free_until";
const STORAGE_VIEW_COUNT = "mikiacg_ad_gate_view_count";
const SESSION_CLICK_AT = "mikiacg_ad_gate_click_at";
const MIN_AWAY_MS = 1000; // 至少在新标签页停留 1 秒再返回才计数
const MAX_AWAY_MS = 10 * 60 * 1000;

/** 从 JSON 解析广告列表（兼容旧格式） */
function parseAds(raw: unknown): Ad[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    title: item.title ?? "",
    platform: item.platform ?? "",
    url: item.url ?? "",
    description: item.description ?? undefined,
    imageUrl: item.imageUrl ?? undefined,
    weight: typeof item.weight === "number" ? item.weight : 1,
    enabled: item.enabled !== false,
  }));
}

export function AdGate() {
  const { data: session, status } = useSession();
  const siteConfig = useSiteConfig();
  const [viewCount, setViewCount] = useState(0);
  const [freeUntil, setFreeUntil] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  const allAds = useMemo(() => parseAds(siteConfig?.sponsorAds), [siteConfig?.sponsorAds]);
  const enabledAds = useMemo(() => allAds.filter((a) => a.enabled), [allAds]);

  const gateOn =
    siteConfig?.adsEnabled === true &&
    siteConfig?.adGateEnabled === true &&
    enabledAds.length > 0;
  const required = siteConfig?.adGateViewsRequired ?? 3;
  const hours = siteConfig?.adGateHours ?? 12;

  const userAllowsAds =
    status !== "loading" &&
    (session === null ? true : (session.user as { adsEnabled?: boolean })?.adsEnabled !== false);

  // 随机选一条用于「随机观看广告」按钮
  const randomAd = useMemo(
    () => pickWeightedRandomAds(enabledAds, 1)[0] ?? null,
    [enabledAds]
  );

  const openSponsor = useCallback(
    (url: string) => {
      if (typeof window === "undefined") return;
      window.open(url, "_blank", "noopener,noreferrer");
      try {
        sessionStorage.setItem(SESSION_CLICK_AT, String(Date.now()));
      } catch {}
    },
    []
  );

  const tryCountReturn = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      if (document.visibilityState !== "visible") return;
      const raw = sessionStorage.getItem(SESSION_CLICK_AT);
      if (!raw) return;
      const clickAt = parseInt(raw, 10);
      if (Number.isNaN(clickAt)) return;
      const elapsed = Date.now() - clickAt;
      if (elapsed < MIN_AWAY_MS || elapsed > MAX_AWAY_MS) return;
      sessionStorage.removeItem(SESSION_CLICK_AT);
      setViewCount((prev) => {
        const next = prev + 1;
        try {
          localStorage.setItem(STORAGE_VIEW_COUNT, String(next));
        } catch {}
        if (next >= required) {
          const until = Date.now() + hours * 60 * 60 * 1000;
          try {
            localStorage.setItem(STORAGE_FREE_UNTIL, String(until));
            localStorage.removeItem(STORAGE_VIEW_COUNT);
          } catch {}
          setFreeUntil(until);
          setCompleted(true);
        }
        return next;
      });
    } catch {}
  }, [required, hours]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    try {
      const until = localStorage.getItem(STORAGE_FREE_UNTIL);
      if (until) {
        const t = parseInt(until, 10);
        if (!Number.isNaN(t) && t > Date.now()) {
          setFreeUntil(t);
          return;
        }
        localStorage.removeItem(STORAGE_FREE_UNTIL);
      }
      const count = localStorage.getItem(STORAGE_VIEW_COUNT);
      setViewCount(count ? Math.min(parseInt(count, 10) || 0, required) : 0);
    } catch {}
  }, [mounted, required]);

  useEffect(() => {
    if (!mounted || !gateOn) return;
    const onVisible = () => tryCountReturn();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [mounted, gateOn, tryCountReturn]);

  if (!mounted || !gateOn || !userAllowsAds) return null;
  if (dismissed) return null;
  if (freeUntil != null && freeUntil > Date.now() && !completed) return null;
  if (completed) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm">
        <div className="mx-4 max-w-md space-y-6 rounded-xl border bg-card p-6 text-center shadow-lg">
          <p className="text-lg font-medium text-foreground">感谢您的支持！</p>
          <p className="text-sm text-muted-foreground">
            您的支持是我们持续运营的最大动力。现在您可以享受本站的所有内容了。
          </p>
          <Button size="lg" onClick={() => setDismissed(true)}>
            进入本站
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-background p-4">
      <div className="mx-auto w-full max-w-lg space-y-6 rounded-xl border bg-card p-6 shadow-lg">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">感谢支持</h2>
          <p className="text-sm text-muted-foreground">
            点击下方广告或「随机观看广告」，在新标签页至少停留 1 秒后返回本页即可算一次。
          </p>
          <p className="text-sm text-muted-foreground">
            观看 <strong>{required}</strong> 次广告即可 <strong>{hours}</strong> 小时内关闭此广告。
          </p>
        </div>

        <div className="flex justify-center gap-2">
          <span className="rounded-full bg-primary/20 px-3 py-1 text-sm font-medium text-primary">
            {viewCount}/{required} 已完成
          </span>
        </div>

        {randomAd && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="lg"
              className="gap-2"
              onClick={() => openSponsor(randomAd.url)}
            >
              🎲 随机观看广告
            </Button>
          </div>
        )}

        <p className="text-center text-sm text-muted-foreground">
          🎯 点击下方广告或随机按钮，支持本站运营！
        </p>

        <ul className="space-y-2">
          {enabledAds.map((ad, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => openSponsor(ad.url)}
                className={cn(
                  "w-full rounded-lg border bg-muted/50 text-left text-sm transition-colors overflow-hidden",
                  "hover:bg-muted hover:border-primary/50"
                )}
              >
                {ad.imageUrl ? (
                  <div className="flex gap-3 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ad.imageUrl}
                      alt={ad.title}
                      className="w-16 h-16 rounded object-cover shrink-0"
                    />
                    <div className="flex flex-col justify-center min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-foreground truncate">{ad.title}</span>
                        {ad.platform && (
                          <span className="shrink-0 text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary font-medium leading-none">
                            {ad.platform}
                          </span>
                        )}
                      </div>
                      {ad.description && (
                        <span className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{ad.description}</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground">{ad.title}</span>
                      {ad.platform && (
                        <span className="shrink-0 text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary font-medium leading-none">
                          {ad.platform}
                        </span>
                      )}
                    </div>
                    {ad.description && (
                      <span className="mt-1 block text-muted-foreground">{ad.description}</span>
                    )}
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
