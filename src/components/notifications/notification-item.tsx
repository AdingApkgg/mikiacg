"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import { MessageSquare, Heart, Star, Megaphone, Mail, Shield, UserPlus, Inbox } from "lucide-react";
import type { NotificationType } from "@/generated/prisma/client";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

interface NotificationData {
  id: string;
  type: NotificationType;
  title: string;
  content: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  isRead: boolean;
  createdAt: Date;
}

const typeIcons: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  COMMENT_REPLY: MessageSquare,
  LIKE: Heart,
  FAVORITE: Star,
  SYSTEM: Megaphone,
  NEW_MESSAGE: Mail,
  CONTENT_STATUS: Shield,
  FOLLOW: UserPlus,
  TICKET_UPDATE: Inbox,
};

const typeColors: Record<NotificationType, string> = {
  COMMENT_REPLY: "text-blue-500",
  LIKE: "text-red-500",
  FAVORITE: "text-amber-500",
  SYSTEM: "text-purple-500",
  NEW_MESSAGE: "text-green-500",
  CONTENT_STATUS: "text-orange-500",
  FOLLOW: "text-pink-500",
  TICKET_UPDATE: "text-cyan-500",
};

function getNotificationUrl(notification: NotificationData): string | null {
  const data = notification.data as Record<string, string> | null;
  if (!data) return null;

  switch (notification.type) {
    case "COMMENT_REPLY":
      if (data.videoId) return `/video/${data.videoId}`;
      if (data.gameId) return `/game/${data.gameId}`;
      if (data.imagePostId) return `/image/${data.imagePostId}`;
      return null;
    case "LIKE":
    case "FAVORITE":
      if (data.videoId) return `/video/${data.videoId}`;
      if (data.gameId) return `/game/${data.gameId}`;
      if (data.imagePostId) return `/image/${data.imagePostId}`;
      return null;
    case "NEW_MESSAGE":
      return data.senderId ? `/messages?user=${data.senderId}` : "/messages";
    case "CONTENT_STATUS":
      if (data.videoId) return `/video/${data.videoId}`;
      if (data.gameId) return `/game/${data.gameId}`;
      if (data.imagePostId) return `/image/${data.imagePostId}`;
      return null;
    case "FOLLOW":
      return data.followerId ? `/user/${data.followerId}` : null;
    case "TICKET_UPDATE":
      return data.ticketId ? `/feedback/${data.ticketId}` : null;
    default:
      return null;
  }
}

interface NotificationItemProps {
  notification: NotificationData;
  onNavigate?: () => void;
}

export function NotificationItem({ notification, onNavigate }: NotificationItemProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const markRead = trpc.notification.markAsRead.useMutation({
    onSuccess: () => {
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
    },
  });

  const Icon = typeIcons[notification.type] ?? Megaphone;
  const color: string = typeColors[notification.type] ?? "text-muted-foreground";
  const url = getNotificationUrl(notification);

  const handleClick = () => {
    if (!notification.isRead) {
      markRead.mutate({ id: notification.id });
    }
    if (url) {
      router.push(url);
      onNavigate?.();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50",
        !notification.isRead && "bg-primary/5",
      )}
    >
      <div className={cn("mt-0.5 shrink-0", color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-medium", !notification.isRead && "text-foreground")}>
            {notification.title}
          </span>
          {!notification.isRead && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
        </div>
        {notification.content && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{notification.content}</p>
        )}
        <p className="text-[11px] text-muted-foreground/60 mt-1">{dayjs(notification.createdAt).fromNow()}</p>
      </div>
    </button>
  );
}
