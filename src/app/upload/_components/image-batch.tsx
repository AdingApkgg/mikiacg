"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/lib/toast-with-sound";
import { trpc } from "@/lib/trpc";
import { ChevronDown, DownloadCloud, FileText, Image as ImageIcon, Loader2, Tag, Upload } from "lucide-react";
import { DropZone } from "./drop-zone";
import { BatchProgressBar, ImageBatchResults } from "./batch-results";
import { parseImageBatchJson, downloadTemplate, IMAGE_BATCH_TEMPLATE } from "../_lib/parsers";
import type { ParsedImageBatchData, ParsedImagePost, ImageBatchResult, BatchProgress } from "../_lib/types";

const CHUNK_SIZE = 100;
const PREVIEW_LIMIT = 100;

export function ImageBatchUpload() {
  const [parsed, setParsed] = useState<ParsedImageBatchData | null>(null);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<BatchProgress>({ current: 0, total: 0 });
  const [results, setResults] = useState<ImageBatchResult[]>([]);

  const batchCreate = trpc.image.batchCreate.useMutation();

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
        const result = parseImageBatchJson(data);
        if (result.posts.length === 0 || !result.posts[0].title) {
          toast.error("JSON 文件中未找到有效图片数据");
          return;
        }
        setParsed(result);
        toast.success(`解析成功：${result.posts.length} 个图片帖`);
      } catch {
        toast.error("JSON 文件解析失败，请检查文件格式");
      }
    };
    reader.readAsText(file);
  };

  const importPosts = async (posts: ParsedImagePost[], prevResults: ImageBatchResult[] = []): Promise<ImageBatchResult[]> => {
    const totalChunks = Math.ceil(posts.length / CHUNK_SIZE);
    setProgress({ current: 0, total: totalChunks });
    const allResults: ImageBatchResult[] = [...prevResults];

    for (let i = 0; i < totalChunks; i++) {
      const chunk = posts.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      try {
        const res = await batchCreate.mutateAsync({
          posts: chunk.map((p) => ({
            title: p.title,
            description: p.description || undefined,
            images: p.images.filter(u => u.trim()),
            tagNames: p.tags?.length > 0 ? p.tags : undefined,
          })),
        });
        allResults.push(...res.results);
      } catch (err) {
        allResults.push(...chunk.map(p => ({
          title: p.title,
          error: err instanceof Error ? err.message : "未知错误",
        })));
      }
      setProgress({ current: i + 1, total: totalChunks });
      setResults([...allResults]);
    }

    return allResults;
  };

  const handleImport = async () => {
    if (!parsed || parsed.posts.length === 0) return;
    setImporting(true);
    setResults([]);

    try {
      const all = await importPosts(parsed.posts);
      const newC = all.filter(r => r.id && !r.updated).length;
      const updC = all.filter(r => r.updated).length;
      const failC = all.filter(r => r.error).length;
      toast.success(`导入完成：新建 ${newC}，更新 ${updC}，失败 ${failC}`);
      setResults(all);
    } finally {
      setImporting(false);
    }
  };

  const handleRetry = async () => {
    if (!parsed) return;
    const failedTitles = new Set(results.filter(r => r.error).map(r => r.title));
    const failedPosts = parsed.posts.filter(p => failedTitles.has(p.title));
    if (failedPosts.length === 0) return;

    const prevOk = results.filter(r => r.id);
    setImporting(true);

    try {
      const all = await importPosts(failedPosts, prevOk);
      const newOk = all.filter(r => r.id).length - prevOk.length;
      const newFail = all.filter(r => r.error).length;
      toast.success(`重试完成：${newOk} 成功，${newFail} 仍失败`);
      setResults(all);
    } finally {
      setImporting(false);
    }
  };

  const totalChunks = parsed ? Math.ceil(parsed.posts.length / CHUNK_SIZE) : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            批量导入图片帖
          </CardTitle>
          <CardDescription>
            拖入或选择 JSON 文件批量导入图片帖（每 {CHUNK_SIZE} 个一批，自动分块处理）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <DropZone
            id="image-batch-input"
            accept=".json"
            fileName={fileName}
            summary={parsed ? `${parsed.posts.length} 个图片帖` : undefined}
            hint="JSON 数组格式，每项包含 title, images, tagNames 等"
            onFile={handleFile}
            onClear={() => { setParsed(null); setFileName(""); setResults([]); }}
            hasData={!!parsed}
          />

          <div className="flex items-center gap-2 flex-wrap">
            <Button type="button" onClick={handleImport} disabled={!parsed || parsed.posts.length === 0 || importing}>
              {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              {importing
                ? `导入中 ${progress.current}/${progress.total}`
                : `开始导入${parsed ? ` (${parsed.posts.length} 个图片帖)` : ""}`}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadTemplate(IMAGE_BATCH_TEMPLATE, "image-batch-template.json")}
            >
              <DownloadCloud className="h-4 w-4 mr-1" />
              下载模板
            </Button>
          </div>

          <BatchProgressBar progress={progress} label="批" isActive={importing} />
        </CardContent>
      </Card>

      {/* Preview */}
      {parsed && parsed.posts.length > 0 && (
        <ImagePreviewCard parsed={parsed} totalChunks={totalChunks} />
      )}

      <ImageBatchResults results={results} importing={importing} onRetry={handleRetry} />
    </div>
  );
}

function ImagePreviewCard({ parsed, totalChunks }: { parsed: ParsedImageBatchData; totalChunks: number }) {
  const [visibleCount, setVisibleCount] = useState(PREVIEW_LIMIT);
  const displayPosts = parsed.posts.slice(0, visibleCount);
  const hasMore = visibleCount < parsed.posts.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">解析预览</CardTitle>
        <CardDescription>
          共 {parsed.posts.length} 个图片帖{totalChunks > 1 ? `，将分 ${totalChunks} 批处理` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className={parsed.posts.length > 8 ? "h-[500px]" : ""}>
          <div className="space-y-2">
            {displayPosts.map((post, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                {post.images[0] && (
                  <div className="shrink-0 w-10 h-10 rounded overflow-hidden bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={post.images[0]} alt={post.title} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs tabular-nums shrink-0 w-6 text-right">{i + 1}</span>
                    <span className="font-medium truncate">{post.title}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap ml-8">
                    <Badge variant="secondary" className="text-[10px] py-0">
                      <ImageIcon className="h-2.5 w-2.5 mr-0.5" />{post.images.length} 张
                    </Badge>
                    {post.tags?.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        <Tag className="h-2.5 w-2.5 inline mr-0.5" />{post.tags.length} 标签
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-3 pb-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVisibleCount(prev => prev + PREVIEW_LIMIT)}
              >
                <ChevronDown className="h-4 w-4 mr-1" />
                加载更多（已显示 {visibleCount}/{parsed.posts.length}）
              </Button>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
