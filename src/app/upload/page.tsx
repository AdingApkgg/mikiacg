"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
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
  Gamepad2,
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
  FileText,
  CheckCircle,
  XCircle,
  FolderOpen,
  Construction,
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
import { GAME_TYPES } from "@/lib/constants";

/** 上传内容类型 */
type UploadContentType = "video" | "game" | "image";

const uploadSchema = z.object({
  title: z.string().min(1, "请输入标题").max(100, "标题最多100个字符"),
  description: z.string().max(5000, "简介最多5000个字符").optional().or(z.literal("")),
  coverUrl: z.string().url("请输入有效的封面URL").optional().or(z.literal("")),
  videoUrl: z.string().url("请输入有效的视频URL"),
});

type UploadForm = z.infer<typeof uploadSchema>;

const gameUploadSchema = z.object({
  title: z.string().min(1, "请输入游戏标题").max(200, "标题最多200个字符"),
  description: z.string().max(5000, "简介最多5000个字符").optional().or(z.literal("")),
  coverUrl: z.string().url("请输入有效的封面URL").optional().or(z.literal("")),
  gameType: z.string().optional(),
  isFree: z.boolean(),
  version: z.string().max(50).optional().or(z.literal("")),
  originalName: z.string().max(200).optional().or(z.literal("")),
  originalAuthor: z.string().max(200).optional().or(z.literal("")),
  originalAuthorUrl: z.string().url().optional().or(z.literal("")),
  fileSize: z.string().max(50).optional().or(z.literal("")),
  platforms: z.string().max(200).optional().or(z.literal("")),
});

type GameUploadForm = z.infer<typeof gameUploadSchema>;

// 批量导入数据结构
interface ParsedVideo {
  title: string;
  description: string;
  coverUrl: string;
  videoUrl: string;
  tags: string[];
  extraInfo?: VideoExtraInfo;
}

interface ParsedSeries {
  seriesTitle: string;
  description?: string;
  coverUrl?: string;
  videos: ParsedVideo[];
}

interface ParsedBatchData {
  series: ParsedSeries[];
  totalVideos: number;
}

/**
 * 解析视频批量导入 JSON 数据
 *
 * 支持两种 JSON 格式：
 *
 * 格式一（按合集分组）：
 * {
 *   "series": [
 *     {
 *       "seriesTitle": "合集名",
 *       "description": "描述",
 *       "coverUrl": "url",
 *       "videos": [
 *         { "title": "标题", "videoUrl": "url", "coverUrl": "url", "tagNames": ["tag1"], "extraInfo": {...} }
 *       ]
 *     }
 *   ]
 * }
 *
 * 格式二（扁平数组，每项单独为 1 个合集）：
 * [
 *   { "title": "标题", "videoUrl": "url", "tagNames": ["tag1"], ... }
 * ]
 */
function parseVideoBatchJson(data: unknown): ParsedBatchData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = data as any;

  if (raw?.series && Array.isArray(raw.series)) {
    const series: ParsedSeries[] = raw.series.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: any) => ({
        seriesTitle: (s.seriesTitle as string) || "",
        description: (s.description as string) || undefined,
        coverUrl: (s.coverUrl as string) || undefined,
        videos: (Array.isArray(s.videos) ? s.videos : []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (v: any) => ({
            title: (v.title as string) || "",
            description: (v.description as string) || "",
            coverUrl: (v.coverUrl as string) || "",
            videoUrl: (v.videoUrl as string) || "",
            tags: (v.tagNames as string[]) || (v.tags as string[]) || [],
            extraInfo: v.extraInfo || undefined,
          }),
        ),
      }),
    );
    const totalVideos = series.reduce((sum, s) => sum + s.videos.length, 0);
    return { series, totalVideos };
  }

  if (Array.isArray(raw)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const videos: ParsedVideo[] = raw.map((v: any) => ({
      title: (v.title as string) || "",
      description: (v.description as string) || "",
      coverUrl: (v.coverUrl as string) || "",
      videoUrl: (v.videoUrl as string) || "",
      tags: (v.tagNames as string[]) || (v.tags as string[]) || [],
      extraInfo: v.extraInfo || undefined,
    }));
    return {
      series: [{ seriesTitle: "", videos }],
      totalVideos: videos.length,
    };
  }

  return { series: [], totalVideos: 0 };
}

// ==================== 游戏批量导入解析 ====================

interface ParsedGame {
  title: string;
  description: string;
  coverUrl: string;
  gameType: string;
  isFree: boolean;
  version: string;
  tags: string[];
  downloads: { name: string; url: string; password?: string }[];
  screenshots: string[];
  videos: string[];
  originalName: string;
  originalAuthor: string;
  originalAuthorUrl: string;
  fileSize: string;
  platforms: string[];
}

interface ParsedGameBatchData {
  games: ParsedGame[];
}

/**
 * 解析游戏批量导入文本
 *
 * 格式（每行一个字段，用前缀标识，游戏间用空行分隔）：
 *
 * 标题：游戏标题1
 * 类型：ADV
 * 免费：是（默认免费，写"否"表示付费）
 * 版本：Ver1.0.3
 * 描述：游戏介绍...
 * 封面：https://example.com/cover.jpg
 * 标签：标签1,标签2,标签3
 * 下载：夸克|https://url|密码
 * 截图：https://screenshot1.jpg
 * 截图：https://screenshot2.jpg
 * 原名：原作名称
 * 作者：开发者名称
 * 作者链接：https://...
 * 大小：2.5GB
 * 平台：Windows,Mac,Android
 *
 * 标题：游戏标题2
 * ...
 */
function buildGameExtraInfo(g: ParsedGame): Record<string, unknown> | undefined {
  const info: Record<string, unknown> = {};
  if (g.originalName) info.originalName = g.originalName;
  if (g.originalAuthor) info.originalAuthor = g.originalAuthor;
  if (g.originalAuthorUrl) info.originalAuthorUrl = g.originalAuthorUrl;
  if (g.fileSize) info.fileSize = g.fileSize;
  if (g.platforms?.length > 0) info.platforms = g.platforms;
  if (g.screenshots?.length > 0) info.screenshots = g.screenshots;
  if (g.videos?.length > 0) info.videos = g.videos;
  if (g.downloads?.length > 0) info.downloads = g.downloads;
  return Object.keys(info).length > 0 ? info : undefined;
}


export default function UploadPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  
  // 内容类型选择
  const [contentType, setContentType] = useState<UploadContentType>("video");

  // ========== 视频上传状态 ==========
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

  // 批量导入相关状态
  const [uploadMode, setUploadMode] = useState<"single" | "batch">("single");
  const [parsedBatch, setParsedBatch] = useState<ParsedBatchData | null>(null);
  const [batchImporting, setBatchImporting] = useState(false);
  const [batchResults, setBatchResults] = useState<{ title: string; seriesTitle?: string; id?: string; error?: string; merged?: boolean }[]>([]);
  const [videoBatchFileName, setVideoBatchFileName] = useState("");

  // ========== 游戏上传状态 ==========
  const [gameUploadMode, setGameUploadMode] = useState<"single" | "batch">("single");
  const [gameLoading, setGameLoading] = useState(false);
  const [gameSelectedTags, setGameSelectedTags] = useState<{ id: string; name: string }[]>([]);
  const [gameNewTags, setGameNewTags] = useState<string[]>([]);
  const [gameTagSearch, setGameTagSearch] = useState("");
  const [gameNewTagInput, setGameNewTagInput] = useState("");
  const [gameScreenshots, setGameScreenshots] = useState<string[]>([""]);
  const [gameVideos, setGameVideos] = useState<string[]>([""]);
  const [gameDownloads, setGameDownloads] = useState<{ name: string; url: string; password?: string }[]>([]);
  // 游戏批量导入
  const [parsedGameBatch, setParsedGameBatch] = useState<ParsedGameBatchData | null>(null);
  const [gameBatchImporting, setGameBatchImporting] = useState(false);
  const [gameBatchResults, setGameBatchResults] = useState<{ title: string; id?: string; error?: string; updated?: boolean }[]>([]);
  const [gameBatchFileName, setGameBatchFileName] = useState("");

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

  const batchCreateMutation = trpc.video.batchCreate.useMutation();

  const createGameMutation = trpc.game.create.useMutation({
    onError: (error) => {
      toast.error("发布失败", { description: error.message });
    },
  });

  const batchCreateGameMutation = trpc.game.batchCreate.useMutation();

  // 视频批量解析 JSON 文件
  const handleVideoBatchFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoBatchFileName(file.name);
    setParsedBatch(null);
    setBatchResults([]);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        const parsed = parseVideoBatchJson(data);
        if (parsed.totalVideos === 0) {
          toast.error("JSON 文件中未找到有效视频数据");
          return;
        }
        setParsedBatch(parsed);
        toast.success(`解析成功：${parsed.series.length} 个合集，${parsed.totalVideos} 个视频`);
      } catch {
        toast.error("JSON 文件解析失败，请检查文件格式");
      }
    };
    reader.readAsText(file);
  };

  // 批量导入 — 按合集分批调用 batchCreate，一次事务完成
  const handleBatchImport = async () => {
    if (!parsedBatch || parsedBatch.totalVideos === 0) {
      toast.error("请先解析内容");
      return;
    }

    setBatchImporting(true);
    setBatchResults([]);
    const allResults: typeof batchResults = [];

    try {
      // 并发提交所有合集（每个合集一次 batchCreate 调用）
      const promises = parsedBatch.series.map(async (series) => {
        try {
          const res = await batchCreateMutation.mutateAsync({
            seriesTitle: series.seriesTitle || undefined,
            seriesDescription: series.description || undefined,
            seriesCoverUrl: series.coverUrl || undefined,
            videos: series.videos.map((v) => ({
              title: v.title,
              description: v.description || undefined,
              coverUrl: v.coverUrl || "",
              videoUrl: v.videoUrl,
              tagNames: v.tags,
              ...(v.extraInfo ? { extraInfo: v.extraInfo } : {}),
            })),
          });

          return res.results.map((r) => ({
            title: r.title,
            seriesTitle: series.seriesTitle || undefined,
            id: r.id,
            error: r.error,
            merged: r.merged,
          }));
        } catch (error) {
          // 整个合集失败，标记所有视频
          return series.videos.map((v) => ({
            title: v.title,
            seriesTitle: series.seriesTitle || undefined,
            error: error instanceof Error ? error.message : "未知错误",
          }));
        }
      });

      const batchResults = await Promise.all(promises);
      for (const batch of batchResults) {
        allResults.push(...batch);
      }

      const successCount = allResults.filter(r => r.id).length;
      const mergedCount = allResults.filter(r => r.merged).length;
      const failCount = allResults.filter(r => r.error).length;
      toast.success(
        mergedCount > 0
          ? `导入完成：${successCount} 条（其中 ${mergedCount} 条已合并同链接），${failCount} 失败`
          : `导入完成：${successCount} 成功，${failCount} 失败`
      );
      setBatchResults(allResults);
      refetchSeries();
    } finally {
      setBatchImporting(false);
    }
  };

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

  const gameForm = useForm<GameUploadForm>({
    resolver: zodResolver(gameUploadSchema),
    defaultValues: {
      title: "",
      description: "",
      coverUrl: "",
      gameType: "",
      isFree: true,
      version: "",
      originalName: "",
      originalAuthor: "",
      originalAuthorUrl: "",
      fileSize: "",
      platforms: "",
    },
  });

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

  // ========== 游戏标签相关函数 ==========
  const gameFilteredTags = allTags?.filter((tag) => {
    if (!gameTagSearch.trim()) return true;
    return tag.name.toLowerCase().includes(gameTagSearch.toLowerCase());
  }) || [];

  const toggleGameTag = (tag: { id: string; name: string }) => {
    const exists = gameSelectedTags.find((t) => t.id === tag.id);
    if (exists) {
      setGameSelectedTags(gameSelectedTags.filter((t) => t.id !== tag.id));
    } else if (gameSelectedTags.length + gameNewTags.length < 10) {
      setGameSelectedTags([...gameSelectedTags, tag]);
    }
  };

  const handleAddGameNewTag = () => {
    const tag = gameNewTagInput.trim();
    if (!tag || gameNewTags.length + gameSelectedTags.length >= 10) return;
    if (gameNewTags.includes(tag)) return;
    if (gameSelectedTags.some((t) => t.name.toLowerCase() === tag.toLowerCase())) return;

    const existingTag = allTags?.find((t) => t.name.toLowerCase() === tag.toLowerCase());
    if (existingTag) {
      toggleGameTag(existingTag);
    } else {
      setGameNewTags([...gameNewTags, tag]);
    }
    setGameNewTagInput("");
  };

  // 游戏批量解析 JSON 文件
  const handleGameBatchFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setGameBatchFileName(file.name);
    setParsedGameBatch(null);
    setGameBatchResults([]);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        const games: ParsedGame[] = (Array.isArray(data) ? data : data.games ?? []).map(
          (g: Record<string, unknown>) => ({
            title: (g.title as string) || "",
            description: (g.description as string) || "",
            coverUrl: (g.coverUrl as string) || "",
            gameType: (g.gameType as string) || "",
            isFree: g.isFree !== false,
            version: (g.version as string) || "",
            tags: (g.tagNames as string[]) || [],
            downloads: ((g.extraInfo as Record<string, unknown>)?.downloads as { name: string; url: string; password?: string }[]) || [],
            screenshots: ((g.extraInfo as Record<string, unknown>)?.screenshots as string[]) || [],
            videos: ((g.extraInfo as Record<string, unknown>)?.videos as string[]) || [],
            originalName: ((g.extraInfo as Record<string, unknown>)?.originalName as string) || "",
            originalAuthor: ((g.extraInfo as Record<string, unknown>)?.originalAuthor as string) || "",
            originalAuthorUrl: ((g.extraInfo as Record<string, unknown>)?.originalAuthorUrl as string) || "",
            fileSize: ((g.extraInfo as Record<string, unknown>)?.fileSize as string) || "",
            platforms: ((g.extraInfo as Record<string, unknown>)?.platforms as string[]) || [],
          })
        );
        if (games.length === 0 || !games[0].title) {
          toast.error("JSON 文件中未找到有效游戏数据");
          return;
        }
        setParsedGameBatch({ games });
        toast.success(`解析成功：${games.length} 个游戏`);
      } catch {
        toast.error("JSON 文件解析失败，请检查文件格式");
      }
    };
    reader.readAsText(file);
  };

  // 游戏批量导入
  const handleGameBatchImport = async () => {
    if (!parsedGameBatch || parsedGameBatch.games.length === 0) {
      toast.error("请先解析内容");
      return;
    }

    setGameBatchImporting(true);
    setGameBatchResults([]);

    try {
      const res = await batchCreateGameMutation.mutateAsync({
        games: parsedGameBatch.games.map((g) => ({
          title: g.title,
          description: g.description || undefined,
          coverUrl: g.coverUrl || undefined,
          gameType: g.gameType || undefined,
          isFree: g.isFree,
          version: g.version || undefined,
          tagNames: g.tags?.length > 0 ? g.tags : undefined,
          extraInfo: buildGameExtraInfo(g),
        })),
      });

      const newCount = res.results.filter((r: { id?: string; updated?: boolean }) => r.id && !r.updated).length;
      const updatedCount = res.results.filter((r: { updated?: boolean }) => r.updated).length;
      const failCount = res.results.filter((r: { error?: string }) => r.error).length;
      toast.success(`导入完成：新建 ${newCount}，更新 ${updatedCount}，失败 ${failCount}`);
      setGameBatchResults(res.results);
    } catch (err) {
      toast.error("批量导入失败", {
        description: err instanceof Error ? err.message : "未知错误",
      });
    } finally {
      setGameBatchImporting(false);
    }
  };

  async function onGameSubmit(data: GameUploadForm) {
    setGameLoading(true);
    try {
      const extraInfo: Record<string, unknown> = {};
      if (data.originalName) extraInfo.originalName = data.originalName;
      if (data.originalAuthor) extraInfo.originalAuthor = data.originalAuthor;
      if (data.originalAuthorUrl) extraInfo.originalAuthorUrl = data.originalAuthorUrl;
      if (data.fileSize) extraInfo.fileSize = data.fileSize;
      if (data.platforms) extraInfo.platforms = data.platforms.split(/[,，]/).map(s => s.trim()).filter(Boolean);
      const validScreenshots = gameScreenshots.filter(s => s.trim());
      if (validScreenshots.length > 0) extraInfo.screenshots = validScreenshots;
      const validVideos = gameVideos.filter(s => s.trim());
      if (validVideos.length > 0) extraInfo.videos = validVideos;
      if (gameDownloads.length > 0) extraInfo.downloads = gameDownloads.filter(d => d.url.trim());

      const result = await createGameMutation.mutateAsync({
        title: data.title,
        description: data.description || undefined,
        coverUrl: data.coverUrl || undefined,
        gameType: data.gameType || undefined,
        isFree: data.isFree,
        version: data.version || undefined,
        tagIds: gameSelectedTags.map((t) => t.id),
        tagNames: gameNewTags,
        extraInfo: Object.keys(extraInfo).length > 0 ? extraInfo : undefined,
      });

      toast.success(result.status === "PUBLISHED" ? "发布成功" : "提交成功，等待审核");
      router.push(`/game/${result.id}`);
    } catch {
      // onError 已处理
    } finally {
      setGameLoading(false);
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
    { id: "image" as const, label: "图片", icon: ImageIcon, description: "上传图片（即将开放）" },
  ];

  return (
    <div className="container py-6 max-w-5xl">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Upload className="h-6 w-6" />
          上传
        </h1>
        <p className="text-muted-foreground mt-1">
          选择内容类型，填写信息后发布
        </p>
      </div>

      {/* 内容类型选择 */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {contentTypeOptions.map((opt) => {
          const Icon = opt.icon;
          const isActive = contentType === opt.id;
          const isDisabled = opt.id === "image";
          return (
            <button
              key={opt.id}
              type="button"
              disabled={isDisabled}
              onClick={() => setContentType(opt.id)}
              className={cn(
                "relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all",
                isActive
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-muted hover:border-muted-foreground/30 hover:bg-muted/50",
                isDisabled && "opacity-50 cursor-not-allowed hover:border-muted hover:bg-transparent"
              )}
            >
              <Icon className="h-6 w-6" />
              <span className="font-medium text-sm">{opt.label}</span>
              {isDisabled && (
                <Badge variant="secondary" className="absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0">
                  <Construction className="h-3 w-3 mr-0.5" />
                  敬请期待
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* ==================== 视频上传 ==================== */}
      {contentType === "video" && (
      <>
      {/* 模式切换 */}
      <Tabs value={uploadMode} onValueChange={(v) => setUploadMode(v as "single" | "batch")} className="mb-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="single" className="gap-2">
            <FileVideo className="h-4 w-4" />
            单个发布
          </TabsTrigger>
          <TabsTrigger value="batch" className="gap-2">
            <FolderOpen className="h-4 w-4" />
            批量导入
          </TabsTrigger>
        </TabsList>

        {/* 批量导入模式 */}
        <TabsContent value="batch" className="space-y-6 mt-6">
          <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    JSON 文件导入
                  </CardTitle>
                  <CardDescription>
                    选择 JSON 文件，自动解析合集与视频并批量导入
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>选择 JSON 文件</Label>
                    <div className="flex items-center gap-3">
                      <label className="cursor-pointer">
                        <Button type="button" variant="outline" asChild>
                          <span>
                            <FolderOpen className="h-4 w-4 mr-2" />
                            {videoBatchFileName || "选择文件"}
                          </span>
                        </Button>
                        <input
                          type="file"
                          accept=".json"
                          className="hidden"
                          onChange={handleVideoBatchFile}
                        />
                      </label>
                      {parsedBatch && (
                        <span className="text-sm text-muted-foreground">
                          已解析 {parsedBatch.series.length} 个合集，{parsedBatch.totalVideos} 个视频
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      JSON 格式：包含 series 数组（每个合集含 videos 数组），每个视频需要 title, videoUrl 字段。可通过抓取脚本生成
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={handleBatchImport}
                      disabled={!parsedBatch || parsedBatch.totalVideos === 0 || batchImporting}
                    >
                      {batchImporting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      开始导入 {parsedBatch ? `(${parsedBatch.totalVideos} 个视频)` : ""}
                    </Button>
                  </div>
                </CardContent>
              </Card>

          {/* 解析预览 */}
          {parsedBatch && parsedBatch.totalVideos > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">解析预览</CardTitle>
                <CardDescription>
                  共 {parsedBatch.series.length} 个合集，{parsedBatch.totalVideos} 个视频
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[500px]">
                  <div className="space-y-4">
                    {parsedBatch.series.map((series, sIndex) => (
                      <div key={sIndex} className="space-y-2 border rounded-lg p-3">
                        {/* 合集头部 */}
                        <div className="flex items-start gap-3">
                          {series.coverUrl ? (
                            <div className="shrink-0 w-16 h-10 rounded overflow-hidden bg-muted">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={series.coverUrl}
                                alt={series.seriesTitle || "合集封面"}
                                className="w-full h-full object-cover"
                                onError={(e) => { e.currentTarget.style.display = "none"; }}
                              />
                            </div>
                          ) : null}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Layers className="h-4 w-4 text-primary shrink-0" />
                              <span className="font-medium truncate">
                                {series.seriesTitle || "无合集"}
                              </span>
                              <Badge variant="secondary" className="text-xs shrink-0">
                                {series.videos.length} 个视频
                              </Badge>
                              {series.coverUrl && (
                                <Badge variant="outline" className="text-xs shrink-0">
                                  <ImageIcon className="h-3 w-3 mr-1" />
                                  合集封面
                                </Badge>
                              )}
                            </div>
                            {series.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {series.description}
                              </p>
                            )}
                          </div>
                        </div>
                        {/* 视频列表 */}
                        <div className="ml-2 space-y-1.5">
                          {series.videos.map((video, vIndex) => (
                            <div
                              key={vIndex}
                              className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-sm"
                            >
                              <span className="text-muted-foreground text-xs tabular-nums shrink-0 w-6 text-right">
                                {vIndex + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{video.title}</div>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  {video.coverUrl ? (
                                    <Badge variant="outline" className="text-[10px] py-0">
                                      <ImageIcon className="h-2.5 w-2.5 mr-0.5" />
                                      自定义封面
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-[10px] py-0">
                                      <FileVideo className="h-2.5 w-2.5 mr-0.5" />
                                      自动生成封面
                                    </Badge>
                                  )}
                                  {video.extraInfo?.author && (
                                    <span className="text-[10px] text-muted-foreground">
                                      <User className="h-2.5 w-2.5 inline mr-0.5" />
                                      {video.extraInfo.author}
                                    </span>
                                  )}
                                  {video.extraInfo?.downloads && video.extraInfo.downloads.length > 0 && (
                                    <span className="text-[10px] text-muted-foreground">
                                      <Download className="h-2.5 w-2.5 inline mr-0.5" />
                                      {video.extraInfo.downloads.length} 个下载
                                    </span>
                                  )}
                                  {video.tags.length > 0 && (
                                    <span className="text-[10px] text-muted-foreground">
                                      <Tag className="h-2.5 w-2.5 inline mr-0.5" />
                                      {video.tags.length} 个标签
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* 导入结果 */}
          {batchResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">导入结果</CardTitle>
                <CardDescription>
                  成功 {batchResults.filter(r => r.id).length}
                  {batchResults.filter(r => r.merged).length > 0 &&
                    `（已合并同链接 ${batchResults.filter(r => r.merged).length}）`}
                  ，失败 {batchResults.filter(r => r.error).length}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[300px]">
                  <div className="space-y-2">
                    {batchResults.map((result, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {result.id ? (
                            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-sm">{result.title}</div>
                            {result.seriesTitle && (
                              <div className="text-xs text-muted-foreground">
                                {result.seriesTitle}
                              </div>
                            )}
                          </div>
                        </div>
                        {result.id ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {result.merged && (
                              <Badge variant="outline" className="text-xs">
                                已合并
                              </Badge>
                            )}
                            <Link href={`/video/${result.id}`}>
                              <Badge variant="secondary" className="text-xs">
                                {result.id}
                              </Badge>
                            </Link>
                          </div>
                        ) : (
                          <Badge variant="destructive" className="text-xs">
                            {result.error}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* 单个发布模式 */}
        <TabsContent value="single" className="mt-6">
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
        </TabsContent>
      </Tabs>
      </>
      )}

      {/* ==================== 游戏上传 ==================== */}
      {contentType === "game" && (
      <>
        <Tabs value={gameUploadMode} onValueChange={(v) => setGameUploadMode(v as "single" | "batch")} className="mb-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="single" className="gap-2">
              <Gamepad2 className="h-4 w-4" />
              单个发布
            </TabsTrigger>
            <TabsTrigger value="batch" className="gap-2">
              <FolderOpen className="h-4 w-4" />
              批量导入
            </TabsTrigger>
          </TabsList>

          {/* 游戏批量导入 */}
          <TabsContent value="batch" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  批量导入游戏
                </CardTitle>
                <CardDescription>
                  选择 JSON 文件批量导入游戏资源
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>选择 JSON 文件</Label>
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-input rounded-md bg-background hover:bg-accent hover:text-accent-foreground transition-colors text-sm font-medium">
                      <FileText className="h-4 w-4" />
                      {gameBatchFileName || "选择文件"}
                      <input
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={handleGameBatchFile}
                      />
                    </label>
                    {parsedGameBatch && (
                      <span className="text-sm text-muted-foreground">
                        已解析 {parsedGameBatch.games.length} 个游戏
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    JSON 格式：数组，每项包含 title, description, coverUrl, gameType, isFree, version, tagNames, extraInfo 等字段。可通过抓取脚本 --batch-text 生成
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={handleGameBatchImport}
                    disabled={!parsedGameBatch || parsedGameBatch.games.length === 0 || gameBatchImporting}
                  >
                    {gameBatchImporting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    开始导入 {parsedGameBatch ? `(${parsedGameBatch.games.length} 个游戏)` : ""}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 解析预览 */}
            {parsedGameBatch && parsedGameBatch.games.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">解析预览</CardTitle>
                  <CardDescription>
                    共 {parsedGameBatch.games.length} 个游戏
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-[500px]">
                    <div className="space-y-2">
                      {parsedGameBatch.games.map((game, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                        >
                          {game.coverUrl ? (
                            <div className="shrink-0 w-16 h-10 rounded overflow-hidden bg-muted">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={game.coverUrl}
                                alt={game.title}
                                className="w-full h-full object-cover"
                                onError={(e) => { e.currentTarget.style.display = "none"; }}
                              />
                            </div>
                          ) : null}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{game.title}</div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {game.gameType && (
                                <Badge variant="default" className="text-[10px] py-0">
                                  {game.gameType}
                                </Badge>
                              )}
                              <Badge variant={game.isFree ? "secondary" : "outline"} className="text-[10px] py-0">
                                {game.isFree ? "免费" : "付费"}
                              </Badge>
                              {game.version && (
                                <span className="text-[10px] text-muted-foreground">{game.version}</span>
                              )}
                              {game.downloads?.length > 0 && (
                                <span className="text-[10px] text-muted-foreground">
                                  <Download className="h-2.5 w-2.5 inline mr-0.5" />
                                  {game.downloads.length} 个下载
                                </span>
                              )}
                              {game.screenshots?.length > 0 && (
                                <span className="text-[10px] text-muted-foreground">
                                  <ImageIcon className="h-2.5 w-2.5 inline mr-0.5" />
                                  {game.screenshots.length} 张截图
                                </span>
                              )}
                              {game.videos?.length > 0 && (
                                <span className="text-[10px] text-muted-foreground">
                                  <FileVideo className="h-2.5 w-2.5 inline mr-0.5" />
                                  {game.videos.length} 个视频
                                </span>
                              )}
                              {game.tags?.length > 0 && (
                                <span className="text-[10px] text-muted-foreground">
                                  <Tag className="h-2.5 w-2.5 inline mr-0.5" />
                                  {game.tags.length} 个标签
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* 导入结果 */}
            {gameBatchResults.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">导入结果</CardTitle>
                  <CardDescription>
                    新建 {gameBatchResults.filter(r => r.id && !r.updated).length}，更新 {gameBatchResults.filter(r => r.updated).length}，失败 {gameBatchResults.filter(r => r.error).length}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-[300px]">
                    <div className="space-y-2">
                      {gameBatchResults.map((result, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {result.id ? (
                              <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                            )}
                            <span className="truncate text-sm">{result.title}</span>
                          </div>
                          {result.id ? (
                            <div className="flex items-center gap-1.5">
                              {result.updated && (
                                <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-400">
                                  已更新
                                </Badge>
                              )}
                              <Link href={`/game/${result.id}`}>
                                <Badge variant="secondary" className="text-xs">
                                  {result.id}
                                </Badge>
                              </Link>
                            </div>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              {result.error}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* 单个发布模式 */}
          <TabsContent value="single" className="mt-6">
            <GameUploadFormSection
              form={gameForm}
              onSubmit={onGameSubmit}
              isLoading={gameLoading}
              allTags={allTags}
              selectedTags={gameSelectedTags}
              newTags={gameNewTags}
              tagSearch={gameTagSearch}
              setTagSearch={setGameTagSearch}
              newTagInput={gameNewTagInput}
              setNewTagInput={setGameNewTagInput}
              toggleTag={toggleGameTag}
              handleAddNewTag={handleAddGameNewTag}
              filteredTags={gameFilteredTags}
              screenshots={gameScreenshots}
              setScreenshots={setGameScreenshots}
              videos={gameVideos}
              setVideos={setGameVideos}
              downloads={gameDownloads}
              setDownloads={setGameDownloads}
            />
          </TabsContent>
        </Tabs>
      </>
      )}

      {/* ==================== 图片上传（预留） ==================== */}
      {contentType === "image" && (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-4">
          <div className="p-6 rounded-full bg-muted">
            <Construction className="h-16 w-16 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold">图片上传即将开放</h2>
          <p className="text-muted-foreground text-center max-w-md">
            图片上传功能正在开发中，敬请期待
          </p>
        </div>
      )}
    </div>
  );
}

// ==================== 游戏上传表单子组件 ====================

interface GameUploadFormSectionProps {
  form: UseFormReturn<GameUploadForm>;
  onSubmit: (data: GameUploadForm) => void;
  isLoading: boolean;
  allTags: { id: string; name: string }[] | undefined;
  selectedTags: { id: string; name: string }[];
  newTags: string[];
  tagSearch: string;
  setTagSearch: (s: string) => void;
  newTagInput: string;
  setNewTagInput: (s: string) => void;
  toggleTag: (tag: { id: string; name: string }) => void;
  handleAddNewTag: () => void;
  filteredTags: { id: string; name: string }[];
  screenshots: string[];
  setScreenshots: (s: string[]) => void;
  videos: string[];
  setVideos: (v: string[]) => void;
  downloads: { name: string; url: string; password?: string }[];
  setDownloads: (d: { name: string; url: string; password?: string }[]) => void;
}

function GameUploadFormSection({
  form,
  onSubmit,
  isLoading,
  selectedTags,
  newTags,
  tagSearch,
  setTagSearch,
  newTagInput,
  setNewTagInput,
  toggleTag,
  handleAddNewTag,
  filteredTags,
  screenshots,
  setScreenshots,
  videos,
  setVideos,
  downloads,
  setDownloads,
}: GameUploadFormSectionProps) {
  const gameCoverUrl = form.watch("coverUrl");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：主要信息 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 基本信息 */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Gamepad2 className="h-5 w-5" />
                  游戏基本信息
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>游戏标题 *</FormLabel>
                      <FormControl>
                        <Input placeholder="输入游戏标题" {...field} className="text-base" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="gameType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>游戏类型</FormLabel>
                        <Select value={field.value || ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="选择类型" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {GAME_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="version"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>版本号</FormLabel>
                        <FormControl>
                          <Input placeholder="Ver1.0.0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isFree"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>免费游戏</FormLabel>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>游戏介绍</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="游戏介绍（可选）"
                          className="min-h-[120px] resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* 标签选择 */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Tag className="h-5 w-5" />
                  标签
                </CardTitle>
                <CardDescription>选择或创建标签，最多 10 个</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
                      >
                        <Plus className="h-3 w-3" />
                        {tag}
                        <X className="h-3 w-3" />
                      </Badge>
                    ))}
                  </div>
                )}

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

            {/* 扩展信息 */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  扩展信息
                </CardTitle>
                <CardDescription>原作信息、截图、下载链接等（可选）</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="origin" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="origin" className="text-xs">原作信息</TabsTrigger>
                    <TabsTrigger value="screenshots" className="text-xs">游戏截图</TabsTrigger>
                    <TabsTrigger value="videos" className="text-xs">游戏视频</TabsTrigger>
                    <TabsTrigger value="downloads" className="text-xs">下载链接</TabsTrigger>
                  </TabsList>

                  <TabsContent value="origin" className="space-y-4 mt-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="originalName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>原作名称</FormLabel>
                            <FormControl>
                              <Input placeholder="游戏原名（日/英文）" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="originalAuthor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>原作作者</FormLabel>
                            <FormControl>
                              <Input placeholder="开发者/社团名称" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="originalAuthorUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>原作链接</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input placeholder="https://..." {...field} className="pl-9" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="fileSize"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>文件大小</FormLabel>
                            <FormControl>
                              <Input placeholder="如：2.5GB" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="platforms"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>支持平台</FormLabel>
                            <FormControl>
                              <Input placeholder="Windows, Mac, Android（逗号分隔）" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="screenshots" className="space-y-4 mt-4">
                    <div className="flex items-center justify-between">
                      <FormLabel className="flex items-center gap-2">
                        <ImageIcon className="h-4 w-4" />
                        截图链接
                      </FormLabel>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setScreenshots([...screenshots, ""])}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        添加截图
                      </Button>
                    </div>
                    {screenshots.map((url, index) => (
                      <div key={index} className="flex gap-2">
                        <div className="relative flex-1">
                          <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="https://example.com/screenshot.jpg"
                            value={url}
                            onChange={(e) => {
                              const updated = [...screenshots];
                              updated[index] = e.target.value;
                              setScreenshots(updated);
                            }}
                            className="pl-9"
                          />
                        </div>
                        {screenshots.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setScreenshots(screenshots.filter((_, i) => i !== index))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {screenshots.some(s => s.trim()) && (
                      <div className="flex gap-2 flex-wrap mt-2">
                        {screenshots.filter(s => s.trim()).map((url, i) => (
                          <div key={i} className="w-24 h-16 rounded border overflow-hidden bg-muted">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`截图 ${i + 1}`}
                              className="w-full h-full object-cover"
                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="videos" className="space-y-4 mt-4">
                    <div className="flex items-center justify-between">
                      <FormLabel className="flex items-center gap-2">
                        <FileVideo className="h-4 w-4" />
                        视频链接
                      </FormLabel>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setVideos([...videos, ""])}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        添加视频
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      支持 mp4、webm 等直链或 m3u8 流媒体地址
                    </p>
                    {videos.map((url, index) => (
                      <div key={index} className="flex gap-2">
                        <div className="relative flex-1">
                          <FileVideo className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="https://example.com/preview.mp4"
                            value={url}
                            onChange={(e) => {
                              const updated = [...videos];
                              updated[index] = e.target.value;
                              setVideos(updated);
                            }}
                            className="pl-9"
                          />
                        </div>
                        {videos.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setVideos(videos.filter((_, i) => i !== index))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
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
                        onClick={() => setDownloads([...downloads, { name: "", url: "", password: "" }])}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        添加链接
                      </Button>
                    </div>
                    {downloads.map((dl, index) => (
                      <div key={index} className="flex gap-2 items-start p-3 border rounded-lg bg-muted/30">
                        <div className="flex-1 grid gap-2 md:grid-cols-3">
                          <Input
                            placeholder="网盘名称"
                            value={dl.name}
                            onChange={(e) => {
                              const updated = [...downloads];
                              updated[index] = { ...updated[index], name: e.target.value };
                              setDownloads(updated);
                            }}
                          />
                          <Input
                            placeholder="下载链接"
                            value={dl.url}
                            onChange={(e) => {
                              const updated = [...downloads];
                              updated[index] = { ...updated[index], url: e.target.value };
                              setDownloads(updated);
                            }}
                          />
                          <Input
                            placeholder="提取码（可选）"
                            value={dl.password || ""}
                            onChange={(e) => {
                              const updated = [...downloads];
                              updated[index] = { ...updated[index], password: e.target.value };
                              setDownloads(updated);
                            }}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setDownloads(downloads.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {downloads.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        暂无下载链接，点击上方按钮添加
                      </p>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* 右侧：封面和发布 */}
          <div className="space-y-6">
            {/* 封面 */}
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
                <div
                  className={cn(
                    "relative aspect-video rounded-lg border-2 border-dashed overflow-hidden transition-colors group",
                    gameCoverUrl ? "border-transparent" : "border-muted-foreground/25"
                  )}
                >
                  {gameCoverUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={gameCoverUrl}
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
                  <Gamepad2 className="mr-2 h-5 w-5" />
                  发布游戏
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
