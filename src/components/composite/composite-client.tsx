"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowRight, Play, Images, Gamepad2, type LucideIcon } from "lucide-react";
import { MotionPage } from "@/components/motion";
import { AnnouncementBanner } from "@/components/shared/announcement-banner";
import { AdCard } from "@/components/ads/ad-card";
import { useRandomAds } from "@/hooks/use-ads";
import { resolveSlotPosition } from "@/lib/ads";
import { useUIStore } from "@/stores/app";
import { useSiteConfig } from "@/contexts/site-config";
import { VideoCard } from "@/components/video/video-card";
import { ImagePostCard } from "@/components/image/image-post-card";
import { ImageMasonry } from "@/components/image/image-masonry";
import { GameCard } from "@/components/game/game-card";
import { CompositeHero } from "./composite-hero";
import { CompositeMixedHot } from "./composite-mixed-hot";
import { CompositeWeeklyRanking } from "./composite-weekly-ranking";
import { CompositeAnchorNav, COMPOSITE_ANCHOR_ITEMS, type AnchorItem } from "./composite-anchor-nav";
import { cn } from "@/lib/utils";

type Video = Parameters<typeof VideoCard>[0]["video"];
type ImagePost = Omit<Parameters<typeof ImagePostCard>[0]["post"], "images"> & { images: string[] };
type Game = Parameters<typeof GameCard>[0]["game"];

const LATEST_VIDEO_DISPLAY_COUNT = 8;

interface CompositeClientProps {
  initialVideos: Video[];
  initialImages: ImagePost[];
  initialGames: Game[];
  hotVideos: Video[];
  hotImages: ImagePost[];
  hotGames: Game[];
}

/**
 * 综合分区 = 站点首页 `/`。从上到下：
 *  1. Banner + 公告
 *  2. Hero 推荐（本月热门 #1 三类各一张）
 *  3. 综合热门（跨视频/图集/游戏混合 grid，跳过 hero 已用的 #1）
 *  4. 最新视频（两行网格）
 *  5. 最新游戏（网格）
 *  6. 最新图集（瀑布流）
 *  7. 本月排行（3 列 mini Top10）
 *
 * 关闭单一分区时该类数据为空，对应 section 自动隐藏。
 */
export function CompositeClient({
  initialVideos,
  initialImages,
  initialGames,
  hotVideos,
  hotImages,
  hotGames,
}: CompositeClientProps) {
  const setContentMode = useUIStore((s) => s.setContentMode);
  const cfg = useSiteConfig();

  useEffect(() => {
    setContentMode("composite");
  }, [setContentMode]);

  const videoEnabled = cfg?.sectionVideoEnabled !== false;
  const imageEnabled = cfg?.sectionImageEnabled !== false;
  const gameEnabled = cfg?.sectionGameEnabled !== false;
  const latestVideos = initialVideos.slice(0, LATEST_VIDEO_DISPLAY_COUNT);

  // 锚点条按实际渲染的 section 过滤，避免点击跳到不存在的位置
  const renderedAnchors: AnchorItem[] = COMPOSITE_ANCHOR_ITEMS.filter((a) => {
    if (a.id === "hero")
      return (
        (videoEnabled && hotVideos.length > 0) ||
        (imageEnabled && hotImages.length > 0) ||
        (gameEnabled && hotGames.length > 0)
      );
    if (a.id === "mixed-hot")
      return (
        (videoEnabled && hotVideos.length > 1) ||
        (imageEnabled && hotImages.length > 1) ||
        (gameEnabled && hotGames.length > 1)
      );
    if (a.id === "latest-video") return videoEnabled && latestVideos.length > 0;
    if (a.id === "latest-image") return imageEnabled && initialImages.length > 0;
    if (a.id === "latest-game") return gameEnabled && initialGames.length > 0;
    if (a.id === "ranking")
      return (
        (videoEnabled && hotVideos.length > 0) ||
        (imageEnabled && hotImages.length > 0) ||
        (gameEnabled && hotGames.length > 0)
      );
    return true;
  });

  return (
    <MotionPage direction="none">
      <div className="px-4 md:px-6 py-4 overflow-x-clip">
        <AnnouncementBanner enabled={cfg?.announcementEnabled ?? false} announcement={cfg?.announcement ?? null} />

        {renderedAnchors.length > 0 && <CompositeAnchorNav items={renderedAnchors} topOffset={56} className="mb-6" />}

        <div className="space-y-10">
          <section id="hero" className="scroll-mt-32">
            <CompositeHero
              video={videoEnabled ? (hotVideos[0] ?? null) : null}
              image={imageEnabled ? (hotImages[0] ?? null) : null}
              game={gameEnabled ? (hotGames[0] ?? null) : null}
            />
          </section>

          <section id="mixed-hot" className="scroll-mt-32">
            <CompositeMixedHot
              skip={1}
              perKind={4}
              videos={videoEnabled ? hotVideos : []}
              images={imageEnabled ? hotImages : []}
              games={gameEnabled ? hotGames : []}
            />
          </section>

          <CompositeInlineAds seed="composite-mid" count={3} />

          {videoEnabled && latestVideos.length > 0 && (
            <section id="latest-video" className="scroll-mt-32">
              <SectionHeader title="最新视频" icon={Play} iconClass="text-rose-500" more="/video">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
                  {latestVideos.map((v, i) => (
                    <VideoCard key={v.id} video={v} index={i} />
                  ))}
                </div>
              </SectionHeader>
            </section>
          )}

          {gameEnabled && initialGames.length > 0 && (
            <section id="latest-game" className="scroll-mt-32">
              <SectionHeader title="最新游戏" icon={Gamepad2} iconClass="text-emerald-500" more="/game">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
                  {initialGames.map((g, i) => (
                    <GameCard key={g.id} game={g} index={i} />
                  ))}
                </div>
              </SectionHeader>
            </section>
          )}

          {imageEnabled && initialImages.length > 0 && (
            <section id="latest-image" className="scroll-mt-32">
              <SectionHeader title="最新图集" icon={Images} iconClass="text-sky-500" more="/image">
                <ImageMasonry
                  items={initialImages.map((p, i) => ({
                    key: p.id,
                    node: <ImagePostCard post={p} index={i} variant="masonry" />,
                  }))}
                />
              </SectionHeader>
            </section>
          )}

          <CompositeInlineAds seed="composite-end" count={2} />

          <section id="ranking" className="scroll-mt-32">
            <CompositeWeeklyRanking
              videos={videoEnabled ? hotVideos : []}
              images={imageEnabled ? hotImages : []}
              games={gameEnabled ? hotGames : []}
            />
          </section>
        </div>
      </div>
    </MotionPage>
  );
}

interface SectionHeaderProps {
  title: string;
  icon: LucideIcon;
  iconClass?: string;
  more: string;
  children: React.ReactNode;
}

function SectionHeader({ title, icon: Icon, iconClass, more, children }: SectionHeaderProps) {
  return (
    <section>
      <header className="mb-3 flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-5 w-5", iconClass)} />
          <h2 className="text-lg sm:text-xl font-semibold tracking-tight">{title}</h2>
        </div>
        <Link
          href={more}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          查看更多
          <ArrowRight className="h-4 w-4" />
        </Link>
      </header>
      {children}
    </section>
  );
}

/** 综合页 sections 之间的信息流广告条：按 1×N 网格展示 in-feed 广告。 */
function CompositeInlineAds({ seed, count }: { seed: string; count: number }) {
  const { ads, showAds } = useRandomAds(count, seed, resolveSlotPosition("in-feed"));
  if (!showAds || ads.length === 0) return null;

  const colsClass =
    ads.length === 1
      ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      : ads.length === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : "grid-cols-2 lg:grid-cols-3";

  return (
    <section aria-label="赞助内容">
      <div className={cn("grid gap-3 sm:gap-4 lg:gap-5", colsClass)}>
        {ads.map((ad) => (
          <AdCard key={ad.id} ad={ad} slotId="in-feed" />
        ))}
      </div>
    </section>
  );
}
