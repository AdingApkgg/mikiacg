"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import Hls from "hls.js";

interface VideoPlayerProps {
  url: string;
  poster?: string | null;
  onProgress?: (progress: { played: number; playedSeconds: number }) => void;
  onEnded?: () => void;
  initialProgress?: number;
  autoStart?: boolean;
}

export interface VideoPlayerRef {
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
}

export const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(
  function VideoPlayer(
    { url, poster, onProgress, onEnded, initialProgress = 0, autoStart = true },
    ref
  ) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [playedSeconds, setPlayedSeconds] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isReady, setIsReady] = useState(false);

    const getVideoElement = useCallback(() => videoRef.current, []);

    useImperativeHandle(
      ref,
      () => ({
        seekTo: (seconds: number) => {
          const video = getVideoElement();
          if (video) {
            video.currentTime = seconds;
          }
        },
        getCurrentTime: () => playedSeconds,
        getDuration: () => duration,
      }),
      [playedSeconds, duration, getVideoElement]
    );

    useEffect(() => {
      const video = getVideoElement();
      if (!video) return;

      let hls: Hls | null = null;
      const canPlayNativeHls = video.canPlayType("application/vnd.apple.mpegurl");
      const isHlsSource = /\.m3u8(\?|#|$)/i.test(url);

      if (isHlsSource && Hls.isSupported() && !canPlayNativeHls) {
        hls = new Hls();
        hls.attachMedia(video);
        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          hls?.loadSource(url);
        });
      } else {
        video.src = url;
      }

      return () => {
        // 重置 ready 状态，在 cleanup 中调用避免 lint 错误
        setIsReady(false);
        if (hls) {
          hls.destroy();
        }
        if (video.src) {
          video.removeAttribute("src");
          video.load();
        }
      };
    }, [url, getVideoElement]);

    useEffect(() => {
      const video = getVideoElement();
      if (!video) return;

      const handleTimeUpdate = () => {
        setPlayedSeconds(video.currentTime);
        if (video.duration && isFinite(video.duration)) {
          onProgress?.({
            played: video.currentTime / video.duration,
            playedSeconds: video.currentTime,
          });
        }
      };
      const handleDurationChange = () => {
        if (video.duration && isFinite(video.duration)) {
          setDuration(video.duration);
        }
      };
      const handleLoadedMetadata = () => {
        if (initialProgress > 0) {
          video.currentTime = initialProgress;
        }
        // 恢复保存的音量和播放速度
        try {
          const savedVolume = localStorage.getItem('video-player-volume');
          const savedPlaybackRate = localStorage.getItem('video-player-playback-rate');
          if (savedVolume !== null) {
            video.volume = parseFloat(savedVolume);
          }
          if (savedPlaybackRate !== null) {
            video.playbackRate = parseFloat(savedPlaybackRate);
          }
        } catch {
          // localStorage 不可用时忽略
        }
      };
      const handleCanPlay = () => {
        setIsReady(true);
      };
      const handleEnded = () => onEnded?.();
      
      // 保存音量和播放速度变化
      const handleVolumeChange = () => {
        try {
          localStorage.setItem('video-player-volume', video.volume.toString());
        } catch {
          // localStorage 不可用时忽略
        }
      };
      const handleRateChange = () => {
        try {
          localStorage.setItem('video-player-playback-rate', video.playbackRate.toString());
        } catch {
          // localStorage 不可用时忽略
        }
      };

      video.addEventListener("timeupdate", handleTimeUpdate);
      video.addEventListener("durationchange", handleDurationChange);
      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      video.addEventListener("canplay", handleCanPlay);
      video.addEventListener("ended", handleEnded);
      video.addEventListener("volumechange", handleVolumeChange);
      video.addEventListener("ratechange", handleRateChange);

      return () => {
        video.removeEventListener("timeupdate", handleTimeUpdate);
        video.removeEventListener("durationchange", handleDurationChange);
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
        video.removeEventListener("canplay", handleCanPlay);
        video.removeEventListener("ended", handleEnded);
        video.removeEventListener("volumechange", handleVolumeChange);
        video.removeEventListener("ratechange", handleRateChange);
      };
    }, [getVideoElement, initialProgress, onEnded, onProgress]);

    return (
      <div className="relative w-full aspect-video bg-black">
        <video
          ref={videoRef}
          className={`w-full h-full transition-opacity duration-300 ${isReady ? 'opacity-100' : 'opacity-0'}`}
          playsInline
          preload="metadata"
          poster={poster || undefined}
          controls
          autoPlay={autoStart}
        />
        {/* 封面图作为加载占位，视频就绪后隐藏 */}
        {poster && !isReady && (
          <div 
            className="absolute inset-0 bg-cover bg-center transition-opacity duration-300"
            style={{ backgroundImage: `url(${poster})` }}
          />
        )}
      </div>
    );
  }
);

