"use client";

import { useEffect, useRef } from "react";
import Hls from "hls.js";

interface GameVideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
}

const VIDEO_EXTS = /\.(mp4|webm|ogg|mov)$/i;
const HLS_EXTS = /\.m3u8$/i;

/**
 * 轻量级视频播放器：支持 mp4 原生播放 + HLS 流媒体
 * 使用 HTML5 原生 <video> 控件
 */
export function GameVideoPlayer({ src, poster, className }: GameVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // 清理旧实例
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHls = HLS_EXTS.test(src);
    const isMp4 = VIDEO_EXTS.test(src);

    if (isHls && Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;
      hls.attachMedia(video);
      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        hls.loadSource(src);
      });
    } else if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari 原生 HLS
      video.src = src;
    } else if (isMp4 || !isHls) {
      // mp4 / webm 等原生支持的格式，直接设置 src
      video.src = src;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      controls
      playsInline
      preload="metadata"
      poster={poster}
      className={className}
    />
  );
}

/** 判断 URL 是否为视频文件 */
export function isVideoUrl(url: string): boolean {
  return VIDEO_EXTS.test(url) || HLS_EXTS.test(url);
}
