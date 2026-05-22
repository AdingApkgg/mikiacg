"use client";

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import { useRedirectOptions } from "@/hooks/use-redirect-options";
import { useRandomAds } from "@/hooks/use-ads";
import { resolveSlotPosition, getAdImage, type Ad } from "@/lib/ads";
import { cn, getRedirectUrl } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

const AUTO_PLAY_MS = 5000;
const emptySubscribe = () => () => {};

function isExplicitHeaderCarouselAd(ad: Ad): boolean {
  return Array.isArray(ad.positions) && ad.positions.includes("header-carousel");
}

export function HeaderBannerCarousel({ className }: { className?: string }) {
  const redirectOpts = useRedirectOptions();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const { ads, showAds } = useRandomAds(5, "header-carousel", resolveSlotPosition("header-carousel"));

  const [current, setCurrent] = useState(0);
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const displayAds = ads.filter((ad) => {
    const imageUrl = getAdImage(ad, "header-carousel")?.trim();
    return isExplicitHeaderCarouselAd(ad) && ad.kind !== "html" && !!imageUrl && !failedIds.has(ad.id);
  });
  const total = displayAds.length;

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (total <= 1) return;
    timerRef.current = setInterval(() => {
      setCurrent((i) => (i + 1) % total);
    }, AUTO_PLAY_MS);
  }, [total]);

  useEffect(() => {
    resetTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [resetTimer]);

  const go = useCallback(
    (dir: -1 | 1) => {
      setCurrent((i) => (i + dir + total) % total);
      resetTimer();
    },
    [total, resetTimer],
  );

  const goTo = useCallback(
    (idx: number) => {
      setCurrent(idx);
      resetTimer();
    },
    [resetTimer],
  );

  if (!mounted || !showAds || total === 0) return null;
  const ad = displayAds[current % total];
  const imageUrl = getAdImage(ad, "header-carousel")?.trim();
  if (!imageUrl) return null;

  return (
    <div className={cn("relative rounded-xl overflow-hidden", className)}>
      <a
        href={getRedirectUrl(ad.url, redirectOpts)}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className="group block w-full"
      >
        <div className="relative max-h-[240px] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={ad.title}
            className="w-full h-auto block transition-transform group-hover:scale-[1.01]"
            loading="lazy"
            onError={() => setFailedIds((prev) => new Set(prev).add(ad.id))}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate drop-shadow-sm">{ad.title}</p>
              {ad.description && <p className="text-xs text-white/80 line-clamp-1 drop-shadow-sm">{ad.description}</p>}
            </div>
            {ad.platform && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 text-white font-medium backdrop-blur-sm">
                {ad.platform}
              </span>
            )}
          </div>
          <div className="absolute top-2 right-2 text-[9px] px-1.5 py-0.5 rounded bg-black/40 text-white/70 backdrop-blur-sm">
            广告
          </div>
        </div>
      </a>

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white/80 hover:bg-black/50 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white/80 hover:bg-black/50 hover:text-white transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}

      {total > 1 && (
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1.5 py-1">
          {displayAds.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => goTo(idx)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                idx === current ? "w-4 bg-white" : "w-1.5 bg-white/40 hover:bg-white/60",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
