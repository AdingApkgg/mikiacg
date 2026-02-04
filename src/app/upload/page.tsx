"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormLabel } from "@/components/ui/form";
import { toast } from "sonner";
import { Loader2, Upload, Layers, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { VideoFormFields } from "@/components/video/video-form-fields";
import { TagSelector } from "@/components/video/tag-selector";

const uploadSchema = z.object({
  title: z.string().min(1, "请输入标题").max(100, "标题最多100个字符"),
  description: z.string().max(5000, "简介最多5000个字符").optional().or(z.literal("")),
  coverUrl: z.string().url("请输入有效的封面URL").optional().or(z.literal("")),
  videoUrl: z.string().url("请输入有效的视频URL"),
});

type UploadForm = z.infer<typeof uploadSchema>;

export default function UploadPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTags, setNewTags] = useState<string[]>([]);
  
  // 合集相关状态
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [episodeNum, setEpisodeNum] = useState<number>(1);
  const [showCreateSeries, setShowCreateSeries] = useState(false);
  const [newSeriesTitle, setNewSeriesTitle] = useState("");

  const { data: allTags } = trpc.tag.list.useQuery({ limit: 100 });
  
  // 获取用户的合集列表
  const { data: userSeries, refetch: refetchSeries } = trpc.series.listByUser.useQuery(
    { limit: 50 },
    { enabled: !!session }
  );
  
  // 创建合集
  const createSeriesMutation = trpc.series.create.useMutation({
    onSuccess: (newSeries) => {
      setSelectedSeriesId(newSeries.id);
      setShowCreateSeries(false);
      setNewSeriesTitle("");
      refetchSeries();
      toast.success("合集创建成功");
    },
    onError: (error) => {
      toast.error("创建合集失败", { description: error.message });
    },
  });
  
  // 添加视频到合集
  const addToSeriesMutation = trpc.series.addVideo.useMutation();
  
  const createMutation = trpc.video.create.useMutation({
    onError: (error) => {
      toast.error("发布失败", { description: error.message });
    },
  });

  const form = useForm<UploadForm>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      title: "",
      description: "",
      coverUrl: "",
      videoUrl: "",
    },
  });

  async function onSubmit(data: UploadForm) {
    setIsLoading(true);
    try {
      const result = await createMutation.mutateAsync({
        title: data.title,
        description: data.description,
        coverUrl: data.coverUrl || "",
        videoUrl: data.videoUrl,
        tagIds: selectedTags,
        tagNames: newTags,
      });
      
      // 如果选择了合集，添加视频到合集
      if (selectedSeriesId) {
        try {
          await addToSeriesMutation.mutateAsync({
            seriesId: selectedSeriesId,
            videoId: result.id,
            episodeNum,
          });
        } catch (error) {
          console.error("添加到合集失败:", error);
          // 不阻塞发布流程
        }
      }
      
      toast.success("发布成功");
      router.push(`/video/${result.id}`);
    } catch {
      // onError 回调已处理错误提示
    } finally {
      setIsLoading(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="container py-12 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="container py-12 text-center">
        <h1 className="text-2xl font-bold">请先登录</h1>
        <p className="text-muted-foreground mt-2">登录后才能发布视频</p>
        <Button asChild className="mt-4">
          <Link href="/login?callbackUrl=/upload">去登录</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container py-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            发布视频
          </CardTitle>
          <CardDescription>
            填写视频信息，提供视频直链即可发布
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* 使用共享的表单字段组件 */}
              <VideoFormFields form={form} />

              {/* 标签选择 */}
              <div className="space-y-2">
                <FormLabel>标签</FormLabel>
                <TagSelector
                  allTags={allTags}
                  selectedTags={selectedTags.map((id) => {
                    const tag = allTags?.find((t) => t.id === id);
                    return tag ? { id: tag.id, name: tag.name } : null;
                  }).filter((t): t is { id: string; name: string } => t !== null)}
                  newTags={newTags}
                  onSelectedTagsChange={(tags) => setSelectedTags(tags.map((t) => t.id))}
                  onNewTagsChange={setNewTags}
                />
              </div>

              {/* 合集选择 */}
              <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center justify-between">
                  <FormLabel className="flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    添加到合集（可选）
                  </FormLabel>
                  {selectedSeriesId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedSeriesId(null);
                        setEpisodeNum(1);
                      }}
                    >
                      取消
                    </Button>
                  )}
                </div>
                
                {!showCreateSeries ? (
                  <div className="space-y-3">
                    {/* 选择现有合集 */}
                    <Select
                      value={selectedSeriesId || ""}
                      onValueChange={(value) => {
                        setSelectedSeriesId(value || null);
                        // 自动设置集数
                        const series = userSeries?.items.find(s => s.id === value);
                        if (series) {
                          setEpisodeNum(series.episodeCount + 1);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择合集..." />
                      </SelectTrigger>
                      <SelectContent>
                        {userSeries?.items.map((series) => (
                          <SelectItem key={series.id} value={series.id}>
                            <div className="flex items-center gap-2">
                              <span>{series.title}</span>
                              <span className="text-xs text-muted-foreground">
                                ({series.episodeCount}集)
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                        {(!userSeries?.items || userSeries.items.length === 0) && (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            暂无合集
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                    
                    {/* 集数设置 */}
                    {selectedSeriesId && (
                      <div className="flex items-center gap-2">
                        <FormLabel className="shrink-0">第</FormLabel>
                        <Input
                          type="number"
                          min={1}
                          value={episodeNum}
                          onChange={(e) => setEpisodeNum(parseInt(e.target.value) || 1)}
                          className="w-20"
                        />
                        <FormLabel className="shrink-0">集</FormLabel>
                      </div>
                    )}
                    
                    {/* 创建新合集按钮 */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCreateSeries(true)}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      创建新合集
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* 创建新合集表单 */}
                    <Input
                      placeholder="合集名称"
                      value={newSeriesTitle}
                      onChange={(e) => setNewSeriesTitle(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowCreateSeries(false);
                          setNewSeriesTitle("");
                        }}
                      >
                        取消
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!newSeriesTitle.trim() || createSeriesMutation.isPending}
                        onClick={() => {
                          if (newSeriesTitle.trim()) {
                            createSeriesMutation.mutate({ title: newSeriesTitle.trim() });
                          }
                        }}
                      >
                        {createSeriesMutation.isPending && (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        )}
                        创建
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                发布视频
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
