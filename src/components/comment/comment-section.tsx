"use client";

import { useState, useCallback, useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageSquare, ArrowUpDown, User } from "lucide-react";
import { toast } from "sonner";
import { CommentItem } from "./comment-item";
import { parseDeviceInfo, getHighEntropyDeviceInfo, mergeDeviceInfo, type DeviceInfo } from "@/lib/device-info";
import { useIsMounted } from "@/components/motion";

interface CommentSectionProps {
  videoId: string;
}

type SortType = "newest" | "oldest" | "popular";

export function CommentSection({ videoId }: CommentSectionProps) {
  const { data: session } = useSession();
  const [sort, setSort] = useState<SortType>("newest");
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isMounted = useIsMounted();
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  
  // 访客信息
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestWebsite, setGuestWebsite] = useState("");

  const utils = trpc.useUtils();

  // 初始化设备信息（包括高精度版本获取）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const init = async () => {
      // 先获取基础设备信息
      const baseInfo = parseDeviceInfo(navigator.userAgent, {
        platform: navigator.platform || null,
        language: navigator.language || null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        screen: `${window.screen.width}x${window.screen.height}`,
        pixelRatio: window.devicePixelRatio || null,
      });
      
      // 尝试获取高精度信息（真实 OS 版本等）
      const highEntropyInfo = await getHighEntropyDeviceInfo();
      const mergedInfo = mergeDeviceInfo(baseInfo, highEntropyInfo);
      
      setDeviceInfo(mergedInfo);
    };
    init();
  }, []);

  // 获取评论数量
  const { data: commentCount } = trpc.comment.getCount.useQuery({ videoId });

  // 获取评论列表
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.comment.list.useInfiniteQuery(
    { videoId, sort, limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  // 发表评论
  const createMutation = trpc.comment.create.useMutation({
    onSuccess: () => {
      setNewComment("");
      utils.comment.list.invalidate({ videoId });
      utils.comment.getCount.invalidate({ videoId });
      toast.success("评论发表成功");
    },
    onError: (error) => {
      toast.error(error.message || "发表失败");
    },
    onSettled: () => {
      setIsSubmitting(false);
    },
  });

  const handleSubmit = useCallback(async () => {
    if (!newComment.trim() || isSubmitting) return;
    
    // 如果不是登录用户，验证昵称
    if (!session && !guestName.trim()) {
      toast.error("请填写昵称");
      return;
    }
    
    setIsSubmitting(true);
    
    // 如果设备信息还没有获取到高精度版本，重新获取一次
    let currentDeviceInfo = deviceInfo;
    if (!currentDeviceInfo || currentDeviceInfo.osVersion === "10.15.7") {
      console.log("[Comment] deviceInfo may be stale, re-fetching...");
      const baseInfo = parseDeviceInfo(navigator.userAgent, {
        platform: navigator.platform || null,
        language: navigator.language || null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        screen: `${window.screen.width}x${window.screen.height}`,
        pixelRatio: window.devicePixelRatio || null,
      });
      const highEntropyInfo = await getHighEntropyDeviceInfo();
      currentDeviceInfo = mergeDeviceInfo(baseInfo, highEntropyInfo);
      setDeviceInfo(currentDeviceInfo);
    }
    
    console.log("[Comment] Submitting with deviceInfo:", currentDeviceInfo);
    
    createMutation.mutate({ 
      videoId, 
      content: newComment.trim(),
      deviceInfo: currentDeviceInfo || undefined,
      // 访客信息（仅匿名评论时传递）
      ...(session ? {} : {
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim() || undefined,
        guestWebsite: guestWebsite.trim() || undefined,
      }),
    });
  }, [newComment, isSubmitting, createMutation, videoId, deviceInfo, session, guestName, guestEmail, guestWebsite]);

  const comments = data?.pages.flatMap((page) => page.comments) ?? [];

  return (
    <div className="space-y-6">
      {/* 标题和排序 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          <h3 className="text-lg font-semibold">
            {commentCount !== undefined ? `${commentCount} 条评论` : "评论"}
          </h3>
        </div>
{isMounted ? (
          <Select value={sort} onValueChange={(v) => setSort(v as SortType)}>
            <SelectTrigger className="w-32">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">最新</SelectItem>
              <SelectItem value="oldest">最早</SelectItem>
              <SelectItem value="popular">最热</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Skeleton className="h-9 w-32" />
        )}
      </div>

      {/* 评论输入框 - 挂载前用固定占位避免 hydration 不一致 */}
      <div className="flex gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          {!isMounted ? (
            <AvatarFallback>U</AvatarFallback>
          ) : session ? (
            <>
              <AvatarImage src={session.user?.image || undefined} />
              <AvatarFallback>
                {(session.user?.name?.trim() || "").charAt(0).toUpperCase() || "U"}
              </AvatarFallback>
            </>
          ) : (
            <AvatarFallback>
              <User className="h-5 w-5" />
            </AvatarFallback>
          )}
        </Avatar>
        <div className="flex-1 space-y-3">
          {/* 访客信息表单（未登录时显示） */}
          {!session && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="guest-name" className="text-xs">
                  昵称 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="guest-name"
                  placeholder="必填"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  maxLength={50}
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="guest-email" className="text-xs">
                  邮箱
                </Label>
                <Input
                  id="guest-email"
                  type="email"
                  placeholder="可选，用于显示头像"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="guest-website" className="text-xs">
                  网址
                </Label>
                <Input
                  id="guest-website"
                  type="url"
                  placeholder="可选，https://..."
                  value={guestWebsite}
                  onChange={(e) => setGuestWebsite(e.target.value)}
                  className="h-8"
                />
              </div>
            </div>
          )}
          <Textarea
            placeholder="添加评论..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="min-h-[80px] resize-none"
            maxLength={2000}
          />
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              {newComment.length}/2000
            </span>
            <div className="flex gap-2">
              {newComment && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setNewComment("")}
                >
                  取消
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!newComment.trim() || isSubmitting || (!session && !guestName.trim())}
              >
                {isSubmitting ? "发表中..." : "发表评论"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 评论列表 */}
      <div className="space-y-4">
        {isLoading ? (
          // 加载骨架屏
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          ))
        ) : comments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            暂无评论，来发表第一条评论吧
          </div>
        ) : (
          <>
            {comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                videoId={videoId}
              />
            ))}
            {hasNextPage && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? "加载中..." : "加载更多评论"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
