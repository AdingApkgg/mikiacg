"use client";

import { Component, useEffect, useRef, useState, useSyncExternalStore, lazy, Suspense, type ReactNode, type ErrorInfo } from "react";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/stores/app";
import { Play, Gamepad2, ImageIcon, Loader2, Sparkles, Zap, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSound } from "@/hooks/use-sound";

const LandingScene = lazy(() => import("@/components/effects/landing-scene"));

class SceneErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[LandingScene] 3D scene failed to render:", error, info);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export default function LandingClient() {
  const router = useRouter();
  const contentMode = useUIStore((s) => s.contentMode);
  const isContentModeChosen = useUIStore((s) => s.isContentModeChosen);
  const chooseContentMode = useUIStore((s) => s.chooseContentMode);
  const { play } = useSound();

  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const [hoveredMode, setHoveredMode] = useState<"video" | "image" | "game" | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!mounted) return;
    if (isContentModeChosen) {
      const target = contentMode === "game" ? "/game" : contentMode === "image" ? "/image" : "/video";
      router.replace(target);
    }
  }, [mounted, isContentModeChosen, contentMode, router]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", handler, { passive: true });
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  if (!mounted || isContentModeChosen) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleChoose = (mode: "video" | "image" | "game") => {
    play("navigate");
    chooseContentMode(mode);
    router.replace(mode === "game" ? "/game" : mode === "image" ? "/image" : "/video");
  };

  return (
    <div className="relative flex h-[calc(100vh-3.5rem)] items-center justify-center px-4 overflow-hidden">
      {/* 3D floating geometry scene */}
      <SceneErrorBoundary>
        <Suspense fallback={null}>
          <LandingScene hoveredMode={hoveredMode} mouse={mouseRef} />
        </Suspense>
      </SceneErrorBoundary>

      {/* Glass cards */}
      <div className="relative z-10 w-full max-w-4xl space-y-8 text-center">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            <span className="text-gradient-acgn">你想看什么？</span>
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            选择后我们会记住你的偏好，下次访问自动跳转
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {/* Video card */}
          <button
            onClick={() => handleChoose("video")}
            onMouseEnter={() => setHoveredMode("video")}
            onMouseLeave={() => setHoveredMode(null)}
            className={cn(
              "group relative flex flex-col items-center gap-5 rounded-2xl p-8 sm:p-10",
              "glass-card",
              "border border-purple-500/20 dark:border-purple-400/15",
              "hover:border-purple-500/50 dark:hover:border-purple-400/40",
              "hover:shadow-[0_0_40px_-8px] hover:shadow-purple-500/25",
              "transition-[transform,border-color,box-shadow] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
              "hover:-translate-y-2 hover:scale-[1.02]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
            )}
          >
            <div className={cn(
              "relative flex h-20 w-20 items-center justify-center rounded-2xl",
              "bg-gradient-to-br from-blue-500/20 via-purple-500/15 to-violet-500/20",
              "text-purple-500 dark:text-purple-400",
              "transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110",
              "group-hover:shadow-[0_0_30px_-5px] group-hover:shadow-purple-500/30"
            )}>
              <Play className="h-10 w-10 transition-transform duration-300 ease-out group-hover:scale-110" />
              <Sparkles className="absolute -top-2 -right-2 h-4 w-4 text-purple-400 opacity-0 transition-[opacity,transform] duration-300 ease-out group-hover:opacity-100 group-hover:-translate-y-1" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold transition-colors group-hover:text-purple-500 dark:group-hover:text-purple-400">
                看视频
              </h2>
              <p className="text-sm text-muted-foreground">
                浏览最新 ACGN 视频内容
              </p>
            </div>
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-purple-500/5 via-transparent to-blue-500/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          </button>

          {/* Image card */}
          <button
            onClick={() => handleChoose("image")}
            onMouseEnter={() => setHoveredMode("image")}
            onMouseLeave={() => setHoveredMode(null)}
            className={cn(
              "group relative flex flex-col items-center gap-5 rounded-2xl p-8 sm:p-10",
              "glass-card",
              "border border-pink-500/20 dark:border-pink-400/15",
              "hover:border-pink-500/50 dark:hover:border-pink-400/40",
              "hover:shadow-[0_0_40px_-8px] hover:shadow-pink-500/25",
              "transition-[transform,border-color,box-shadow] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
              "hover:-translate-y-2 hover:scale-[1.02]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
            )}
          >
            <div className={cn(
              "relative flex h-20 w-20 items-center justify-center rounded-2xl",
              "bg-gradient-to-br from-rose-500/20 via-pink-500/15 to-fuchsia-500/20",
              "text-pink-500 dark:text-pink-400",
              "transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110",
              "group-hover:shadow-[0_0_30px_-5px] group-hover:shadow-pink-500/30"
            )}>
              <ImageIcon className="h-10 w-10 transition-transform duration-300 ease-out group-hover:scale-110" />
              <Palette className="absolute -top-2 -right-2 h-4 w-4 text-pink-400 opacity-0 transition-[opacity,transform] duration-300 ease-out group-hover:opacity-100 group-hover:-translate-y-1" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold transition-colors group-hover:text-pink-500 dark:group-hover:text-pink-400">
                看图片
              </h2>
              <p className="text-sm text-muted-foreground">
                鉴赏精选插画与同人图
              </p>
            </div>
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-pink-500/5 via-transparent to-rose-500/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          </button>

          {/* Game card */}
          <button
            onClick={() => handleChoose("game")}
            onMouseEnter={() => setHoveredMode("game")}
            onMouseLeave={() => setHoveredMode(null)}
            className={cn(
              "group relative flex flex-col items-center gap-5 rounded-2xl p-8 sm:p-10",
              "glass-card",
              "border border-emerald-500/20 dark:border-emerald-400/15",
              "hover:border-emerald-500/50 dark:hover:border-emerald-400/40",
              "hover:shadow-[0_0_40px_-8px] hover:shadow-emerald-500/25",
              "transition-[transform,border-color,box-shadow] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
              "hover:-translate-y-2 hover:scale-[1.02]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            )}
          >
            <div className={cn(
              "relative flex h-20 w-20 items-center justify-center rounded-2xl",
              "bg-gradient-to-br from-green-500/20 via-emerald-500/15 to-teal-500/20",
              "text-emerald-500 dark:text-emerald-400",
              "transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110",
              "group-hover:shadow-[0_0_30px_-5px] group-hover:shadow-emerald-500/30"
            )}>
              <Gamepad2 className="h-10 w-10 transition-transform duration-300 ease-out group-hover:scale-110" />
              <Zap className="absolute -top-2 -right-2 h-4 w-4 text-emerald-400 opacity-0 transition-[opacity,transform] duration-300 ease-out group-hover:opacity-100 group-hover:-translate-y-1" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold transition-colors group-hover:text-emerald-500 dark:group-hover:text-emerald-400">
                找游戏
              </h2>
              <p className="text-sm text-muted-foreground">
                探索热门游戏资源下载
              </p>
            </div>
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/5 via-transparent to-green-500/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          </button>
        </div>
      </div>
    </div>
  );
}
