import {
  Users,
  Video,
  Gamepad2,
  Images,
  Tag,
  Settings,
  MessageSquare,
  Link2,
  DatabaseBackup,
  Sticker,
  Coins,
  Wallet,
  Megaphone,
  HardDrive,
  FolderCog,
  BarChart3,
  UsersRound,
  Trophy,
  Inbox,
  type LucideIcon,
} from "lucide-react";

export type DashboardMenuItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  scope: string | null;
  keywords?: string[];
};

export type DashboardMenuGroup = {
  label?: string;
  items: DashboardMenuItem[];
};

export const dashboardMenuGroups: DashboardMenuGroup[] = [
  {
    items: [
      {
        href: "/dashboard/stats",
        label: "数据总览",
        icon: BarChart3,
        scope: "stats:view",
        keywords: ["stats", "dashboard", "overview", "数据"],
      },
    ],
  },
  {
    label: "内容",
    items: [
      { href: "/dashboard/videos", label: "视频", icon: Video, scope: "video:moderate", keywords: ["video"] },
      { href: "/dashboard/games", label: "游戏", icon: Gamepad2, scope: "video:moderate", keywords: ["game"] },
      { href: "/dashboard/images", label: "图片", icon: Images, scope: "video:moderate", keywords: ["image", "photo"] },
      {
        href: "/dashboard/rankings",
        label: "排行榜",
        icon: Trophy,
        scope: "settings:manage",
        keywords: ["ranking", "leaderboard", "榜单"],
      },
    ],
  },
  {
    label: "社区",
    items: [
      { href: "/dashboard/users", label: "用户", icon: Users, scope: "user:view", keywords: ["user"] },
      {
        href: "/dashboard/groups",
        label: "用户组",
        icon: UsersRound,
        scope: "user:manage",
        keywords: ["group", "role"],
      },
      { href: "/dashboard/tags", label: "标签", icon: Tag, scope: "tag:manage", keywords: ["tag"] },
      {
        href: "/dashboard/comments",
        label: "评论",
        icon: MessageSquare,
        scope: "comment:manage",
        keywords: ["comment"],
      },
      { href: "/dashboard/stickers", label: "贴图", icon: Sticker, scope: "settings:manage", keywords: ["sticker"] },
      {
        href: "/dashboard/tickets",
        label: "工单反馈",
        icon: Inbox,
        scope: "ticket:manage",
        keywords: ["ticket", "feedback", "工单", "反馈"],
      },
    ],
  },
  {
    label: "推广",
    items: [
      {
        href: "/dashboard/referral-admin",
        label: "全站推广",
        icon: Link2,
        scope: "referral:view_all",
        keywords: ["referral", "promotion"],
      },
      {
        href: "/dashboard/points",
        label: "积分管理",
        icon: Coins,
        scope: "settings:manage",
        keywords: ["points", "coin"],
      },
      {
        href: "/dashboard/payment",
        label: "支付管理",
        icon: Wallet,
        scope: "settings:manage",
        keywords: ["payment", "pay"],
      },
    ],
  },
  {
    label: "存储",
    items: [
      {
        href: "/dashboard/storage",
        label: "存储策略",
        icon: FolderCog,
        scope: "settings:manage",
        keywords: ["storage", "s3"],
      },
      { href: "/dashboard/files", label: "文件管理", icon: HardDrive, scope: "settings:manage", keywords: ["file"] },
    ],
  },
  {
    label: "系统",
    items: [
      { href: "/dashboard/ads", label: "广告管理", icon: Megaphone, scope: "settings:manage", keywords: ["ads"] },
      { href: "/dashboard/links", label: "友情链接", icon: Link2, scope: "settings:manage", keywords: ["link"] },
      {
        href: "/dashboard/backups",
        label: "数据备份",
        icon: DatabaseBackup,
        scope: "settings:manage",
        keywords: ["backup"],
      },
      {
        href: "/dashboard/settings",
        label: "系统设置",
        icon: Settings,
        scope: "settings:manage",
        keywords: ["setting"],
      },
    ],
  },
];

export function findMenuItemByPath(pathname: string): DashboardMenuItem | undefined {
  for (const group of dashboardMenuGroups) {
    for (const item of group.items) {
      if (pathname === item.href || pathname.startsWith(item.href + "/")) return item;
    }
  }
  return undefined;
}

export function findGroupByItem(href: string): DashboardMenuGroup | undefined {
  return dashboardMenuGroups.find((g) => g.items.some((i) => i.href === href));
}
