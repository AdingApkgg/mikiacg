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
import { Label } from "@/components/ui/label";
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
  FileText,
  CheckCircle,
  XCircle,
  FolderOpen,
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
  videos: ParsedVideo[];
}

interface ParsedBatchData {
  series: ParsedSeries[];
  totalVideos: number;
}

/**
 * 解析批量导入文本
 * 
 * 格式（每行一个字段，用前缀标识）：
 * 
 * 合集：作者名
 * 
 * 标题：视频标题1
 * 描述：视频描述（可选）
 * 封面：封面URL（可选）
 * 视频：视频URL
 * 标签：标签1,标签2,标签3（可选）
 * 作品介绍：作品详细介绍（可选）
 * 作者：原作者（可选）
 * 作者介绍：作者介绍（可选）
 * 关键词：关键词1,关键词2（可选）
 * 下载：名称|URL|密码（可选；多个用 ; 分隔）
 * 公告：info|内容（可选；type 可为 info/success/warning/error）
 * 视频信息：视频格式/码率等说明（可选）
 * 相关：相关视频标题1,相关视频标题2（可选）
 * 
 * 标题：视频标题2
 * 视频：视频URL
 * 标签：标签1,标签2
 * 
 * 合集：另一个作者
 * 
 * 标题：视频标题3
 * ...
 */
function parseBatchInput(input: string): ParsedBatchData {
  const lines = input.split('\n');
  const series: ParsedSeries[] = [];
  let currentSeries: ParsedSeries | null = null;
  let currentVideo: Partial<ParsedVideo> = {};
  let currentSeriesExtra: VideoExtraInfo = {};
  let currentVideoExtra: VideoExtraInfo = {};
  let lastField: { target: "series" | "video"; key: string } | null = null;

  // 解析带前缀的行
  const parseField = (line: string): { key: string; value: string } | null => {
    const trimmed = line.trim();
    // 支持中英文冒号
    const match = trimmed.match(/^(合集|标题|描述|封面|视频|标签|作品介绍|作者|作者介绍|关键词|下载|公告|视频信息|相关)[：:]\s*(.*)$/);
    if (match) {
      return { key: match[1], value: match[2].trim() };
    }
    return null;
  };

  const setExtraField = (target: "series" | "video", updater: (info: VideoExtraInfo) => VideoExtraInfo) => {
    if (target === "series") {
      currentSeriesExtra = updater(currentSeriesExtra);
    } else {
      currentVideoExtra = updater(currentVideoExtra);
    }
  };

  const appendNotice = (target: "series" | "video", notice: { type: 'info' | 'success' | 'warning' | 'error'; content: string }) => {
    setExtraField(target, (info) => ({
      ...info,
      notices: [...(info.notices || []), notice],
    }));
  };

  const appendNoticeLine = (target: "series" | "video", content: string) => {
    setExtraField(target, (info) => {
      const notices = [...(info.notices || [])];
      if (notices.length === 0) {
        notices.push({ type: "info", content });
      } else {
        notices[notices.length - 1] = {
          ...notices[notices.length - 1],
          content: `${notices[notices.length - 1].content}\n${content}`,
        };
      }
      return { ...info, notices };
    });
  };

  const parseDownloads = (value: string) => {
    const items = value.split(/[;；]/).map(item => item.trim()).filter(Boolean);
    return items.map((item) => {
      const parts = item.split(/[|｜]/).map(p => p.trim());
      return {
        name: parts[0] || "下载",
        url: parts[1] || "",
        password: parts[2] || undefined,
      };
    }).filter(d => d.url);
  };

  const parseNotice = (value: string, defaultType: 'info' | 'success' | 'warning' | 'error' = "info") => {
    const match = value.match(/^(info|success|warning|error)[：:|]\s*(.+)$/i);
    if (match) {
      return { type: match[1].toLowerCase() as 'info' | 'success' | 'warning' | 'error', content: match[2].trim() };
    }
    return { type: defaultType, content: value };
  };

  const mergeExtraInfo = (base?: VideoExtraInfo, override?: VideoExtraInfo): VideoExtraInfo | undefined => {
    const result: VideoExtraInfo = {};
    const pickText = (a?: string, b?: string) => b || a;
    const mergeArray = <T,>(a?: T[], b?: T[]) => {
      if (!a || a.length === 0) return b;
      if (!b || b.length === 0) return a;
      return [...a, ...b];
    };
    const mergeKeywords = (a?: string[], b?: string[]) => {
      const merged = mergeArray(a, b) || [];
      const unique = Array.from(new Set(merged.map(k => k.trim()).filter(Boolean)));
      return unique.length > 0 ? unique : undefined;
    };

    result.intro = pickText(base?.intro, override?.intro);
    result.author = pickText(base?.author, override?.author);
    result.authorIntro = pickText(base?.authorIntro, override?.authorIntro);
    result.episodes = mergeArray(base?.episodes, override?.episodes);
    result.downloads = mergeArray(base?.downloads, override?.downloads);
    result.relatedVideos = mergeArray(base?.relatedVideos, override?.relatedVideos);
    result.notices = mergeArray(base?.notices, override?.notices);
    result.keywords = mergeKeywords(base?.keywords, override?.keywords);

    const hasContent = result.intro || result.author || result.authorIntro ||
      (result.keywords && result.keywords.length > 0) ||
      (result.downloads && result.downloads.length > 0) ||
      (result.episodes && result.episodes.length > 0) ||
      (result.relatedVideos && result.relatedVideos.length > 0) ||
      (result.notices && result.notices.length > 0);

    return hasContent ? result : undefined;
  };

  // 保存当前视频
  const saveCurrentVideo = () => {
    if (currentVideo.title && currentVideo.videoUrl) {
      if (!currentSeries) {
        currentSeries = { seriesTitle: '', videos: [] };
      }
      const mergedExtra = mergeExtraInfo(currentSeriesExtra, currentVideoExtra);
      currentSeries.videos.push({
        title: currentVideo.title || '',
        description: currentVideo.description || '',
        coverUrl: currentVideo.coverUrl || '',
        videoUrl: currentVideo.videoUrl || '',
        tags: currentVideo.tags || [],
        extraInfo: mergedExtra,
      });
    }
    currentVideo = {};
    currentVideoExtra = {};
    lastField = null;
  };

  for (const line of lines) {
    const field = parseField(line);
    
    if (!field) {
      const trimmed = line.trim();
      // 空行时保存当前视频
      if (trimmed === '' && currentVideo.title) {
        saveCurrentVideo();
        continue;
      }
      // 多行字段续写
      if (lastField && trimmed !== '') {
        const { target, key } = lastField;
        if (key === '描述' && target === 'video') {
          currentVideo.description = currentVideo.description
            ? `${currentVideo.description}\n${trimmed}`
            : trimmed;
          continue;
        }
        if (key === '作品介绍') {
          setExtraField(target, (info) => ({
            ...info,
            intro: info.intro ? `${info.intro}\n${trimmed}` : trimmed,
          }));
          continue;
        }
        if (key === '作者介绍') {
          setExtraField(target, (info) => ({
            ...info,
            authorIntro: info.authorIntro ? `${info.authorIntro}\n${trimmed}` : trimmed,
          }));
          continue;
        }
        if (key === '视频信息' || key === '公告') {
          appendNoticeLine(target, trimmed);
          continue;
        }
      }
      continue;
    }

    const target: "series" | "video" =
      !currentVideo.title && currentSeries ? "series" : "video";

    switch (field.key) {
      case '合集':
        // 保存之前的视频和合集
        saveCurrentVideo();
        if (currentSeries && currentSeries.videos.length > 0) {
          series.push(currentSeries);
        }
        // 开始新合集
        currentSeries = {
          seriesTitle: field.value,
          videos: [],
        };
        currentSeriesExtra = {};
        break;
      case '标题':
        // 新视频开始前，保存之前的视频
        if (currentVideo.title) {
          saveCurrentVideo();
        }
        currentVideo.title = field.value;
        break;
      case '描述':
        currentVideo.description = field.value;
        lastField = { target: "video", key: "描述" };
        break;
      case '封面':
        currentVideo.coverUrl = field.value;
        break;
      case '视频':
        currentVideo.videoUrl = field.value;
        break;
      case '标签':
        currentVideo.tags = field.value.split(/[,，]/).map(t => t.trim()).filter(Boolean);
        break;
      case '作品介绍':
        setExtraField(target, (info) => ({ ...info, intro: field.value }));
        lastField = { target, key: "作品介绍" };
        break;
      case '作者':
        setExtraField(target, (info) => ({ ...info, author: field.value }));
        break;
      case '作者介绍':
        setExtraField(target, (info) => ({ ...info, authorIntro: field.value }));
        lastField = { target, key: "作者介绍" };
        break;
      case '关键词':
        setExtraField(target, (info) => ({
          ...info,
          keywords: field.value.split(/[,，]/).map(k => k.trim()).filter(Boolean),
        }));
        break;
      case '下载': {
        const downloads = parseDownloads(field.value);
        setExtraField(target, (info) => ({
          ...info,
          downloads: [...(info.downloads || []), ...downloads],
        }));
        break;
      }
      case '公告': {
        const notice = parseNotice(field.value, "info");
        appendNotice(target, notice);
        lastField = { target, key: "公告" };
        break;
      }
      case '视频信息': {
        const notice = parseNotice(field.value, "info");
        appendNotice(target, notice);
        lastField = { target, key: "视频信息" };
        break;
      }
      case '相关':
        setExtraField(target, (info) => ({
          ...info,
          relatedVideos: field.value.split(/[,，]/).map(v => v.trim()).filter(Boolean),
        }));
        break;
    }
    if (!['描述', '作品介绍', '作者介绍', '视频信息', '公告'].includes(field.key)) {
      lastField = null;
    }
  }

  // 处理最后一个视频和合集
  saveCurrentVideo();
  if (currentSeries && currentSeries.videos.length > 0) {
    series.push(currentSeries);
  }

  const totalVideos = series.reduce((sum, s) => sum + s.videos.length, 0);

  return { series, totalVideos };
}

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

  // 批量导入相关状态
  const [uploadMode, setUploadMode] = useState<"single" | "batch">("single");
  const [batchMode, setBatchMode] = useState<"manual" | "legacy">("manual");
  const [batchInput, setBatchInput] = useState("");
  const [parsedBatch, setParsedBatch] = useState<ParsedBatchData | null>(null);
  const [batchImporting, setBatchImporting] = useState(false);
  const [batchResults, setBatchResults] = useState<{ title: string; seriesTitle?: string; id?: string; error?: string }[]>([]);
  
  // 旧站导入相关状态
  const [legacyUrl, setLegacyUrl] = useState("");
  const [legacyFetching, setLegacyFetching] = useState(false);
  const [legacyVideos, setLegacyVideos] = useState<{
    title: string;
    description: string;
    coverUrl: string;
    videoUrl: string;
    tags: string[];
    episodes: { num: number; title: string; videoUrl: string }[];
    pageUrl: string;
  }[]>([]);

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

  // 从旧站抓取数据
  const fetchLegacyMutation = trpc.video.fetchFromLegacySite.useMutation({
    onSuccess: (data) => {
      setLegacyVideos(data.videos);
      if (data.count > 0) {
        toast.success(`成功抓取 ${data.count} 个视频合集`);
      } else {
        toast.error("未能抓取到任何视频");
      }
    },
    onError: (error) => {
      toast.error("抓取失败", { description: error.message });
    },
  });

  // 从旧站抓取
  const handleFetchLegacy = async (fetchAll: boolean) => {
    setLegacyFetching(true);
    try {
      await fetchLegacyMutation.mutateAsync({
        url: fetchAll ? undefined : legacyUrl || undefined,
        fetchAll,
      });
    } finally {
      setLegacyFetching(false);
    }
  };

  // 将旧站数据转换为批量导入格式
  const convertLegacyToBatch = () => {
    if (legacyVideos.length === 0) {
      toast.error("没有可导入的视频");
      return;
    }

    // 按作者分组
    const grouped: Record<string, typeof legacyVideos> = {};
    legacyVideos.forEach(video => {
      // 从标题提取作者名（如 【3D】ViciNeko「120帧」-> ViciNeko）
      const match = video.title.match(/【[^】]+】\s*([^「【\s]+)/);
      const author = match ? match[1] : '其他';
      if (!grouped[author]) {
        grouped[author] = [];
      }
      grouped[author].push(video);
    });

    // 生成批量导入格式（新格式：每行带前缀）
    let importText = '';
    Object.entries(grouped).forEach(([author, videos]) => {
      importText += `合集：${author}\n\n`;
      videos.forEach(video => {
        // 如果有多个剧集，为每个剧集生成一条记录
        if (video.episodes.length > 1) {
          video.episodes.forEach(ep => {
            importText += `标题：${video.title} - ${ep.title}\n`;
            if (video.description) importText += `描述：${video.description}\n`;
            if (video.coverUrl) importText += `封面：${video.coverUrl}\n`;
            importText += `视频：${ep.videoUrl}\n`;
            if (video.tags.length > 0) importText += `标签：${video.tags.join(',')}\n`;
            importText += '\n';
          });
        } else {
          importText += `标题：${video.title}\n`;
          if (video.description) importText += `描述：${video.description}\n`;
          if (video.coverUrl) importText += `封面：${video.coverUrl}\n`;
          importText += `视频：${video.videoUrl}\n`;
          if (video.tags.length > 0) importText += `标签：${video.tags.join(',')}\n`;
          importText += '\n';
        }
      });
    });

    setBatchInput(importText);
    setBatchMode("manual");
    toast.success("已转换为批量导入格式，请点击预览解析");
  };

  // 解析批量输入
  const handleParseBatch = () => {
    if (!batchInput.trim()) {
      toast.error("请输入批量导入内容");
      return;
    }
    const parsed = parseBatchInput(batchInput);
    if (parsed.totalVideos === 0) {
      toast.error("未能解析出任何视频，请检查格式");
      return;
    }
    setParsedBatch(parsed);
    toast.success(`解析成功：${parsed.series.length} 个合集，${parsed.totalVideos} 个视频`);
  };

  // 批量导入
  const handleBatchImport = async () => {
    if (!parsedBatch || parsedBatch.totalVideos === 0) {
      toast.error("请先解析内容");
      return;
    }

    setBatchImporting(true);
    setBatchResults([]);
    const results: typeof batchResults = [];

    try {
      for (const series of parsedBatch.series) {
        let seriesId: string | null = null;

        // 如果有合集标题，先创建合集
        if (series.seriesTitle) {
          try {
            const newSeries = await createSeriesMutation.mutateAsync({
              title: series.seriesTitle,
            });
            seriesId = newSeries.id;
          } catch (error) {
            console.error("创建合集失败:", error);
          }
        }

        // 导入该合集下的所有视频
        for (let i = 0; i < series.videos.length; i++) {
          const video = series.videos[i];
          try {
            const result = await createMutation.mutateAsync({
              title: video.title,
              description: video.description || undefined,
              coverUrl: video.coverUrl || "",
              videoUrl: video.videoUrl,
              tagNames: video.tags,
              ...(video.extraInfo ? { extraInfo: video.extraInfo } : {}),
              skipIndexNow: true, // 批量导入时跳过 IndexNow
            });

            // 如果有合集，添加到合集
            if (seriesId) {
              try {
                await addToSeriesMutation.mutateAsync({
                  seriesId,
                  videoId: result.id,
                  episodeNum: i + 1,
                });
              } catch (error) {
                console.error("添加到合集失败:", error);
              }
            }

            results.push({
              title: video.title,
              seriesTitle: series.seriesTitle || undefined,
              id: result.id,
            });
          } catch (error) {
            results.push({
              title: video.title,
              seriesTitle: series.seriesTitle || undefined,
              error: error instanceof Error ? error.message : "未知错误",
            });
          }
        }
      }

      const successCount = results.filter(r => r.id).length;
      const failCount = results.filter(r => r.error).length;
      toast.success(`导入完成：${successCount} 成功，${failCount} 失败`);
      setBatchResults(results);
      refetchSeries(); // 刷新合集列表
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
      router.push(`/v/${result.id}`);
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
          填写视频信息，支持单个发布或批量导入
        </p>
      </div>

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
          {/* 批量导入子模式选择 */}
          <Tabs value={batchMode} onValueChange={(v) => setBatchMode(v as "manual" | "legacy")}>
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="manual" className="gap-2">
                <FileText className="h-4 w-4" />
                手动输入
              </TabsTrigger>
              <TabsTrigger value="legacy" className="gap-2">
                <Download className="h-4 w-4" />
                从旧站导入
              </TabsTrigger>
            </TabsList>

            {/* 从旧站导入 */}
            <TabsContent value="legacy" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Download className="h-5 w-5" />
                    从旧站导入
                  </CardTitle>
                  <CardDescription>
                    自动抓取 tv.mikiacg.org 的视频数据
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      value={legacyUrl}
                      onChange={(e) => setLegacyUrl(e.target.value)}
                      placeholder="输入旧站视频页面 URL（可选）"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleFetchLegacy(false)}
                      disabled={legacyFetching || !legacyUrl.trim()}
                    >
                      {legacyFetching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <Separator className="flex-1" />
                    <span className="text-xs text-muted-foreground">或</span>
                    <Separator className="flex-1" />
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => handleFetchLegacy(true)}
                    disabled={legacyFetching}
                  >
                    {legacyFetching ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        正在抓取...
                      </>
                    ) : (
                      <>
                        <Layers className="h-4 w-4 mr-2" />
                        一键抓取全部视频
                      </>
                    )}
                  </Button>

                  {legacyVideos.length > 0 && (
                    <div className="pt-4 border-t">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium">
                          已抓取 {legacyVideos.length} 个视频合集
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          onClick={convertLegacyToBatch}
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          转换并导入
                        </Button>
                      </div>
                      <ScrollArea className="max-h-[300px]">
                        <div className="space-y-2">
                          {legacyVideos.map((video, index) => (
                            <div
                              key={index}
                              className="p-3 rounded-lg bg-muted/50 text-sm"
                            >
                              <div className="font-medium">{video.title}</div>
                              <div className="text-muted-foreground text-xs mt-1">
                                {video.episodes.length > 0 
                                  ? `${video.episodes.length} 集` 
                                  : video.videoUrl ? '1 个视频' : '无视频'}
                              </div>
                              {video.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {video.tags.slice(0, 5).map((tag, tIndex) => (
                                    <Badge key={tIndex} variant="outline" className="text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* 手动输入 */}
            <TabsContent value="manual" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    手动输入
                  </CardTitle>
                  <CardDescription>
                    按格式粘贴内容，自动创建合集并导入视频
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>导入内容</Label>
                    <Textarea
                      value={batchInput}
                      onChange={(e) => setBatchInput(e.target.value)}
                      placeholder={`合集：作者名1

标题：视频标题1
描述：视频描述（可选）
封面：https://example.com/cover1.jpg（可选）
视频：https://example.com/video1.mp4
标签：标签1,标签2,标签3
作品介绍：更详细的作品介绍（可选）
作者：原作者（可选）
作者介绍：作者介绍（可选）
关键词：关键词1,关键词2（可选）
下载：夸克|https://example.com/file1|1234; 百度|https://example.com/file2
公告：warning|本视频含有敏感内容（可选）
视频信息：AV1格式1080P（可选）
相关：相关视频标题1,相关视频标题2（可选）

标题：视频标题2
视频：https://example.com/video2.mp4
标签：标签1,标签2

合集：作者名2

标题：视频标题3
描述：另一个视频
视频：https://example.com/video3.mp4
标签：标签1`}
                      className="min-h-[300px] font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      格式说明：每行用前缀标识字段（合集:、标题:、描述:、封面:、视频:、标签:、作品介绍:、作者:、作者介绍:、关键词:、下载:、公告:、视频信息:、相关:），支持中英文冒号，视频之间用空行分隔；描述/作品介绍/作者介绍/公告/视频信息支持多行
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleParseBatch}
                      disabled={!batchInput.trim()}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      预览解析
                    </Button>
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
            </TabsContent>
          </Tabs>

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
                <ScrollArea className="max-h-[400px]">
                  <div className="space-y-4">
                    {parsedBatch.series.map((series, sIndex) => (
                      <div key={sIndex} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Layers className="h-4 w-4 text-primary" />
                          <span className="font-medium">
                            {series.seriesTitle || "无合集"}
                          </span>
                          <Badge variant="secondary">{series.videos.length} 个视频</Badge>
                        </div>
                        <div className="ml-6 space-y-2">
                          {series.videos.map((video, vIndex) => (
                            <div
                              key={vIndex}
                              className="p-2 rounded-lg bg-muted/50 text-sm"
                            >
                              <div className="font-medium">{video.title}</div>
                              {video.description && (
                                <div className="text-muted-foreground text-xs truncate">
                                  {video.description}
                                </div>
                              )}
                              <div className="flex flex-wrap gap-1 mt-1">
                                {video.tags.map((tag, tIndex) => (
                                  <Badge key={tIndex} variant="outline" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
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
                  成功 {batchResults.filter(r => r.id).length}，失败 {batchResults.filter(r => r.error).length}
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
                          <Link href={`/v/${result.id}`}>
                            <Badge variant="secondary" className="text-xs">
                              {result.id}
                            </Badge>
                          </Link>
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
    </div>
  );
}
