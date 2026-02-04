"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  Layers,
  Plus,
  X,
  Eye,
  EyeOff,
  Image as ImageIcon,
  FileVideo,
  Tag,
  Info,
  ChevronDown,
  Link2,
  Search,
  Download,
  User,
  ListVideo,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { VideoPlayer } from "@/components/video/video-player";
import { cn } from "@/lib/utils";
import type { VideoExtraInfo } from "@/lib/shortcode-parser";

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
  const [selectedTags, setSelectedTags] = useState<{ id: string; name: string }[]>([]);
  const [newTags, setNewTags] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [newTagInput, setNewTagInput] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  
  // 合集相关状态
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [episodeNum, setEpisodeNum] = useState<number>(1);
  const [showCreateSeries, setShowCreateSeries] = useState(false);
  const [newSeriesTitle, setNewSeriesTitle] = useState("");

  // 扩展信息
  const [extraInfo, setExtraInfo] = useState<VideoExtraInfo>({});
  const [showExtraInfo, setShowExtraInfo] = useState(false);

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

  const coverUrl = form.watch("coverUrl");
  const videoUrl = form.watch("videoUrl");

  // 过滤标签
  const filteredTags = allTags?.filter((tag) => {
    if (!tagSearch.trim()) return true;
    return tag.name.toLowerCase().includes(tagSearch.toLowerCase());
  }) || [];

  const toggleTag = (tag: { id: string; name: string }) => {
    const exists = selectedTags.find((t) => t.id === tag.id);
    if (exists) {
      setSelectedTags(selectedTags.filter((t) => t.id !== tag.id));
    } else if (selectedTags.length + newTags.length < 10) {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleAddNewTag = () => {
    const tag = newTagInput.trim();
    if (!tag || newTags.length + selectedTags.length >= 10) return;
    if (newTags.includes(tag)) return;
    if (selectedTags.some((t) => t.name.toLowerCase() === tag.toLowerCase())) return;
    
    const existingTag = allTags?.find((t) => t.name.toLowerCase() === tag.toLowerCase());
    if (existingTag) {
      toggleTag(existingTag);
    } else {
      setNewTags([...newTags, tag]);
    }
    setNewTagInput("");
  };

  // 检查 extraInfo 是否有内容
  const hasExtraInfo = () => {
    return (
      extraInfo.intro ||
      extraInfo.author ||
      extraInfo.authorIntro ||
      (extraInfo.keywords && extraInfo.keywords.length > 0) ||
      (extraInfo.downloads && extraInfo.downloads.length > 0) ||
      (extraInfo.episodes && extraInfo.episodes.length > 0) ||
      (extraInfo.relatedVideos && extraInfo.relatedVideos.length > 0) ||
      (extraInfo.notices && extraInfo.notices.length > 0)
    );
  };

  async function onSubmit(data: UploadForm) {
    setIsLoading(true);
    try {
      const result = await createMutation.mutateAsync({
        title: data.title,
        description: data.description,
        coverUrl: data.coverUrl || "",
        videoUrl: data.videoUrl,
        tagIds: selectedTags.map((t) => t.id),
        tagNames: newTags,
        ...(hasExtraInfo() ? { extraInfo } : {}),
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
        <p className="text-muted-foreground">登录后才能发布视频</p>
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

  return (
    <div className="container py-6 max-w-5xl">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Upload className="h-6 w-6" />
          发布视频
        </h1>
        <p className="text-muted-foreground mt-1">
          填写视频信息，支持多种格式和扩展内容
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 左侧：主要信息 */}
            <div className="lg:col-span-2 space-y-6">
              {/* 基本信息卡片 */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileVideo className="h-5 w-5" />
                    基本信息
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 标题 */}
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>标题 *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="输入视频标题" 
                            {...field}
                            className="text-base"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* 视频链接 */}
                  <FormField
                    control={form.control}
                    name="videoUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>视频链接 *</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <div className="relative flex-1">
                              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input 
                                placeholder="https://example.com/video.mp4" 
                                {...field}
                                className="pl-9"
                              />
                            </div>
                          </FormControl>
                          <Button
                            type="button"
                            variant={showPreview ? "default" : "outline"}
                            size="icon"
                            onClick={() => setShowPreview(!showPreview)}
                            disabled={!field.value}
                          >
                            {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                        <FormDescription>支持 MP4, WebM, HLS (m3u8) 格式</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* 视频预览 */}
                  {showPreview && videoUrl && (
                    <div className="rounded-lg overflow-hidden border bg-black">
                      <VideoPlayer
                        url={videoUrl}
                        poster={coverUrl || undefined}
                        autoStart={false}
                      />
                    </div>
                  )}

                  {/* 简介 */}
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>简介</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="视频简介（可选）"
                            className="min-h-[100px] resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* 标签选择卡片 */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Tag className="h-5 w-5" />
                    标签
                  </CardTitle>
                  <CardDescription>
                    选择或创建标签，最多 10 个
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 已选标签 */}
                  {(selectedTags.length > 0 || newTags.length > 0) && (
                    <div className="flex flex-wrap gap-2">
                      {selectedTags.map((tag) => (
                        <Badge
                          key={tag.id}
                          variant="default"
                          className="cursor-pointer hover:bg-primary/80 transition-colors gap-1 px-3 py-1"
                          onClick={() => toggleTag(tag)}
                        >
                          {tag.name}
                          <X className="h-3 w-3" />
                        </Badge>
                      ))}
                      {newTags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="cursor-pointer hover:bg-secondary/80 transition-colors gap-1 px-3 py-1"
                          onClick={() => setNewTags(newTags.filter((t) => t !== tag))}
                        >
                          <Plus className="h-3 w-3" />
                          {tag}
                          <X className="h-3 w-3" />
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* 添加新标签 */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="输入新标签名称..."
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddNewTag();
                          }
                        }}
                        disabled={selectedTags.length + newTags.length >= 10}
                        className="pl-9"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAddNewTag}
                      disabled={selectedTags.length + newTags.length >= 10 || !newTagInput.trim()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    已选择 {selectedTags.length + newTags.length} / 10 个标签
                  </p>

                  <Separator />

                  {/* 标签搜索和列表 */}
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="搜索已有标签..."
                        value={tagSearch}
                        onChange={(e) => setTagSearch(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>

                    <ScrollArea className="h-40 rounded-md border p-3 bg-muted/30">
                      <div className="flex flex-wrap gap-1.5">
                        {filteredTags.length > 0 ? (
                          filteredTags.map((tag) => {
                            const isSelected = selectedTags.some((t) => t.id === tag.id);
                            return (
                              <Badge
                                key={tag.id}
                                variant={isSelected ? "default" : "outline"}
                                className={cn(
                                  "cursor-pointer text-xs transition-all",
                                  isSelected
                                    ? "hover:bg-primary/80"
                                    : "hover:bg-accent hover:text-accent-foreground"
                                )}
                                onClick={() => toggleTag(tag)}
                              >
                                {tag.name}
                              </Badge>
                            );
                          })
                        ) : (
                          <p className="text-xs text-muted-foreground py-2">
                            {tagSearch ? "未找到匹配的标签" : "暂无标签"}
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </CardContent>
              </Card>

              {/* 扩展信息卡片 */}
              <Collapsible open={showExtraInfo} onOpenChange={setShowExtraInfo}>
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="pb-4 cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Info className="h-5 w-5" />
                          扩展信息
                          {hasExtraInfo() && (
                            <Badge variant="secondary" className="text-xs">已填写</Badge>
                          )}
                        </CardTitle>
                        <ChevronDown className={cn(
                          "h-5 w-5 transition-transform",
                          showExtraInfo && "rotate-180"
                        )} />
                      </div>
                      <CardDescription>
                        添加作品介绍、作者信息、下载链接等（可选）
                      </CardDescription>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent>
                      <Tabs defaultValue="intro" className="w-full">
                        <TabsList className="grid w-full grid-cols-4">
                          <TabsTrigger value="intro" className="text-xs">作品介绍</TabsTrigger>
                          <TabsTrigger value="author" className="text-xs">作者信息</TabsTrigger>
                          <TabsTrigger value="downloads" className="text-xs">下载链接</TabsTrigger>
                          <TabsTrigger value="related" className="text-xs">相关内容</TabsTrigger>
                        </TabsList>

                        <TabsContent value="intro" className="space-y-4 mt-4">
                          <div className="space-y-2">
                            <FormLabel>作品介绍</FormLabel>
                            <Textarea
                              placeholder="详细的作品介绍..."
                              value={extraInfo.intro || ""}
                              onChange={(e) => setExtraInfo({ ...extraInfo, intro: e.target.value })}
                              className="min-h-[100px]"
                            />
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <FormLabel>剧集介绍</FormLabel>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setExtraInfo({
                                  ...extraInfo,
                                  episodes: [...(extraInfo.episodes || []), { title: "", content: "" }]
                                })}
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                添加剧集
                              </Button>
                            </div>
                            {extraInfo.episodes?.map((episode, index) => (
                              <div key={index} className="flex gap-2 items-start p-3 border rounded-lg bg-muted/30">
                                <div className="flex-1 space-y-2">
                                  <Input
                                    placeholder={`第 ${index + 1} 集标题`}
                                    value={episode.title}
                                    onChange={(e) => {
                                      const newEpisodes = [...(extraInfo.episodes || [])];
                                      newEpisodes[index].title = e.target.value;
                                      setExtraInfo({ ...extraInfo, episodes: newEpisodes });
                                    }}
                                  />
                                  <Textarea
                                    placeholder="剧集介绍..."
                                    value={episode.content}
                                    onChange={(e) => {
                                      const newEpisodes = [...(extraInfo.episodes || [])];
                                      newEpisodes[index].content = e.target.value;
                                      setExtraInfo({ ...extraInfo, episodes: newEpisodes });
                                    }}
                                    className="min-h-[60px]"
                                  />
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    const newEpisodes = extraInfo.episodes?.filter((_, i) => i !== index);
                                    setExtraInfo({ ...extraInfo, episodes: newEpisodes });
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </TabsContent>

                        <TabsContent value="author" className="space-y-4 mt-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <FormLabel className="flex items-center gap-2">
                                <User className="h-4 w-4" />
                                原作者
                              </FormLabel>
                              <Input
                                placeholder="原作者名称"
                                value={extraInfo.author || ""}
                                onChange={(e) => setExtraInfo({ ...extraInfo, author: e.target.value })}
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <FormLabel>作者介绍</FormLabel>
                            <Textarea
                              placeholder="作者介绍..."
                              value={extraInfo.authorIntro || ""}
                              onChange={(e) => setExtraInfo({ ...extraInfo, authorIntro: e.target.value })}
                              className="min-h-[80px]"
                            />
                          </div>
                          <div className="space-y-2">
                            <FormLabel>搜索关键词</FormLabel>
                            <Input
                              placeholder="用逗号分隔多个关键词"
                              value={extraInfo.keywords?.join(", ") || ""}
                              onChange={(e) => setExtraInfo({
                                ...extraInfo,
                                keywords: e.target.value.split(",").map(k => k.trim()).filter(Boolean)
                              })}
                            />
                            <p className="text-xs text-muted-foreground">帮助用户找到这个视频的关键词</p>
                          </div>
                        </TabsContent>

                        <TabsContent value="downloads" className="space-y-4 mt-4">
                          <div className="flex items-center justify-between">
                            <FormLabel className="flex items-center gap-2">
                              <Download className="h-4 w-4" />
                              下载链接
                            </FormLabel>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setExtraInfo({
                                ...extraInfo,
                                downloads: [...(extraInfo.downloads || []), { name: "", url: "", password: "" }]
                              })}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              添加链接
                            </Button>
                          </div>
                          {extraInfo.downloads?.map((download, index) => (
                            <div key={index} className="flex gap-2 items-start p-3 border rounded-lg bg-muted/30">
                              <div className="flex-1 grid gap-2 md:grid-cols-3">
                                <Input
                                  placeholder="网盘名称"
                                  value={download.name}
                                  onChange={(e) => {
                                    const newDownloads = [...(extraInfo.downloads || [])];
                                    newDownloads[index].name = e.target.value;
                                    setExtraInfo({ ...extraInfo, downloads: newDownloads });
                                  }}
                                />
                                <Input
                                  placeholder="下载链接"
                                  value={download.url}
                                  onChange={(e) => {
                                    const newDownloads = [...(extraInfo.downloads || [])];
                                    newDownloads[index].url = e.target.value;
                                    setExtraInfo({ ...extraInfo, downloads: newDownloads });
                                  }}
                                />
                                <Input
                                  placeholder="提取码（可选）"
                                  value={download.password || ""}
                                  onChange={(e) => {
                                    const newDownloads = [...(extraInfo.downloads || [])];
                                    newDownloads[index].password = e.target.value;
                                    setExtraInfo({ ...extraInfo, downloads: newDownloads });
                                  }}
                                />
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const newDownloads = extraInfo.downloads?.filter((_, i) => i !== index);
                                  setExtraInfo({ ...extraInfo, downloads: newDownloads });
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                          {(!extraInfo.downloads || extraInfo.downloads.length === 0) && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              暂无下载链接，点击上方按钮添加
                            </p>
                          )}
                        </TabsContent>

                        <TabsContent value="related" className="space-y-4 mt-4">
                          <div className="flex items-center justify-between">
                            <FormLabel className="flex items-center gap-2">
                              <ListVideo className="h-4 w-4" />
                              相关视频
                            </FormLabel>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setExtraInfo({
                                ...extraInfo,
                                relatedVideos: [...(extraInfo.relatedVideos || []), ""]
                              })}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              添加
                            </Button>
                          </div>
                          {extraInfo.relatedVideos?.map((video, index) => (
                            <div key={index} className="flex gap-2">
                              <Input
                                placeholder="相关视频标题"
                                value={video}
                                onChange={(e) => {
                                  const newRelated = [...(extraInfo.relatedVideos || [])];
                                  newRelated[index] = e.target.value;
                                  setExtraInfo({ ...extraInfo, relatedVideos: newRelated });
                                }}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const newRelated = extraInfo.relatedVideos?.filter((_, i) => i !== index);
                                  setExtraInfo({ ...extraInfo, relatedVideos: newRelated });
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>

            {/* 右侧：封面和合集 */}
            <div className="space-y-6">
              {/* 封面卡片 */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ImageIcon className="h-5 w-5" />
                    封面
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="coverUrl"
                    render={({ field }) => (
                      <FormItem>
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
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => form.setValue("coverUrl", "")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                        <ImageIcon className="h-12 w-12 mb-2 opacity-50" />
                        <span className="text-sm">输入链接预览</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 合集卡片 */}
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Layers className="h-5 w-5" />
                      合集
                    </CardTitle>
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
                  <CardDescription>
                    将视频添加到合集（可选）
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!showCreateSeries ? (
                    <>
                      <Select
                        value={selectedSeriesId || ""}
                        onValueChange={(value) => {
                          setSelectedSeriesId(value || null);
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
                                <Badge variant="secondary" className="text-xs">
                                  {series.episodeCount}集
                                </Badge>
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
                    </>
                  ) : (
                    <div className="space-y-3">
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
                          className="flex-1"
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
                          className="flex-1"
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
                </CardContent>
              </Card>

              {/* 发布按钮 */}
              <Button 
                type="submit" 
                className="w-full h-12 text-base" 
                disabled={isLoading}
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    发布中...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-5 w-5" />
                    发布视频
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
