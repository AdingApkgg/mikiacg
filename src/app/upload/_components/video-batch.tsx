"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/lib/toast-with-sound";
import { trpc } from "@/lib/trpc";
import { ChevronDown, Download, DownloadCloud, FileText, FileVideo, Image as ImageIcon, Layers, Loader2, Tag, Upload, User } from "lucide-react";

const PREVIEW_LIMIT = 50;
import { DropZone } from "./drop-zone";
import { BatchProgressBar, VideoBatchResults } from "./batch-results";
import { parseVideoBatchJson, downloadTemplate, VIDEO_BATCH_TEMPLATE } from "../_lib/parsers";
import type { ParsedBatchData, ParsedSeries, VideoBatchResult, BatchProgress } from "../_lib/types";

const CONCURRENCY = 3;
const CHUNK_SIZE = 200;

function chunkSeries(seriesList: ParsedSeries[]): ParsedSeries[] {
  const result: ParsedSeries[] = [];
  for (const s of seriesList) {
    if (s.videos.length <= CHUNK_SIZE) {
      result.push(s);
    } else {
      for (let i = 0; i < s.videos.length; i += CHUNK_SIZE) {
        result.push({
          ...s,
          seriesTitle: i === 0 ? s.seriesTitle : "",
          videos: s.videos.slice(i, i + CHUNK_SIZE),
        });
      }
    }
  }
  return result;
}

export function VideoBatchUpload() {
  const [parsed, setParsed] = useState<ParsedBatchData | null>(null);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<BatchProgress>({ current: 0, total: 0 });
  const [results, setResults] = useState<VideoBatchResult[]>([]);

  const batchCreate = trpc.video.batchCreate.useMutation();
  const { refetch: refetchSeries } = trpc.series.listByUser.useQuery({ limit: 50 }, { enabled: false });

  const handleFile = (file: File) => {
    if (!file.name.endsWith(".json")) {
      toast.error("请选择 JSON 文件");
      return;
    }
    setFileName(file.name);
    setParsed(null);
    setResults([]);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        const result = parseVideoBatchJson(data);
        if (result.totalVideos === 0) {
          toast.error("JSON 文件中未找到有效视频数据");
          return;
        }
        setParsed(result);
        toast.success(`解析成功：${result.series.length} 个合集，${result.totalVideos} 个视频`);
      } catch {
        toast.error("JSON 文件解析失败，请检查文件格式");
      }
    };
    reader.readAsText(file);
  };

  const importSeries = async (seriesList: ParsedSeries[]): Promise<VideoBatchResult[]> => {
    const allResults: VideoBatchResult[] = [];
    const queue = [...seriesList];
    let completed = 0;

    const processOne = async (): Promise<void> => {
      const series = queue.shift();
      if (!series) return;

      try {
        const res = await batchCreate.mutateAsync({
          seriesTitle: series.seriesTitle || undefined,
          seriesDescription: series.description || undefined,
          seriesCoverUrl: series.coverUrl || undefined,
          videos: series.videos.map((v) => ({
            title: v.title,
            description: v.description || undefined,
            coverUrl: v.coverUrl || "",
            videoUrl: v.videoUrl,
            tagNames: v.tags,
            ...(v.extraInfo ? { extraInfo: v.extraInfo as Record<string, unknown> } : {}),
          })),
        });
        allResults.push(...res.results.map((r) => ({
          title: r.title, seriesTitle: series.seriesTitle || undefined,
          id: r.id, error: r.error, merged: r.merged,
        })));
      } catch (error) {
        allResults.push(...series.videos.map((v) => ({
          title: v.title, seriesTitle: series.seriesTitle || undefined,
          error: error instanceof Error ? error.message : "未知错误",
        })));
      }

      completed++;
      setProgress({ current: completed, total: seriesList.length });
      setResults([...allResults]);
      await processOne();
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => processOne()),
    );
    return allResults;
  };

  const handleImport = async () => {
    if (!parsed || parsed.totalVideos === 0) return;
    setImporting(true);
    setResults([]);
    const chunks = chunkSeries(parsed.series);
    setProgress({ current: 0, total: chunks.length });

    try {
      const all = await importSeries(chunks);
      const success = all.filter(r => r.id).length;
      const merged = all.filter(r => r.merged).length;
      const fail = all.filter(r => r.error).length;
      toast.success(
        merged > 0
          ? `导入完成：${success} 条（其中 ${merged} 条已合并），${fail} 失败`
          : `导入完成：${success} 成功，${fail} 失败`,
      );
      setResults(all);
      refetchSeries();
    } finally {
      setImporting(false);
    }
  };

  const handleRetry = async () => {
    if (!parsed) return;
    const failedTitles = new Set(results.filter(r => r.error).map(r => r.title));
    const failedSeries: ParsedSeries[] = parsed.series
      .map(s => ({ ...s, videos: s.videos.filter(v => failedTitles.has(v.title)) }))
      .filter(s => s.videos.length > 0);
    if (failedSeries.length === 0) return;

    const chunks = chunkSeries(failedSeries);
    const prevOk = results.filter(r => r.id);
    setImporting(true);
    setProgress({ current: 0, total: chunks.length });

    try {
      const retried = await importSeries(chunks);
      const all = [...prevOk, ...retried];
      const newOk = retried.filter(r => r.id).length;
      const newFail = retried.filter(r => r.error).length;
      toast.success(`重试完成：${newOk} 成功，${newFail} 仍失败`);
      setResults(all);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            JSON 文件导入
          </CardTitle>
          <CardDescription>拖入或选择 JSON 文件，自动解析合集与视频并批量导入</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <DropZone
            id="video-batch-input"
            accept=".json"
            fileName={fileName}
            summary={parsed ? `${parsed.series.length} 个合集 · ${parsed.totalVideos} 个视频` : undefined}
            hint="支持 series 数组格式 或 扁平视频数组格式"
            onFile={handleFile}
            onClear={() => { setParsed(null); setFileName(""); setResults([]); }}
            hasData={!!parsed}
          />

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              onClick={handleImport}
              disabled={!parsed || parsed.totalVideos === 0 || importing}
            >
              {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              {importing
                ? `导入中 ${progress.current}/${progress.total}`
                : `开始导入${parsed ? ` (${parsed.totalVideos} 个视频)` : ""}`}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadTemplate(VIDEO_BATCH_TEMPLATE, "video-batch-template.json")}
            >
              <DownloadCloud className="h-4 w-4 mr-1" />
              下载模板
            </Button>
          </div>

          <BatchProgressBar progress={progress} label="合集" isActive={importing} />
        </CardContent>
      </Card>

      {/* 解析预览 */}
      {parsed && parsed.totalVideos > 0 && (
        <PreviewCard parsed={parsed} />
      )}

      <VideoBatchResults results={results} importing={importing} onRetry={handleRetry} />
    </div>
  );
}

function PreviewCard({ parsed }: { parsed: ParsedBatchData }) {
  const [showAll, setShowAll] = useState(false);
  const displaySeries = showAll ? parsed.series : parsed.series.slice(0, PREVIEW_LIMIT);
  const hiddenCount = parsed.series.length - PREVIEW_LIMIT;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">解析预览</CardTitle>
        <CardDescription>共 {parsed.series.length} 个合集，{parsed.totalVideos} 个视频</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className={parsed.series.length > 5 ? "h-[500px]" : ""}>
          <div className="space-y-4">
            {displaySeries.map((series, si) => (
              <div key={si} className="space-y-2 border rounded-lg p-3">
                <div className="flex items-start gap-3">
                  {series.coverUrl && (
                    <div className="shrink-0 w-16 h-10 rounded overflow-hidden bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={series.coverUrl} alt={series.seriesTitle || "封面"} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Layers className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-medium truncate">{series.seriesTitle || "无合集"}</span>
                      <Badge variant="secondary" className="text-xs shrink-0">{series.videos.length} 个视频</Badge>
                    </div>
                    {series.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{series.description}</p>
                    )}
                  </div>
                </div>
                <div className="ml-2 space-y-1.5">
                  {series.videos.slice(0, 20).map((video, vi) => (
                    <div key={vi} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-sm">
                      <span className="text-muted-foreground text-xs tabular-nums shrink-0 w-6 text-right">{vi + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{video.title}</div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <Badge variant={video.coverUrl ? "outline" : "secondary"} className="text-[10px] py-0">
                            {video.coverUrl ? <><ImageIcon className="h-2.5 w-2.5 mr-0.5" />自定义封面</> : <><FileVideo className="h-2.5 w-2.5 mr-0.5" />自动封面</>}
                          </Badge>
                          {video.extraInfo?.author && (
                            <span className="text-[10px] text-muted-foreground"><User className="h-2.5 w-2.5 inline mr-0.5" />{video.extraInfo.author}</span>
                          )}
                          {(video.extraInfo?.downloads?.length ?? 0) > 0 && (
                            <span className="text-[10px] text-muted-foreground"><Download className="h-2.5 w-2.5 inline mr-0.5" />{video.extraInfo!.downloads!.length} 下载</span>
                          )}
                          {video.tags.length > 0 && (
                            <span className="text-[10px] text-muted-foreground"><Tag className="h-2.5 w-2.5 inline mr-0.5" />{video.tags.length} 标签</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {series.videos.length > 20 && (
                    <div className="text-xs text-muted-foreground text-center py-1">
                      …还有 {series.videos.length - 20} 个视频未显示
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {!showAll && hiddenCount > 0 && (
            <div className="flex justify-center pt-3 pb-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAll(true)}>
                <ChevronDown className="h-4 w-4 mr-1" />
                显示全部（还有 {hiddenCount} 个合集）
              </Button>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
