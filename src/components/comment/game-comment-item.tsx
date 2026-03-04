"use client";

import { useState, useCallback, useRef } from "react";
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
import { toast } from "@/lib/toast-with-sound";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getAvatarUrlClient } from "@/lib/avatar";
import { CommentContent } from "./comment-content";
import { EmojiStickerPicker } from "./emoji-sticker-picker";

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
  guestName?: string | null;
  guestEmail?: string | null;
  guestWebsite?: string | null;
}

interface GameCommentItemProps {
  comment: CommentData;
  gameId: string;
  parentId?: string;
  isReply?: boolean;
  onReplyToComment?: (user: CommentUser) => void;
}

export function GameCommentItem({ 
  comment, 
  gameId, 
  parentId,
  isReply = false,
  onReplyToComment,
}: GameCommentItemProps) {
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
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

  const insertAtReplyCursor = useCallback((text: string) => {
    const el = replyTextareaRef.current;
    if (!el) {
      setReplyContent((prev) => prev + text);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = replyContent.slice(0, start);
    const after = replyContent.slice(end);
    setReplyContent(before + text + after);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  }, [replyContent]);

  const utils = trpc.useUtils();
  const isOwner = comment.userId && session?.user?.id === comment.userId;
  const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "OWNER";
  const replyCount = comment._count?.replies ?? 0;
  const topLevelParentId = parentId || comment.id;

  const {
    data: repliesData,
    fetchNextPage: fetchMoreReplies,
    hasNextPage: hasMoreReplies,
    isFetchingNextPage: isFetchingReplies,
  } = trpc.gameComment.getReplies.useInfiniteQuery(
    { commentId: comment.id, limit: 10 },
    {
      enabled: showReplies && !isReply,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  const replies = repliesData?.pages.flatMap((page) => page.replies) ?? [];

  const reactMutation = trpc.gameComment.react.useMutation({
    onMutate: async ({ isLike }) => {
      const prevReaction = localReaction;
      setLocalReaction(isLike);
      
      if (isLike === null) {
        if (prevReaction === true) setLocalLikes((l) => l - 1);
        if (prevReaction === false) setLocalDislikes((d) => d - 1);
      } else if (prevReaction === null) {
        if (isLike) setLocalLikes((l) => l + 1);
        else setLocalDislikes((d) => d + 1);
      } else if (prevReaction !== isLike) {
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
      setLocalLikes(comment.likes);
      setLocalDislikes(comment.dislikes);
      setLocalReaction(comment.userReaction);
      toast.error("操作失败");
    },
  });

  const createReplyMutation = trpc.gameComment.create.useMutation({
    onSuccess: () => {
      setReplyContent("");
      setIsReplying(false);
      setReplyToUser(null);
      setShowReplies(true);
      utils.gameComment.getReplies.invalidate({ commentId: topLevelParentId });
      utils.gameComment.list.invalidate({ gameId });
      toast.success("回复成功");
    },
    onError: (error) => {
      toast.error(error.message || "回复失败");
    },
  });

  const updateMutation = trpc.gameComment.update.useMutation({
    onSuccess: () => {
      setIsEditing(false);
      utils.gameComment.list.invalidate({ gameId });
      utils.gameComment.getReplies.invalidate();
      toast.success("编辑成功");
    },
    onError: (error) => {
      toast.error(error.message || "编辑失败");
    },
  });

  const deleteMutation = trpc.gameComment.delete.useMutation({
    onSuccess: () => {
      utils.gameComment.list.invalidate({ gameId });
      utils.gameComment.getReplies.invalidate();
      utils.gameComment.getCount.invalidate({ gameId });
      toast.success("删除成功");
    },
    onError: (error) => {
      toast.error(error.message || "删除失败");
    },
  });

  const pinMutation = trpc.gameComment.pin.useMutation({
    onSuccess: () => {
      utils.gameComment.list.invalidate({ gameId });
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
    const targetUserId = replyToUser?.id || comment.user?.id;
    createReplyMutation.mutate({
      gameId,
      content: replyContent.trim(),
      parentId: topLevelParentId,
      replyToUserId: targetUserId,
    });
  }, [replyContent, createReplyMutation, gameId, topLevelParentId, replyToUser, comment.user?.id]);

  const startReply = useCallback((targetUser?: CommentUser) => {
    if (!session) {
      toast.error("登录后才能回复评论");
      return;
    }
    if (isReply && onReplyToComment && comment.user) {
      onReplyToComment(comment.user);
    } else {
      setReplyToUser(targetUser || null);
      setIsReplying(true);
    }
  }, [session, isReply, onReplyToComment, comment.user]);

  const handleEdit = useCallback(() => {
    if (!editContent.trim()) return;
    updateMutation.mutate({ id: comment.id, content: editContent.trim() });
  }, [editContent, updateMutation, comment.id]);

  const isGuest = !comment.user;
  const displayName = isGuest 
    ? (comment.guestName || "访客") 
    : (comment.user?.nickname || comment.user?.username || "用户");
  const avatarFallbackChar = ((displayName || "用").trim() || "用").charAt(0).toUpperCase();
  
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

  const DeviceIcon = (() => {
    if (!normalizedDeviceInfo?.deviceType) return Monitor;
    switch (normalizedDeviceInfo.deviceType.toLowerCase()) {
      case "mobile": return Smartphone;
      case "tablet": return Tablet;
      default: return Monitor;
    }
  })();

  const osInfo = (() => {
    if (!normalizedDeviceInfo?.os) return null;
    return [normalizedDeviceInfo.os, normalizedDeviceInfo.osVersion].filter(Boolean).join(" ");
  })();

  const browserInfo = (() => {
    if (!normalizedDeviceInfo?.browser) return null;
    return [normalizedDeviceInfo.browser, normalizedDeviceInfo.browserVersion].filter(Boolean).join(" ");
  })();

  const languageInfo = normalizedDeviceInfo?.language || null;
  const timezoneInfo = normalizedDeviceInfo?.timezone || null;
  const locationInfo = comment.ipv6Location || comment.ipv4Location || null;
  const locationLabel = comment.ipv6Location ? "IPv6" : comment.ipv4Location ? "IPv4" : null;
  const hasMetaInfo = osInfo || browserInfo || languageInfo || timezoneInfo || locationInfo;

  return (
    <div className={cn("flex gap-3", isReply && "ml-12")}>
      {isGuest ? (
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
        <Link href={`/user/${comment.user!.id}`}>
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={comment.user!.avatar || undefined} />
            <AvatarFallback>{avatarFallbackChar}</AvatarFallback>
          </Avatar>
        </Link>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {isGuest ? (
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
            <Link
              href={`/user/${comment.user!.id}`}
              className="font-medium text-sm hover:underline"
            >
              {displayName}
            </Link>
          )}
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

        {hasMetaInfo && (
          <div className="flex items-center gap-1 mt-1 flex-wrap text-[11px] text-muted-foreground">
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
            {osInfo && browserInfo && <span className="text-muted-foreground/50">·</span>}
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
            {(osInfo || browserInfo) && languageInfo && <span className="text-muted-foreground/50">·</span>}
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
            {(osInfo || browserInfo || languageInfo) && timezoneInfo && <span className="text-muted-foreground/50">·</span>}
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
            {(osInfo || browserInfo || languageInfo || timezoneInfo) && locationInfo && <span className="text-muted-foreground/50">·</span>}
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
            <CommentContent content={comment.content} />
          </p>
        )}

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

        {isReplying && (
          <div className="mt-3 flex gap-3">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={session?.user?.image || undefined} />
              <AvatarFallback>
                {(session?.user?.name?.trim() ?? "").charAt(0).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
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
                ref={replyTextareaRef}
                placeholder={`回复 @${replyToUser ? (replyToUser.nickname || replyToUser.username) : displayName}...`}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                className="min-h-[60px] resize-none"
                maxLength={2000}
                autoFocus
              />
              <div className="flex items-center justify-between">
                <EmojiStickerPicker
                  onEmojiSelect={(emoji) => insertAtReplyCursor(emoji)}
                  onStickerSelect={(markup) => insertAtReplyCursor(markup)}
                />
                <div className="flex gap-2">
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
          </div>
        )}

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
                  <GameCommentItem
                    key={reply.id}
                    comment={reply as CommentData}
                    gameId={gameId}
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
