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
      };
      const handleEnded = () => onEnded?.();

      video.addEventListener("timeupdate", handleTimeUpdate);
      video.addEventListener("durationchange", handleDurationChange);
      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      video.addEventListener("ended", handleEnded);

      return () => {
        video.removeEventListener("timeupdate", handleTimeUpdate);
        video.removeEventListener("durationchange", handleDurationChange);
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
        video.removeEventListener("ended", handleEnded);
      };
    }, [getVideoElement, initialProgress, onEnded, onProgress]);

    return (
      <div className="relative w-full aspect-video bg-black">
        <video
          ref={videoRef}
          className="w-full h-full"
          playsInline
          preload="metadata"
          poster={poster || undefined}
          controls
          autoPlay={autoStart}
        />
      </div>
    );
  }
);

