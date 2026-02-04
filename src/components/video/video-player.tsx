"use client";

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import Image from "next/image";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Play,
  Pause,
  AlertCircle,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  AudioLines,
  Layers,
  SkipBack,
  SkipForward,
  PictureInPicture2,
  Loader2,
  Lock,
  Unlock,
  RotateCcw,
  RotateCw,
  ChevronRight,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsMounted } from "@/components/motion";
import dynamic from "next/dynamic";

// 动态导入 ReactPlayer 避免 SSR 问题
const ReactPlayer = dynamic(() => import("react-player"), { ssr: false });

// 画质等级
interface QualityLevel {
  url: string;
  label: string;
  default?: boolean;
}

// 音轨
interface AudioTrack {
  id: number;
  label: string;
  language: string;
  enabled: boolean;
}

interface VideoPlayerProps {
  url: string;
  qualities?: QualityLevel[];
  poster?: string | null;
  onProgress?: (progress: { played: number; playedSeconds: number }) => void;
  onEnded?: () => void;
  initialProgress?: number;
  autoStart?: boolean;
}

// 格式化时间
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export interface VideoPlayerRef {
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
}

// 移动端检测 Hook
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        window.matchMedia("(max-width: 768px)").matches ||
        ("ontouchstart" in window && navigator.maxTouchPoints > 0)
      );
    };
    
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  
  return isMobile;
}

export const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(
  function VideoPlayer(
    {
      url,
      qualities = [],
      poster,
      onProgress,
      onEnded,
      initialProgress = 0,
      autoStart = true,
    },
    ref
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playerRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    // 触摸操作相关
    const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
    const touchMoveRef = useRef<{ x: number; y: number } | null>(null);
    const lastTapRef = useRef<{ time: number; x: number } | null>(null);
    const gestureActiveRef = useRef<"none" | "progress" | "volume" | "brightness">("none");
    const gestureStartValueRef = useRef<number>(0);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isLongPressingRef = useRef(false);
    const previousPlaybackRateRef = useRef<number>(1);
    
    // 手势提示状态
    const [gestureHint, setGestureHint] = useState<{ type: string; value: string; icon?: string } | null>(null);
    const gestureHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 移动端检测
    const isMobile = useIsMobile();

    // 客户端挂载状态
    const isMounted = useIsMounted();

    // 播放器状态
    const [isReady, setIsReady] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [showPlayer, setShowPlayer] = useState(autoStart || !poster);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(0.7);
    const [played, setPlayed] = useState(0);
    const [playedSeconds, setPlayedSeconds] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [isBuffering, setIsBuffering] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [isLocked, setIsLocked] = useState(false);
    const [showMobileMenu, setShowMobileMenu] = useState(false);

    // 多媒体轨道状态
    const [currentQuality, setCurrentQuality] = useState<QualityLevel | null>(
      qualities.find((q) => q.default) || qualities[0] || null
    );
    const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
    const [currentAudioTrack, setCurrentAudioTrack] = useState<AudioTrack | null>(null);

    // 当前播放 URL
    const currentUrl = useMemo(() => {
      if (currentQuality) {
        return currentQuality.url;
      }
      return url;
    }, [currentQuality, url]);

    // URL 变化时重置状态
    useEffect(() => {
      setIsReady(false);
      setHasError(false);
      setPlayed(0);
      setPlayedSeconds(0);
      setDuration(0);
    }, [url]);

    // 获取内部视频元素
    const getVideoElement = useCallback(() => {
      return containerRef.current?.querySelector("video") as HTMLVideoElement | null;
    }, []);

    // 暴露方法给父组件
    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        const video = getVideoElement();
        if (video) {
          video.currentTime = seconds;
        }
      },
      getCurrentTime: () => playedSeconds,
      getDuration: () => duration,
    }), [playedSeconds, duration, getVideoElement]);

    // 控制条自动隐藏
    const resetControlsTimeout = useCallback(() => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      setShowControls(true);
      if (isPlaying && !showMobileMenu) {
        controlsTimeoutRef.current = setTimeout(() => {
          setShowControls(false);
        }, 3000);
      }
    }, [isPlaying, showMobileMenu]);

    useEffect(() => {
      resetControlsTimeout();
      return () => {
        if (controlsTimeoutRef.current) {
          clearTimeout(controlsTimeoutRef.current);
        }
      };
    }, [isPlaying, resetControlsTimeout]);

    // 全屏变化监听
    useEffect(() => {
      const handleFullscreenChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
      };
      document.addEventListener("fullscreenchange", handleFullscreenChange);
      return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
    }, []);

    // 键盘快捷键
    useEffect(() => {
      if (!showPlayer) return;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

        const video = getVideoElement();
        if (!video) return;

        switch (e.key.toLowerCase()) {
          case " ":
          case "k":
            e.preventDefault();
            setIsPlaying((p) => !p);
            break;
          case "m":
            e.preventDefault();
            setIsMuted((m) => !m);
            break;
          case "f":
            e.preventDefault();
            toggleFullscreen();
            break;
          case "arrowleft":
            e.preventDefault();
            video.currentTime = Math.max(0, video.currentTime - 5);
            break;
          case "arrowright":
            e.preventDefault();
            video.currentTime = Math.min(duration, video.currentTime + 5);
            break;
          case "arrowup":
            e.preventDefault();
            setVolume((v) => Math.min(1, v + 0.1));
            break;
          case "arrowdown":
            e.preventDefault();
            setVolume((v) => Math.max(0, v - 0.1));
            break;
          case "j":
            e.preventDefault();
            video.currentTime = Math.max(0, video.currentTime - 10);
            break;
          case "l":
            e.preventDefault();
            video.currentTime = Math.min(duration, video.currentTime + 10);
            break;
          case "0":
          case "1":
          case "2":
          case "3":
          case "4":
          case "5":
          case "6":
          case "7":
          case "8":
          case "9":
            e.preventDefault();
            video.currentTime = (parseInt(e.key) / 10) * duration;
            break;
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [showPlayer, duration, getVideoElement]);

    // 全屏切换
    const toggleFullscreen = useCallback(() => {
      if (!containerRef.current) return;
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        containerRef.current.requestFullscreen();
      }
    }, []);

    // 画中画
    const togglePiP = useCallback(async () => {
      const video = getVideoElement();
      if (!video) return;

      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await video.requestPictureInPicture();
        }
      } catch (error) {
        console.error("PiP error:", error);
      }
    }, [getVideoElement]);

    // 进度条拖动
    const handleSeek = useCallback(
      (value: number[]) => {
        const video = getVideoElement();
        if (video && duration > 0) {
          video.currentTime = value[0] * duration;
          setPlayed(value[0]);
        }
      },
      [duration, getVideoElement]
    );

    // 播放速度
    const handlePlaybackRateChange = useCallback((rate: number) => {
      setPlaybackRate(rate);
      const video = getVideoElement();
      if (video) {
        video.playbackRate = rate;
      }
    }, [getVideoElement]);

    // 音轨处理
    useEffect(() => {
      const video = getVideoElement();
      if (!video) return;

      const handleLoadedMetadata = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const audioTrackList = (video as any).audioTracks as AudioTrackList | undefined;
        if (audioTrackList && audioTrackList.length > 1) {
          const tracks: AudioTrack[] = [];
          for (let i = 0; i < audioTrackList.length; i++) {
            const track = audioTrackList[i];
            tracks.push({
              id: i,
              label: track.label || `音轨 ${i + 1}`,
              language: track.language || "",
              enabled: track.enabled,
            });
            if (track.enabled) {
              setCurrentAudioTrack({
                id: i,
                label: track.label || `音轨 ${i + 1}`,
                language: track.language || "",
                enabled: true,
              });
            }
          }
          setAudioTracks(tracks);
        }
      };

      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      return () => video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    }, [isReady, getVideoElement]);

    // 切换音轨
    const handleAudioTrackChange = useCallback(
      (trackId: number) => {
        const video = getVideoElement();
        if (!video) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const audioTrackList = (video as any).audioTracks as AudioTrackList | undefined;
        if (audioTrackList) {
          for (let i = 0; i < audioTrackList.length; i++) {
            audioTrackList[i].enabled = i === trackId;
          }
          const track = audioTracks.find((t) => t.id === trackId);
          if (track) {
            setCurrentAudioTrack({ ...track, enabled: true });
          }
        }
      },
      [audioTracks, getVideoElement]
    );

    // 显示手势提示
    const showGestureHint = useCallback((type: string, value: string, icon?: string) => {
      if (gestureHintTimeoutRef.current) {
        clearTimeout(gestureHintTimeoutRef.current);
      }
      setGestureHint({ type, value, icon });
      gestureHintTimeoutRef.current = setTimeout(() => {
        setGestureHint(null);
      }, 1000);
    }, []);

    // 触摸事件处理
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
      if (isLocked) return;
      
      const touch = e.touches[0];
      const now = Date.now();
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: now };
      touchMoveRef.current = null;
      gestureActiveRef.current = "none";
      
      // 长按检测（2倍速）
      longPressTimerRef.current = setTimeout(() => {
        if (!touchMoveRef.current) {
          isLongPressingRef.current = true;
          previousPlaybackRateRef.current = playbackRate;
          handlePlaybackRateChange(2);
          showGestureHint("倍速播放", "2x", "⏩");
        }
      }, 500);
      
      // 双击检测
      if (lastTapRef.current && now - lastTapRef.current.time < 300) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
        }
        
        const container = containerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          const tapX = touch.clientX - rect.left;
          const width = rect.width;
          const video = getVideoElement();
          
          if (video) {
            if (tapX < width / 3) {
              video.currentTime = Math.max(0, video.currentTime - 10);
              showGestureHint("快退", "-10s", "⏪");
            } else if (tapX > (width * 2) / 3) {
              video.currentTime = Math.min(duration, video.currentTime + 10);
              showGestureHint("快进", "+10s", "⏩");
            } else {
              setIsPlaying((p) => !p);
              showGestureHint(isPlaying ? "暂停" : "播放", "", isPlaying ? "⏸" : "▶️");
            }
          }
        }
        lastTapRef.current = null;
      } else {
        lastTapRef.current = { time: now, x: touch.clientX };
      }
    }, [isLocked, playbackRate, duration, isPlaying, getVideoElement, handlePlaybackRateChange, showGestureHint]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
      if (isLocked || !touchStartRef.current) return;
      
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;
      
      touchMoveRef.current = { x: touch.clientX, y: touch.clientY };
      
      // 取消长按
      if (longPressTimerRef.current && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      
      const container = containerRef.current;
      if (!container) return;
      
      const rect = container.getBoundingClientRect();
      const video = getVideoElement();
      
      // 确定手势类型
      if (gestureActiveRef.current === "none" && (Math.abs(dx) > 20 || Math.abs(dy) > 20)) {
        if (Math.abs(dx) > Math.abs(dy)) {
          gestureActiveRef.current = "progress";
          if (video) gestureStartValueRef.current = video.currentTime;
        } else {
          const startX = touchStartRef.current.x - rect.left;
          if (startX > rect.width / 2) {
            gestureActiveRef.current = "volume";
            gestureStartValueRef.current = volume;
          } else {
            gestureActiveRef.current = "brightness";
            gestureStartValueRef.current = 1;
          }
        }
      }
      
      // 执行手势操作
      if (gestureActiveRef.current === "progress" && video) {
        const seekAmount = (dx / rect.width) * duration * 0.5;
        const newTime = Math.max(0, Math.min(duration, gestureStartValueRef.current + seekAmount));
        video.currentTime = newTime;
        const diff = newTime - gestureStartValueRef.current;
        showGestureHint("进度", `${diff >= 0 ? "+" : ""}${Math.round(diff)}s`, diff >= 0 ? "⏩" : "⏪");
      } else if (gestureActiveRef.current === "volume") {
        const volumeChange = -dy / rect.height;
        const newVolume = Math.max(0, Math.min(1, gestureStartValueRef.current + volumeChange));
        setVolume(newVolume);
        showGestureHint("音量", `${Math.round(newVolume * 100)}%`, "🔊");
      } else if (gestureActiveRef.current === "brightness") {
        const brightnessChange = -dy / rect.height;
        const newBrightness = Math.max(0.2, Math.min(1.5, gestureStartValueRef.current + brightnessChange));
        if (video) video.style.filter = `brightness(${newBrightness})`;
        showGestureHint("亮度", `${Math.round(newBrightness * 100)}%`, "☀️");
      }
    }, [isLocked, duration, volume, getVideoElement, showGestureHint]);

    const handleTouchEnd = useCallback(() => {
      // 恢复长按倍速
      if (isLongPressingRef.current) {
        handlePlaybackRateChange(previousPlaybackRateRef.current);
        isLongPressingRef.current = false;
        showGestureHint("恢复速度", `${previousPlaybackRateRef.current}x`, "▶️");
      }
      
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      
      // 单击显示/隐藏控制条
      if (!touchMoveRef.current && gestureActiveRef.current === "none") {
        setShowControls((s) => !s);
      }
      
      touchStartRef.current = null;
      touchMoveRef.current = null;
      gestureActiveRef.current = "none";
    }, [handlePlaybackRateChange, showGestureHint]);

    // 初始进度
    useEffect(() => {
      if (isReady && initialProgress > 0) {
        const video = getVideoElement();
        if (video) {
          video.currentTime = initialProgress;
        }
      }
    }, [isReady, initialProgress, getVideoElement]);

    // 加载 skeleton
    if (!isMounted) {
      return <Skeleton className="w-full aspect-video" />;
    }

    // 封面状态
    if (!showPlayer && poster) {
      return (
        <div
          className="relative w-full aspect-video bg-black cursor-pointer group"
          onClick={() => {
            setShowPlayer(true);
            setIsPlaying(true);
          }}
        >
          <Image
            src={poster}
            alt="Video poster"
            fill
            className="object-contain"
            priority
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
            <div className="w-16 h-16 rounded-full bg-primary/90 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Play className="h-8 w-8 text-white ml-1" fill="white" />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        className={cn(
          "relative w-full aspect-video bg-black group",
          isFullscreen && "fixed inset-0 z-50 aspect-auto"
        )}
        onMouseMove={resetControlsTimeout}
        onMouseLeave={() => isPlaying && setShowControls(false)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* 播放器 */}
        {/* @ts-expect-error - dynamic import loses type info */}
        <ReactPlayer
          ref={playerRef}
          url={currentUrl}
          width="100%"
          height="100%"
          playing={isPlaying}
          volume={volume}
          muted={isMuted}
          playbackRate={playbackRate}
          onReady={() => setIsReady(true)}
          onError={() => setHasError(true)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onBuffer={() => setIsBuffering(true)}
          onBufferEnd={() => setIsBuffering(false)}
          onProgress={(state: { played: number; playedSeconds: number; loaded: number; loadedSeconds: number }) => {
            setPlayed(state.played);
            setPlayedSeconds(state.playedSeconds);
            onProgress?.(state);
          }}
          onDuration={setDuration}
          onEnded={() => {
            setIsPlaying(false);
            onEnded?.();
          }}
          config={{
            file: {
              attributes: {
                crossOrigin: "anonymous",
              },
              forceHLS: false, // 自动检测 HLS
              forceVideo: true,
              hlsOptions: {
                enableWorker: true,
                lowLatencyMode: false,
                backBufferLength: 90,
                maxBufferLength: 30,
                maxMaxBufferLength: 600,
                maxBufferSize: 60 * 1000 * 1000, // 60MB
                maxBufferHole: 0.5,
                startLevel: -1, // 自动选择起始画质
                abrEwmaDefaultEstimate: 500000, // 默认带宽估计
                abrBandWidthFactor: 0.95,
                abrBandWidthUpFactor: 0.7,
              },
            },
          }}
        />

        {/* 加载中 */}
        {isBuffering && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <Loader2 className="h-12 w-12 text-white animate-spin" />
          </div>
        )}

        {/* 错误状态 */}
        {hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white">
            <AlertCircle className="h-12 w-12 mb-4 text-destructive" />
            <p className="text-lg">视频加载失败</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setHasError(false);
                setIsReady(false);
              }}
            >
              重试
            </Button>
          </div>
        )}

        {/* 手势提示 */}
        {gestureHint && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/70 text-white px-6 py-4 rounded-lg text-center">
              {gestureHint.icon && <span className="text-3xl mb-2 block">{gestureHint.icon}</span>}
              <div className="text-lg font-medium">{gestureHint.type}</div>
              {gestureHint.value && <div className="text-2xl font-bold">{gestureHint.value}</div>}
            </div>
          </div>
        )}

        {/* 锁定时的解锁按钮 */}
        {isLocked && isFullscreen && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 z-50">
            <Button
              variant="ghost"
              size="icon"
              className="text-white/50 hover:text-white hover:bg-white/20"
              onClick={() => setIsLocked(false)}
            >
              <Lock className="h-6 w-6" />
            </Button>
          </div>
        )}

        {/* 控制层 */}
        {showControls && !isLocked && (
          <div
            className={cn(
              "absolute inset-0 flex flex-col justify-end transition-opacity duration-300",
              showControls ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
          >
            {/* 渐变背景 */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

            {/* 中央播放按钮 (移动端) */}
            {isMobile && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-8">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white/80 hover:text-white h-12 w-12"
                    onClick={() => {
                      const video = getVideoElement();
                      if (video) video.currentTime = Math.max(0, video.currentTime - 10);
                    }}
                  >
                    <RotateCcw className="h-8 w-8" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20 h-16 w-16 rounded-full bg-white/10"
                    onClick={() => setIsPlaying(!isPlaying)}
                  >
                    {isPlaying ? (
                      <Pause className="h-10 w-10" />
                    ) : (
                      <Play className="h-10 w-10 ml-1" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white/80 hover:text-white h-12 w-12"
                    onClick={() => {
                      const video = getVideoElement();
                      if (video) video.currentTime = Math.min(duration, video.currentTime + 10);
                    }}
                  >
                    <RotateCw className="h-8 w-8" />
                  </Button>
                </div>
              </div>
            )}

            {/* 底部控制条 */}
            <div className="relative z-10 p-2 md:p-4">
              {/* 进度条 */}
              <div className="mb-2 px-1">
                <Slider
                  value={[played]}
                  min={0}
                  max={1}
                  step={0.001}
                  onValueChange={handleSeek}
                  className="cursor-pointer"
                />
              </div>

              {/* 控制按钮 */}
              <div className="flex items-center justify-between">
                {/* 左侧 */}
                <div className="flex items-center gap-1 md:gap-2">
                  {/* 播放/暂停 (桌面端) */}
                  {!isMobile && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-white hover:bg-white/20"
                      onClick={() => setIsPlaying(!isPlaying)}
                    >
                      {isPlaying ? (
                        <Pause className="h-5 w-5" />
                      ) : (
                        <Play className="h-5 w-5" />
                      )}
                    </Button>
                  )}

                  {/* 快退快进 (桌面端) */}
                  {!isMobile && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-white hover:bg-white/20"
                        onClick={() => {
                          const video = getVideoElement();
                          if (video) video.currentTime = Math.max(0, video.currentTime - 10);
                        }}
                      >
                        <SkipBack className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-white hover:bg-white/20"
                        onClick={() => {
                          const video = getVideoElement();
                          if (video) video.currentTime = Math.min(duration, video.currentTime + 10);
                        }}
                      >
                        <SkipForward className="h-4 w-4" />
                      </Button>
                    </>
                  )}

                  {/* 音量 */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-white hover:bg-white/20"
                      onClick={() => setIsMuted(!isMuted)}
                    >
                      {isMuted || volume === 0 ? (
                        <VolumeX className="h-4 w-4" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                    </Button>
                    {!isMobile && (
                      <Slider
                        value={[isMuted ? 0 : volume]}
                        min={0}
                        max={1}
                        step={0.01}
                        onValueChange={(v) => {
                          setVolume(v[0]);
                          setIsMuted(v[0] === 0);
                        }}
                        className="w-20"
                      />
                    )}
                  </div>

                  {/* 时间 */}
                  <span className="text-white text-xs md:text-sm ml-2">
                    {formatTime(playedSeconds)} / {formatTime(duration)}
                  </span>
                </div>

                {/* 右侧 */}
                <div className="flex items-center gap-1">
                  {/* 锁定按钮 (移动端全屏) */}
                  {isMobile && isFullscreen && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-white hover:bg-white/20"
                      onClick={() => setIsLocked(true)}
                    >
                      <Unlock className="h-4 w-4" />
                    </Button>
                  )}

                  {/* 设置菜单 */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-white hover:bg-white/20"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {/* 播放速度 */}
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <ChevronRight className="h-4 w-4 mr-2" />
                          播放速度: {playbackRate}x
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                            <DropdownMenuCheckboxItem
                              key={rate}
                              checked={playbackRate === rate}
                              onCheckedChange={() => handlePlaybackRateChange(rate)}
                            >
                              {rate}x {rate === 1 && "(正常)"}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>

                      {/* 画质 */}
                      {qualities.length > 0 && (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <Layers className="h-4 w-4 mr-2" />
                            画质: {currentQuality?.label || "自动"}
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {qualities.map((q) => (
                              <DropdownMenuCheckboxItem
                                key={q.url}
                                checked={currentQuality?.url === q.url}
                                onCheckedChange={() => setCurrentQuality(q)}
                              >
                                {q.label}
                              </DropdownMenuCheckboxItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      )}

                      {/* 音轨 */}
                      {audioTracks.length > 1 && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <AudioLines className="h-4 w-4 mr-2" />
                              音轨: {currentAudioTrack?.label || "默认"}
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              {audioTracks.map((track) => (
                                <DropdownMenuCheckboxItem
                                  key={track.id}
                                  checked={currentAudioTrack?.id === track.id}
                                  onCheckedChange={() => handleAudioTrackChange(track.id)}
                                >
                                  {track.label}
                                  {track.language && ` (${track.language})`}
                                </DropdownMenuCheckboxItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* 画中画 */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20"
                    onClick={togglePiP}
                  >
                    <PictureInPicture2 className="h-4 w-4" />
                  </Button>

                  {/* 全屏 */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20"
                    onClick={toggleFullscreen}
                  >
                    {isFullscreen ? (
                      <Minimize className="h-4 w-4" />
                    ) : (
                      <Maximize className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

// AudioTrackList 类型
interface AudioTrackList {
  length: number;
  [index: number]: {
    enabled: boolean;
    label: string;
    language: string;
  };
}
