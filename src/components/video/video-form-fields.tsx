"use client";

import { useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { VideoPlayer } from "@/components/video/video-player";
import { Eye, EyeOff, Image as ImageIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoFormFieldsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
}

export function VideoFormFields({ form }: VideoFormFieldsProps) {
  const [showPreview, setShowPreview] = useState(false);

  const coverUrl = form.watch("coverUrl");
  const videoUrl = form.watch("videoUrl");

  return (
    <div className="space-y-6">
      {/* 基本信息 */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* 左列：标题和描述 */}
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>标题 *</FormLabel>
                <FormControl>
                  <Input placeholder="输入视频标题" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>简介</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="视频简介（可选）"
                    className="min-h-[120px] resize-none"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* 右列：封面预览 */}
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="coverUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>封面</FormLabel>
                <FormControl>
                  <Input placeholder="封面图片链接（可选）" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* 封面预览 */}
          <div
            className={cn(
              "relative aspect-video rounded-lg border-2 border-dashed overflow-hidden transition-colors group",
              coverUrl ? "border-transparent" : "border-muted-foreground/25"
            )}
          >
            {coverUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverUrl}
                  alt="封面预览"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
                {/* 清除按钮 */}
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    form.setValue("coverUrl", "");
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                <ImageIcon className="h-12 w-12 mb-2 opacity-50" />
                <span className="text-sm">输入封面链接预览</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 视频链接 */}
      <FormField
        control={form.control}
        name="videoUrl"
        render={({ field }) => (
          <FormItem>
            <FormLabel>视频链接 *</FormLabel>
            <div className="flex gap-2">
              <FormControl>
                <Input placeholder="https://example.com/video.mp4" {...field} />
              </FormControl>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowPreview(!showPreview)}
                disabled={!field.value}
                title={showPreview ? "隐藏预览" : "显示预览"}
              >
                {showPreview ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            <FormDescription>支持 MP4, WebM, HLS (m3u8) 格式</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* 视频预览 */}
      {showPreview && videoUrl && (
        <div className="space-y-2">
          <FormLabel>视频预览</FormLabel>
          <div className="rounded-lg overflow-hidden border">
            <VideoPlayer
              url={videoUrl}
              poster={coverUrl || undefined}
              autoStart={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}
