"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, ChevronDown, RefreshCw, XCircle } from "lucide-react";
import Link from "next/link";
import type { BatchProgress } from "../_lib/types";

const PAGE_SIZE = 100;

// ==================== 进度条 ====================

interface BatchProgressBarProps {
  progress: BatchProgress;
  label?: string;
  isActive: boolean;
}

export function BatchProgressBar({ progress, label = "批", isActive }: BatchProgressBarProps) {
  if (!isActive || progress.total === 0) return null;
  const pct = (progress.current / progress.total) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">正在导入...</span>
        <span className="font-medium tabular-nums">{progress.current}/{progress.total} {label}</span>
      </div>
      <Progress value={pct} />
    </div>
  );
}

// ==================== 视频结果 ====================

interface VideoResult {
  title: string;
  seriesTitle?: string;
  id?: string;
  error?: string;
  merged?: boolean;
}

interface VideoBatchResultsProps {
  results: VideoResult[];
  importing: boolean;
  onRetry?: () => void;
}

export function VideoBatchResults({ results, importing, onRetry }: VideoBatchResultsProps) {
  if (results.length === 0) return null;

  const successCount = results.filter(r => r.id).length;
  const mergedCount = results.filter(r => r.merged).length;
  const failCount = results.filter(r => r.error).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">导入结果</CardTitle>
            <CardDescription>
              成功 {successCount}
              {mergedCount > 0 && `（已合并 ${mergedCount}）`}
              ，失败 {failCount}
            </CardDescription>
          </div>
          {failCount > 0 && !importing && onRetry && (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="h-4 w-4 mr-1" />
              重试失败 ({failCount})
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ResultTabs
          results={results}
          renderItem={(r, i) => (
            <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 min-w-0">
                {r.id ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                <div className="min-w-0">
                  <div className="truncate text-sm">{r.title}</div>
                  {r.seriesTitle && <div className="text-xs text-muted-foreground">{r.seriesTitle}</div>}
                </div>
              </div>
              {r.id ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  {r.merged && <Badge variant="outline" className="text-xs">已合并</Badge>}
                  <Link href={`/video/${r.id}`}><Badge variant="secondary" className="text-xs">{r.id}</Badge></Link>
                </div>
              ) : (
                <Badge variant="destructive" className="text-xs max-w-[200px] truncate">{r.error}</Badge>
              )}
            </div>
          )}
        />
      </CardContent>
    </Card>
  );
}

// ==================== 游戏结果 ====================

interface GameResult {
  title: string;
  id?: string;
  error?: string;
  updated?: boolean;
}

interface GameBatchResultsProps {
  results: GameResult[];
  importing: boolean;
  onRetry?: () => void;
}

export function GameBatchResults({ results, importing, onRetry }: GameBatchResultsProps) {
  if (results.length === 0) return null;

  const newCount = results.filter(r => r.id && !r.updated).length;
  const updatedCount = results.filter(r => r.updated).length;
  const failCount = results.filter(r => r.error).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">导入结果</CardTitle>
            <CardDescription>新建 {newCount}，更新 {updatedCount}，失败 {failCount}</CardDescription>
          </div>
          {failCount > 0 && !importing && onRetry && (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="h-4 w-4 mr-1" />
              重试失败 ({failCount})
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ResultTabs
          results={results}
          renderItem={(r, i) => (
            <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 min-w-0">
                {r.id ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                <span className="truncate text-sm">{r.title}</span>
              </div>
              {r.id ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  {r.updated && <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-400">已更新</Badge>}
                  <Link href={`/game/${r.id}`}><Badge variant="secondary" className="text-xs">{r.id}</Badge></Link>
                </div>
              ) : (
                <Badge variant="destructive" className="text-xs max-w-[200px] truncate">{r.error}</Badge>
              )}
            </div>
          )}
        />
      </CardContent>
    </Card>
  );
}

// ==================== 图片结果 ====================

interface ImageResult {
  title: string;
  id?: string;
  error?: string;
  updated?: boolean;
}

interface ImageBatchResultsProps {
  results: ImageResult[];
  importing: boolean;
  onRetry?: () => void;
}

export function ImageBatchResults({ results, importing, onRetry }: ImageBatchResultsProps) {
  if (results.length === 0) return null;

  const newCount = results.filter(r => r.id && !r.updated).length;
  const updatedCount = results.filter(r => r.updated).length;
  const failCount = results.filter(r => r.error).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">导入结果</CardTitle>
            <CardDescription>新建 {newCount}，更新 {updatedCount}，失败 {failCount}</CardDescription>
          </div>
          {failCount > 0 && !importing && onRetry && (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="h-4 w-4 mr-1" />
              重试失败 ({failCount})
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ResultTabs
          results={results}
          renderItem={(r, i) => (
            <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 min-w-0">
                {r.id ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                <span className="truncate text-sm">{r.title}</span>
              </div>
              {r.id ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  {r.updated && <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-400">已更新</Badge>}
                  <Link href={`/image/${r.id}`}><Badge variant="secondary" className="text-xs">{r.id}</Badge></Link>
                </div>
              ) : (
                <Badge variant="destructive" className="text-xs max-w-[200px] truncate">{r.error}</Badge>
              )}
            </div>
          )}
        />
      </CardContent>
    </Card>
  );
}

// ==================== 通用结果标签页 ====================

interface ResultTabsProps<T extends { id?: string; error?: string }> {
  results: T[];
  renderItem: (result: T, index: number) => React.ReactNode;
}

function ResultTabs<T extends { id?: string; error?: string }>({ results, renderItem }: ResultTabsProps<T>) {
  const successList = results.filter(r => r.id);
  const failedList = results.filter(r => r.error);

  return (
    <Tabs defaultValue="all" className="w-full">
      <TabsList className="mb-3 h-8">
        <TabsTrigger value="all" className="text-xs h-7 px-2.5">全部 ({results.length})</TabsTrigger>
        <TabsTrigger value="success" className="text-xs h-7 px-2.5">成功 ({successList.length})</TabsTrigger>
        {failedList.length > 0 && (
          <TabsTrigger value="failed" className="text-xs h-7 px-2.5">失败 ({failedList.length})</TabsTrigger>
        )}
      </TabsList>
      {(["all", "success", "failed"] as const).map(tab => (
        <TabsContent key={tab} value={tab}>
          <PaginatedList
            items={tab === "all" ? results : tab === "success" ? successList : failedList}
            renderItem={renderItem}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function PaginatedList<T>({ items, renderItem }: { items: T[]; renderItem: (item: T, index: number) => React.ReactNode }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visible = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  return (
    <div>
      <ScrollArea className={items.length > 10 ? "h-[400px]" : ""}>
        <div className="space-y-2">
          {visible.map(renderItem)}
        </div>
        {hasMore && (
          <div className="flex justify-center pt-3 pb-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
            >
              <ChevronDown className="h-4 w-4 mr-1" />
              加载更多（已显示 {visibleCount}/{items.length}）
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
