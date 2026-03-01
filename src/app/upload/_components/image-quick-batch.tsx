"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/lib/toast-with-sound";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { TagPicker } from "./tag-picker";
import { BatchProgressBar, ImageBatchResults } from "./batch-results";
import type { TagItem, ImageBatchResult, BatchProgress } from "../_lib/types";
import {
  ChevronDown, ChevronUp, GripVertical,
  Image as ImageIcon, Loader2, Plus, Trash2, Upload,
} from "lucide-react";

interface ImageEntry {
  id: string;
  title: string;
  description: string;
  images: string[];
  expanded: boolean;
}

let entryCounter = 0;
function createImageEntry(): ImageEntry {
  return {
    id: `img-${++entryCounter}`,
    title: "", description: "",
    images: [""],
    expanded: true,
  };
}

export function ImageQuickBatch() {
  const [entries, setEntries] = useState<ImageEntry[]>([createImageEntry()]);
  const [selectedTags, setSelectedTags] = useState<TagItem[]>([]);
  const [newTags, setNewTags] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<BatchProgress>({ current: 0, total: 0 });
  const [results, setResults] = useState<ImageBatchResult[]>([]);

  const { data: allTags } = trpc.tag.list.useQuery({ limit: 100 });
  const batchCreate = trpc.image.batchCreate.useMutation();

  const toggleTag = (tag: TagItem) => {
    const exists = selectedTags.find(t => t.id === tag.id);
    if (exists) setSelectedTags(selectedTags.filter(t => t.id !== tag.id));
    else if (selectedTags.length + newTags.length < 10) setSelectedTags([...selectedTags, tag]);
  };

  const validEntries = entries.filter(e => e.title.trim() && e.images.some(u => u.trim()));

  const updateEntry = (id: string, updates: Partial<ImageEntry>) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  const removeEntry = (id: string) => {
    setEntries(prev => {
      const next = prev.filter(e => e.id !== id);
      return next.length === 0 ? [createImageEntry()] : next;
    });
  };

  const addEntry = () => {
    setEntries(prev => {
      const collapsed = prev.map(e => ({ ...e, expanded: false }));
      return [...collapsed, createImageEntry()];
    });
  };

  const toggleExpand = (id: string) => {
    updateEntry(id, { expanded: !entries.find(e => e.id === id)?.expanded });
  };

  const updateImage = (entryId: string, idx: number, value: string) => {
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;
    const imgs = [...entry.images];
    imgs[idx] = value;
    updateEntry(entryId, { images: imgs });
  };

  const addImage = (entryId: string) => {
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;
    updateEntry(entryId, { images: [...entry.images, ""] });
  };

  const removeImage = (entryId: string, idx: number) => {
    const entry = entries.find(e => e.id === entryId);
    if (!entry || entry.images.length <= 1) return;
    updateEntry(entryId, { images: entry.images.filter((_, i) => i !== idx) });
  };

  const handleSubmit = async () => {
    if (validEntries.length === 0) {
      toast.error("至少需要一个图片帖（含标题和图片链接）");
      return;
    }

    setImporting(true);
    setResults([]);
    const CHUNK = 100;
    const totalChunks = Math.ceil(validEntries.length / CHUNK);
    setProgress({ current: 0, total: totalChunks });
    const allResults: ImageBatchResult[] = [];

    try {
      for (let i = 0; i < totalChunks; i++) {
        const chunk = validEntries.slice(i * CHUNK, (i + 1) * CHUNK);
        try {
          const res = await batchCreate.mutateAsync({
            posts: chunk.map(e => ({
              title: e.title.trim(),
              description: e.description.trim() || undefined,
              images: e.images.filter(u => u.trim()),
              tagNames: [...selectedTags.map(t => t.name), ...newTags],
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

      const newC = allResults.filter(r => r.id && !r.updated).length;
      const updC = allResults.filter(r => r.updated).length;
      const failC = allResults.filter(r => r.error).length;
      toast.success(`发布完成：新建 ${newC}${updC ? `，更新 ${updC}` : ""}${failC ? `，失败 ${failC}` : ""}`);

      if (failC === 0) setEntries([createImageEntry()]);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                图片列表
              </CardTitle>
              <CardDescription>
                {validEntries.length > 0
                  ? `已添加 ${validEntries.length} 个图片帖`
                  : "逐条添加图片帖信息"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <ScrollArea className={entries.length > 3 ? "h-[600px]" : ""}>
            <div className="space-y-3">
              {entries.map((entry, index) => (
                <div
                  key={entry.id}
                  className={cn(
                    "group rounded-lg border transition-colors",
                    entry.title.trim() ? "bg-card" : "bg-muted/20 border-dashed",
                  )}
                >
                  {/* Header */}
                  <div
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg"
                    onClick={() => toggleExpand(entry.id)}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                    <span className="text-sm font-medium text-muted-foreground tabular-nums w-5 text-right shrink-0">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      {entry.title.trim() ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{entry.title}</span>
                          {entry.images.filter(u => u.trim()).length > 0 && (
                            <Badge variant="secondary" className="text-[10px] py-0">
                              <ImageIcon className="h-2.5 w-2.5 mr-0.5" />
                              {entry.images.filter(u => u.trim()).length} 张
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">未填写</span>
                      )}
                    </div>
                    {entry.expanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                    <Button
                      type="button" variant="ghost" size="icon"
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                      onClick={(e) => { e.stopPropagation(); removeEntry(entry.id); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Expanded */}
                  {entry.expanded && (
                    <div className="px-3 pb-3 space-y-3 border-t">
                      <div className="pt-3 space-y-3">
                        <Input
                          placeholder="图片标题 *"
                          value={entry.title}
                          onChange={(e) => updateEntry(entry.id, { title: e.target.value })}
                          className={cn("text-base", !entry.title.trim() && "border-yellow-400")}
                          autoFocus={!entry.title.trim()}
                        />

                        <Textarea
                          placeholder="图片描述（可选）"
                          value={entry.description}
                          onChange={(e) => updateEntry(entry.id, { description: e.target.value })}
                          className="min-h-[60px] resize-none text-sm"
                        />

                        {/* Image URLs */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium flex items-center gap-1.5">
                              <ImageIcon className="h-4 w-4" />
                              图片链接
                            </span>
                            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => addImage(entry.id)}>
                              <Plus className="h-3 w-3 mr-1" />添加
                            </Button>
                          </div>
                          {entry.images.map((url, i) => (
                            <div key={i} className="flex gap-2 items-center">
                              <div className="relative flex-1">
                                <ImageIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                <Input
                                  placeholder="https://example.com/image.jpg"
                                  value={url}
                                  onChange={(e) => updateImage(entry.id, i, e.target.value)}
                                  className="h-8 text-xs pl-8"
                                />
                              </div>
                              {entry.images.length > 1 && (
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeImage(entry.id, i)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          ))}
                          {/* Inline preview */}
                          {entry.images.filter(u => u.trim()).length > 0 && (
                            <div className="flex gap-1.5 flex-wrap mt-1">
                              {entry.images.filter(u => u.trim()).map((url, i) => (
                                <div key={i} className="w-12 h-12 rounded border overflow-hidden bg-muted">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt={`预览 ${i + 1}`} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>

          <Button type="button" variant="outline" size="sm" onClick={addEntry}>
            <Plus className="h-4 w-4 mr-1" />
            添加图片帖
          </Button>
        </CardContent>
      </Card>

      <TagPicker
        allTags={allTags}
        selectedTags={selectedTags}
        newTags={newTags}
        onToggleTag={toggleTag}
        onAddNewTag={(name) => setNewTags([...newTags, name])}
        onRemoveNewTag={(name) => setNewTags(newTags.filter(t => t !== name))}
      />

      <Card className="border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              {validEntries.length > 0 ? (
                <span>
                  共 <strong className="text-foreground">{validEntries.length}</strong> 个图片帖
                  {(selectedTags.length + newTags.length) > 0 && (
                    <span className="ml-1">· {selectedTags.length + newTags.length} 个标签</span>
                  )}
                </span>
              ) : "请先添加图片帖"}
            </div>
            <Button
              type="button"
              size="lg"
              className="min-w-[160px]"
              onClick={handleSubmit}
              disabled={validEntries.length === 0 || importing}
            >
              {importing ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" />发布中...</>
              ) : (
                <><Upload className="mr-2 h-5 w-5" />批量发布 ({validEntries.length})</>
              )}
            </Button>
          </div>
          <BatchProgressBar progress={progress} label="批" isActive={importing} />
        </CardContent>
      </Card>

      <ImageBatchResults results={results} importing={importing} />
    </div>
  );
}
