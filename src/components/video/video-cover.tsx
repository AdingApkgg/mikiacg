"use client";

import Image from "next/image";
import { Film } from "lucide-react";
import { useState } from "react";

interface VideoCoverProps {
  videoId?: string;
  coverUrl?: string | null;
  title: string;
  className?: string;
}

// 占位符组件
function CoverPlaceholder({ className = "" }: { className?: string }) {
  return (
    <div 
      className={`absolute inset-0 bg-gradient-to-br from-primary/5 via-muted to-primary/10 flex items-center justify-center ${className}`}
    >
      <div className="text-center text-muted-foreground/60">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/10 blur-xl rounded-full" />
          <Film className="h-10 w-10 mx-auto relative" />
        </div>
        <span className="text-xs mt-2 block font-medium">暂无封面</span>
      </div>
    </div>
  );
}

export function VideoCover({ videoId, coverUrl, title, className = "" }: VideoCoverProps) {
  const [error, setError] = useState(false);

  // 获取封面 URL
  const getCoverSrc = () => {
    if (error) return null;
    
    if (coverUrl) {
      // 使用代理缓存外部图片
      return `/api/cover/${encodeURIComponent(coverUrl)}`;
    }
    
    if (videoId) {
      // 自动从视频生成封面（使用 ffmpeg）
      return `/api/cover/video/${videoId}`;
    }
    
    return null;
  };

  const coverSrc = getCoverSrc();

  // 无法获取封面时显示占位符
  if (!coverSrc) {
    return <CoverPlaceholder className={className} />;
  }

  return (
    <Image
      src={coverSrc}
      alt={title}
      fill
      className={`object-cover ${className}`}
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      onError={() => setError(true)}
      unoptimized // 跳过 Next.js 图片优化，因为 API 可能返回 404
    />
  );
}
