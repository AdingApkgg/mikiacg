"use client";

import { useState, useCallback } from "react";
import { useSession } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  MoreVertical,
  Edit,
  Trash2,
  Pin,
  ChevronDown,
  ChevronUp,
  MapPin,
  Smartphone,
  Monitor,
  Tablet,
  Chrome,
  Languages,
  Clock,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatRelativeTime } from "@/lib/format";
import { toast } from "sonner";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getAvatarUrlClient } from "@/lib/avatar";

interface CommentUser {
  id: string;
  username: string;
  nickname: string | null;
  avatar?: string | null;
  role?: "USER" | "ADMIN" | "OWNER";
}

interface ReplyToUser {
  id: string;
  username: string;
  nickname: string | null;
}

interface CommentData {
  id: string;
  content: string;
  userId: string | null;
  likes: number;
  dislikes: number;
  isEdited: boolean;
  isPinned: boolean;
  createdAt: Date;
  user: CommentUser | null;
  replyToUser?: ReplyToUser | null;
  userReaction: boolean | null;
  _count?: { replies: number };
  ipv4Location?: string | null;
  ipv6Location?: string | null;
  deviceInfo?: unknown;
  // 访客信息
  guestName?: string | null;
  guestEmail?: string | null;
  guestWebsite?: string | null;
}

interface CommentItemProps {
  comment: CommentData;
  videoId: string;
  parentId?: string; // 顶级评论 ID（用于回复的回复）
  isReply?: boolean;
  onReplyToComment?: (user: CommentUser) => void; // 回调：回复此评论
}

export function CommentItem({ 
  comment, 
  videoId, 
  parentId,
  isReply = false,
  onReplyToComment,
}: CommentItemProps) {
  const { data: session } = useSession();
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [editContent, setEditContent] = useState(comment.content);
  const [showReplies, setShowReplies] = useState(false);
  const [localLikes, setLocalLikes] = useState(comment.likes);
  const [localDislikes, setLocalDislikes] = useState(comment.dislikes);
  const [localReaction, setLocalReaction] = useState<boolean | null>(comment.userReaction);
  const [replyToUser, setReplyToUser] = useState<CommentUser | null>(null);

  const utils = trpc.useUtils();
  const isOwner = comment.userId && session?.user?.id === comment.userId;
  const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "OWNER";
  const replyCount = comment._count?.replies ?? 0;
  
  // 实际的顶级评论 ID
  const topLevelParentId = parentId || comment.id;

  // 获取回复
  const {
    data: repliesData,
    fetchNextPage: fetchMoreReplies,
    hasNextPage: hasMoreReplies,
    isFetchingNextPage: isFetchingReplies,
  } = trpc.comment.getReplies.useInfiniteQuery(
    { commentId: comment.id, limit: 10 },
    {
      enabled: showReplies && !isReply,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  const replies = repliesData?.pages.flatMap((page) => page.replies) ?? [];

  // 点赞/踩
  const reactMutation = trpc.comment.react.useMutation({
    onMutate: async ({ isLike }) => {
      // 乐观更新
      const prevReaction = localReaction;
      setLocalReaction(isLike);
      
      if (isLike === null) {
        // 取消反应
        if (prevReaction === true) setLocalLikes((l) => l - 1);
        if (prevReaction === false) setLocalDislikes((d) => d - 1);
      } else if (prevReaction === null) {
        // 新反应
        if (isLike) setLocalLikes((l) => l + 1);
        else setLocalDislikes((d) => d + 1);
      } else if (prevReaction !== isLike) {
        // 切换反应
        if (isLike) {
          setLocalLikes((l) => l + 1);
          setLocalDislikes((d) => d - 1);
        } else {
          setLocalLikes((l) => l - 1);
          setLocalDislikes((d) => d + 1);
        }
      }
    },
    onError: () => {
      // 回滚
      setLocalLikes(comment.likes);
      setLocalDislikes(comment.dislikes);
      setLocalReaction(comment.userReaction);
      toast.error("操作失败");
    },
  });

  // 发表回复
  const createReplyMutation = trpc.comment.create.useMutation({
    onSuccess: () => {
      setReplyContent("");
      setIsReplying(false);
      setReplyToUser(null);
      setShowReplies(true);
      utils.comment.getReplies.invalidate({ commentId: topLevelParentId });
      utils.comment.list.invalidate({ videoId });
      toast.success("回复成功");
    },
    onError: (error) => {
      toast.error(error.message || "回复失败");
    },
  });

  // 编辑评论
  const updateMutation = trpc.comment.update.useMutation({
    onSuccess: () => {
      setIsEditing(false);
      utils.comment.list.invalidate({ videoId });
      utils.comment.getReplies.invalidate();
      toast.success("编辑成功");
    },
    onError: (error) => {
      toast.error(error.message || "编辑失败");
    },
  });

  // 删除评论
  const deleteMutation = trpc.comment.delete.useMutation({
    onSuccess: () => {
      utils.comment.list.invalidate({ videoId });
      utils.comment.getReplies.invalidate();
      utils.comment.getCount.invalidate({ videoId });
      toast.success("删除成功");
    },
    onError: (error) => {
      toast.error(error.message || "删除失败");
    },
  });

  // 置顶评论
  const pinMutation = trpc.comment.pin.useMutation({
    onSuccess: () => {
      utils.comment.list.invalidate({ videoId });
      toast.success(comment.isPinned ? "已取消置顶" : "已置顶");
    },
    onError: (error) => {
      toast.error(error.message || "操作失败");
    },
  });

  const handleReact = useCallback(
    (isLike: boolean) => {
      if (!session) {
        toast.error("请先登录");
        return;
      }
      const newReaction = localReaction === isLike ? null : isLike;
      reactMutation.mutate({ commentId: comment.id, isLike: newReaction });
    },
    [session, localReaction, reactMutation, comment.id]
  );

  const handleReply = useCallback(() => {
    if (!replyContent.trim()) return;
    // 确定回复目标用户（访客评论没有 userId）
    const targetUserId = replyToUser?.id || comment.user?.id;
    createReplyMutation.mutate({
      videoId,
      content: replyContent.trim(),
      parentId: topLevelParentId,
      replyToUserId: targetUserId,
    });
  }, [replyContent, createReplyMutation, videoId, topLevelParentId, replyToUser, comment.user?.id]);

  // 开始回复（顶级评论或回复的回复）- 仅登录用户可以回复
  const startReply = useCallback((targetUser?: CommentUser) => {
    if (!session) {
      toast.error("登录后才能回复评论");
      return;
    }
    if (isReply && onReplyToComment && comment.user) {
      // 如果是回复登录用户的评论，通知父组件处理
      onReplyToComment(comment.user);
    } else {
      // 顶级评论或访客评论，在当前组件处理
      setReplyToUser(targetUser || null);
      setIsReplying(true);
    }
  }, [session, isReply, onReplyToComment, comment.user]);

  const handleEdit = useCallback(() => {
    if (!editContent.trim()) return;
    updateMutation.mutate({ id: comment.id, content: editContent.trim() });
  }, [editContent, updateMutation, comment.id]);

  // 判断是否是访客评论
  const isGuest = !comment.user;
  const displayName = isGuest 
    ? (comment.guestName || "访客") 
    : (comment.user?.nickname || comment.user?.username || "用户");
  // 头像 fallback 固定单字符，避免服务端/客户端不一致导致 hydration 报错
  const avatarFallbackChar = ((displayName || "用").trim() || "用").charAt(0).toUpperCase();
  
  // 访客头像（支持 QQ 邮箱和 WeAvatar）
  const guestAvatarUrl = getAvatarUrlClient(comment.guestEmail);
  const normalizedDeviceInfo = (() => {
    if (!comment.deviceInfo || typeof comment.deviceInfo !== "object") return null;
    if (Array.isArray(comment.deviceInfo)) return null;
    return comment.deviceInfo as {
      deviceType?: string | null;
      os?: string | null;
      osVersion?: string | null;
      browser?: string | null;
      browserVersion?: string | null;
      brand?: string | null;
      model?: string | null;
      platform?: string | null;
      language?: string | null;
      timezone?: string | null;
      screen?: string | null;
      pixelRatio?: number | null;
    };
  })();
  // 设备图标
  const DeviceIcon = (() => {
    if (!normalizedDeviceInfo?.deviceType) return Monitor;
    switch (normalizedDeviceInfo.deviceType.toLowerCase()) {
      case "mobile": return Smartphone;
      case "tablet": return Tablet;
      default: return Monitor;
    }
  })();

  // 系统信息
  const osInfo = (() => {
    if (!normalizedDeviceInfo?.os) return null;
    return [normalizedDeviceInfo.os, normalizedDeviceInfo.osVersion].filter(Boolean).join(" ");
  })();

  // 浏览器信息
  const browserInfo = (() => {
    if (!normalizedDeviceInfo?.browser) return null;
    return [normalizedDeviceInfo.browser, normalizedDeviceInfo.browserVersion].filter(Boolean).join(" ");
  })();

  // 语言信息
  const languageInfo = normalizedDeviceInfo?.language || null;

  // 时区信息
  const timezoneInfo = normalizedDeviceInfo?.timezone || null;

  // IP 定位（优先 IPv6，其次 IPv4）
  const locationInfo = comment.ipv6Location || comment.ipv4Location || null;
  const locationLabel = comment.ipv6Location ? "IPv6" : comment.ipv4Location ? "IPv4" : null;

  // 是否有元信息需要显示
  const hasMetaInfo = osInfo || browserInfo || languageInfo || timezoneInfo || locationInfo;

  return (
    <div className={cn("flex gap-3", isReply && "ml-12")}>
      {isGuest ? (
        // 访客头像（可点击网址）
        comment.guestWebsite ? (
          <a href={comment.guestWebsite} target="_blank" rel="noopener noreferrer">
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarImage src={guestAvatarUrl} />
              <AvatarFallback>{avatarFallbackChar}</AvatarFallback>
            </Avatar>
          </a>
        ) : (
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={guestAvatarUrl} />
            <AvatarFallback>{avatarFallbackChar}</AvatarFallback>
          </Avatar>
        )
      ) : (
        // 登录用户头像
        <Link href={`/user/${comment.user!.id}`}>
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={comment.user!.avatar || undefined} />
            <AvatarFallback>{avatarFallbackChar}</AvatarFallback>
          </Avatar>
        </Link>
      )}

      <div className="flex-1 min-w-0">
        {/* 用户信息和时间 */}
        <div className="flex items-center gap-2 flex-wrap">
          {isGuest ? (
            // 访客名称（可点击网址）
            comment.guestWebsite ? (
              <a
                href={comment.guestWebsite}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-sm hover:underline"
              >
                {displayName}
              </a>
            ) : (
              <span className="font-medium text-sm">{displayName}</span>
            )
          ) : (
            // 登录用户名称
            <Link
              href={`/user/${comment.user!.id}`}
              className="font-medium text-sm hover:underline"
            >
              {displayName}
            </Link>
          )}
          {/* 角色标识 */}
          {comment.user?.role === "OWNER" && (
            <span className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">
              站长
            </span>
          )}
          {comment.user?.role === "ADMIN" && (
            <span className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-medium">
              管理员
            </span>
          )}
          {comment.isPinned && (
            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
              置顶
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(comment.createdAt)}
          </span>
          {comment.isEdited && (
            <span className="text-xs text-muted-foreground italic">(已编辑)</span>
          )}
        </div>

        {/* 位置和设备信息 - 单独一行，分离显示各项 */}
        {hasMetaInfo && (
          <div className="flex items-center gap-1 mt-1 flex-wrap text-[11px] text-muted-foreground">
            {/* 系统 */}
            {osInfo && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 cursor-default">
                    <DeviceIcon className="h-3 w-3" />
                    <span>{osInfo}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  操作系统
                </TooltipContent>
              </Tooltip>
            )}

            {/* 分隔符 */}
            {osInfo && browserInfo && <span className="text-muted-foreground/50">·</span>}

            {/* 浏览器 */}
            {browserInfo && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 cursor-default">
                    <Chrome className="h-3 w-3" />
                    <span>{browserInfo}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  浏览器
                </TooltipContent>
              </Tooltip>
            )}

            {/* 分隔符 */}
            {(osInfo || browserInfo) && languageInfo && <span className="text-muted-foreground/50">·</span>}

            {/* 语言 */}
            {languageInfo && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 cursor-default">
                    <Languages className="h-3 w-3" />
                    <span>{languageInfo}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  语言
                </TooltipContent>
              </Tooltip>
            )}

            {/* 分隔符 */}
            {(osInfo || browserInfo || languageInfo) && timezoneInfo && <span className="text-muted-foreground/50">·</span>}

            {/* 时区 */}
            {timezoneInfo && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 cursor-default">
                    <Clock className="h-3 w-3" />
                    <span>{timezoneInfo}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  时区
                </TooltipContent>
              </Tooltip>
            )}

            {/* 分隔符 */}
            {(osInfo || browserInfo || languageInfo || timezoneInfo) && locationInfo && <span className="text-muted-foreground/50">·</span>}

            {/* IP 定位 */}
            {locationInfo && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 cursor-default">
                    <MapPin className="h-3 w-3" />
                    <span>{locationInfo}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {locationLabel} 属地
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        {/* 评论内容 */}
        {isEditing ? (
          <div className="mt-2 space-y-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[80px] resize-none"
              maxLength={2000}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(comment.content);
                }}
              >
                取消
              </Button>
              <Button
                size="sm"
                onClick={handleEdit}
                disabled={!editContent.trim() || updateMutation.isPending}
              >
                保存
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-sm whitespace-pre-wrap break-words">
            {comment.replyToUser && (
              <Link
                href={`/user/${comment.replyToUser.id}`}
                className="text-primary hover:underline mr-1"
              >
                @{comment.replyToUser.nickname || comment.replyToUser.username}
              </Link>
            )}
            {comment.content}
          </p>
        )}

        {/* 操作按钮 */}
        <div className="flex items-center gap-1 mt-2">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 px-2",
              localReaction === true && "text-primary"
            )}
            onClick={() => handleReact(true)}
          >
            <ThumbsUp className="h-4 w-4 mr-1" />
            {localLikes > 0 && <span className="text-xs">{localLikes}</span>}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 px-2",
              localReaction === false && "text-destructive"
            )}
            onClick={() => handleReact(false)}
          >
            <ThumbsDown className="h-4 w-4 mr-1" />
            {localDislikes > 0 && (
              <span className="text-xs">{localDislikes}</span>
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => startReply()}
          >
            <MessageSquare className="h-4 w-4 mr-1" />
            回复
          </Button>

          {/* 更多操作 */}
          {(isOwner || isAdmin) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-2">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {isOwner && (
                  <DropdownMenuItem onClick={() => setIsEditing(true)}>
                    <Edit className="h-4 w-4 mr-2" />
                    编辑
                  </DropdownMenuItem>
                )}
                {!isReply && isAdmin && (
                  <DropdownMenuItem
                    onClick={() =>
                      pinMutation.mutate({
                        commentId: comment.id,
                        isPinned: !comment.isPinned,
                      })
                    }
                  >
                    <Pin className="h-4 w-4 mr-2" />
                    {comment.isPinned ? "取消置顶" : "置顶"}
                  </DropdownMenuItem>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={(e) => e.preventDefault()}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      删除
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确定删除这条评论吗？</AlertDialogTitle>
                      <AlertDialogDescription>
                        此操作无法撤销。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate({ id: comment.id })}
                      >
                        删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* 回复输入框 */}
        {isReplying && (
          <div className="mt-3 flex gap-3">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={session?.user?.image || undefined} />
              <AvatarFallback>
                {(session?.user?.name?.trim() ?? "").charAt(0).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              {/* 显示回复目标 */}
              {replyToUser && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>回复</span>
                  <span className="text-primary">
                    @{replyToUser.nickname || replyToUser.username}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1 text-xs"
                    onClick={() => setReplyToUser(null)}
                  >
                    ×
                  </Button>
                </div>
              )}
              <Textarea
                placeholder={`回复 @${replyToUser ? (replyToUser.nickname || replyToUser.username) : displayName}...`}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                className="min-h-[60px] resize-none"
                maxLength={2000}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsReplying(false);
                    setReplyContent("");
                    setReplyToUser(null);
                  }}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  onClick={handleReply}
                  disabled={!replyContent.trim() || createReplyMutation.isPending}
                >
                  回复
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 回复列表 */}
        {!isReply && replyCount > 0 && (
          <div className="mt-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-primary h-8 px-2"
              onClick={() => setShowReplies(!showReplies)}
            >
              {showReplies ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  收起回复
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  {replyCount} 条回复
                </>
              )}
            </Button>

            {showReplies && (
              <div className="mt-3 space-y-4">
                {replies.map((reply) => (
                  <CommentItem
                    key={reply.id}
                    comment={reply as CommentData}
                    videoId={videoId}
                    parentId={comment.id}
                    isReply
                    onReplyToComment={(user) => {
                      setReplyToUser(user);
                      setIsReplying(true);
                    }}
                  />
                ))}
                {hasMoreReplies && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-primary"
                    onClick={() => fetchMoreReplies()}
                    disabled={isFetchingReplies}
                  >
                    {isFetchingReplies ? "加载中..." : "查看更多回复"}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
