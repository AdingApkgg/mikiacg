"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/stores/app";
import { Play, Gamepad2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export default function LandingClient() {
  const router = useRouter();
  const contentMode = useUIStore((s) => s.contentMode);
  const isContentModeChosen = useUIStore((s) => s.isContentModeChosen);
  const chooseContentMode = useUIStore((s) => s.chooseContentMode);

  // 处理 zustand hydration：SSR 时 store 尚未从 localStorage 恢复
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // 已选择过的用户：直接跳转
  useEffect(() => {
    if (!mounted) return;
    if (isContentModeChosen) {
      const target = contentMode === "game" ? "/game" : "/video";
      router.replace(target);
    }
  }, [mounted, isContentModeChosen, contentMode, router]);

  // 未挂载或正在跳转时显示加载状态
  if (!mounted || isContentModeChosen) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // 首次访问：展示选择界面
  const handleChoose = (mode: "video" | "game") => {
    chooseContentMode(mode);
    router.replace(mode === "game" ? "/game" : "/video");
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center px-4">
      <div className="w-full max-w-2xl space-y-8 text-center">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            你想看什么？
          </h1>
          <p className="text-muted-foreground">
            选择后我们会记住你的偏好，下次访问自动跳转
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* 视频卡片 */}
          <button
            onClick={() => handleChoose("video")}
            className={cn(
              "group relative flex flex-col items-center gap-4 rounded-2xl border-2 border-transparent p-8",
              "bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-transparent",
              "hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10",
              "transition-all duration-300 hover:-translate-y-1",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            )}
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-500 transition-transform group-hover:scale-110">
              <Play className="h-10 w-10" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">看视频</h2>
              <p className="text-sm text-muted-foreground">
                浏览最新 ACGN 视频内容
              </p>
            </div>
          </button>

          {/* 游戏卡片 */}
          <button
            onClick={() => handleChoose("game")}
            className={cn(
              "group relative flex flex-col items-center gap-4 rounded-2xl border-2 border-transparent p-8",
              "bg-gradient-to-br from-green-500/10 via-emerald-500/5 to-transparent",
              "hover:border-green-500/50 hover:shadow-lg hover:shadow-green-500/10",
              "transition-all duration-300 hover:-translate-y-1",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
            )}
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-green-500/15 text-green-500 transition-transform group-hover:scale-110">
              <Gamepad2 className="h-10 w-10" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">找游戏</h2>
              <p className="text-sm text-muted-foreground">
                探索热门游戏资源下载
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
