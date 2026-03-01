"use client";

import { useState } from "react";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSound } from "@/hooks/use-sound";
import { cn } from "@/lib/utils";
import { AlertCircle, FileVideo, FolderOpen, Gamepad2, Image as ImageIcon, Layers, Loader2, Upload } from "lucide-react";
import Link from "next/link";
import type { UploadContentType } from "./_lib/types";
import { VideoSingleUpload } from "./_components/video-single";
import { VideoQuickBatch } from "./_components/video-quick-batch";
import { VideoBatchUpload } from "./_components/video-batch";
import { GameSingleUpload } from "./_components/game-single";
import { GameQuickBatch } from "./_components/game-quick-batch";
import { GameBatchUpload } from "./_components/game-batch";
import { ImageSingleUpload } from "./_components/image-single";
import { ImageQuickBatch } from "./_components/image-quick-batch";
import { ImageBatchUpload } from "./_components/image-batch";

export default function UploadPage() {
  const { data: session, status } = useSession();
  const { play } = useSound();
  const [contentType, setContentType] = useState<UploadContentType>("video");
  const [videoMode, setVideoMode] = useState<"single" | "quick-batch" | "json-import">("single");
  const [gameMode, setGameMode] = useState<"single" | "quick-batch" | "json-import">("single");
  const [imageMode, setImageMode] = useState<"single" | "quick-batch" | "json-import">("single");

  if (status === "loading") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="p-4 rounded-full bg-muted">
          <Upload className="h-12 w-12 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold">请先登录</h1>
        <p className="text-muted-foreground">登录后才能投稿</p>
        <Button asChild size="lg">
          <Link href="/login?callbackUrl=/upload">去登录</Link>
        </Button>
      </div>
    );
  }

  if (!session.user.canUpload) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="p-4 rounded-full bg-destructive/10">
          <AlertCircle className="h-12 w-12 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold">暂无投稿权限</h1>
        <p className="text-muted-foreground text-center max-w-md">
          您的账号暂未开通投稿功能，请联系管理员申请开通
        </p>
        <Button asChild variant="outline">
          <Link href="/">返回首页</Link>
        </Button>
      </div>
    );
  }

  const contentTypeOptions = [
    { id: "video" as const, label: "视频", icon: FileVideo, description: "上传视频作品" },
    { id: "game" as const, label: "游戏", icon: Gamepad2, description: "上传游戏资源" },
    { id: "image" as const, label: "图片", icon: ImageIcon, description: "上传图片作品" },
  ];

  return (
    <div className="container py-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Upload className="h-6 w-6" />
          上传
        </h1>
        <p className="text-muted-foreground mt-1">选择内容类型，填写信息后发布</p>
      </div>

      {/* 内容类型选择 */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {contentTypeOptions.map((opt) => {
          const Icon = opt.icon;
          const isActive = contentType === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setContentType(opt.id)}
              className={cn(
                "relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all",
                isActive
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-muted hover:border-muted-foreground/30 hover:bg-muted/50",
              )}
            >
              <Icon className="h-6 w-6" />
              <span className="font-medium text-sm">{opt.label}</span>
            </button>
          );
        })}
      </div>

      {/* ==================== 视频 ==================== */}
      {contentType === "video" && (
        <Tabs value={videoMode} onValueChange={(v) => { setVideoMode(v as typeof videoMode); play("navigate"); }} className="mb-6">
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="single" className="gap-2"><FileVideo className="h-4 w-4" />单个发布</TabsTrigger>
            <TabsTrigger value="quick-batch" className="gap-2"><Layers className="h-4 w-4" />快速批量</TabsTrigger>
            <TabsTrigger value="json-import" className="gap-2"><FolderOpen className="h-4 w-4" />JSON 导入</TabsTrigger>
          </TabsList>
          <TabsContent value="single" className="mt-6"><VideoSingleUpload /></TabsContent>
          <TabsContent value="quick-batch" className="mt-6"><VideoQuickBatch /></TabsContent>
          <TabsContent value="json-import" className="mt-6"><VideoBatchUpload /></TabsContent>
        </Tabs>
      )}

      {/* ==================== 游戏 ==================== */}
      {contentType === "game" && (
        <Tabs value={gameMode} onValueChange={(v) => { setGameMode(v as typeof gameMode); play("navigate"); }} className="mb-6">
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="single" className="gap-2"><Gamepad2 className="h-4 w-4" />单个发布</TabsTrigger>
            <TabsTrigger value="quick-batch" className="gap-2"><Layers className="h-4 w-4" />快速批量</TabsTrigger>
            <TabsTrigger value="json-import" className="gap-2"><FolderOpen className="h-4 w-4" />JSON 导入</TabsTrigger>
          </TabsList>
          <TabsContent value="single" className="mt-6"><GameSingleUpload /></TabsContent>
          <TabsContent value="quick-batch" className="mt-6"><GameQuickBatch /></TabsContent>
          <TabsContent value="json-import" className="mt-6"><GameBatchUpload /></TabsContent>
        </Tabs>
      )}

      {/* ==================== 图片 ==================== */}
      {contentType === "image" && (
        <Tabs value={imageMode} onValueChange={(v) => { setImageMode(v as typeof imageMode); play("navigate"); }} className="mb-6">
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="single" className="gap-2"><ImageIcon className="h-4 w-4" />单个发布</TabsTrigger>
            <TabsTrigger value="quick-batch" className="gap-2"><Layers className="h-4 w-4" />快速批量</TabsTrigger>
            <TabsTrigger value="json-import" className="gap-2"><FolderOpen className="h-4 w-4" />JSON 导入</TabsTrigger>
          </TabsList>
          <TabsContent value="single" className="mt-6"><ImageSingleUpload /></TabsContent>
          <TabsContent value="quick-batch" className="mt-6"><ImageQuickBatch /></TabsContent>
          <TabsContent value="json-import" className="mt-6"><ImageBatchUpload /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}
