"use client";

import { useRandomAds } from "@/hooks/use-ads";
import { AdCard } from "./ad-card";
import { cn } from "@/lib/utils";

export interface AdSlotProps {
  /** 广告位标识（用于数据统计） */
  slotId?: string;
  /** 占位最小高度（px） */
  minHeight?: number;
  /** 紧凑模式（侧栏等小空间） */
  compact?: boolean;
  className?: string;
  /** 子节点：传入时优先渲染子节点 */
  children?: React.ReactNode;
}

/**
 * 广告位容器：从统一广告列表中随机选取一条展示。
 * 仅当「系统设置中启用广告」且「用户未被关闭广告」时渲染。
 */
export function AdSlot({ slotId = "default", minHeight, compact, className, children }: AdSlotProps) {
  const { ads, showAds } = useRandomAds(1, slotId);
  const ad = ads[0];

  if (!showAds) return null;
  if (children) {
    return (
      <div
        role="complementary"
        aria-label="广告位"
        data-ad-slot={slotId}
        className={cn("rounded-lg overflow-hidden", className)}
        style={minHeight ? { minHeight: `${minHeight}px` } : undefined}
      >
        {children}
      </div>
    );
  }

  if (!ad) return null;

  return (
    <div
      role="complementary"
      aria-label="广告位"
      data-ad-slot={slotId}
      className={cn(className)}
      style={minHeight ? { minHeight: `${minHeight}px` } : undefined}
    >
      <AdCard ad={ad} compact={compact} />
    </div>
  );
}
