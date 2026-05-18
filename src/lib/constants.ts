// 管理员权限范围定义
// 这是一个共享常量文件，可以安全地在客户端和服务器端使用
export const ADMIN_SCOPES = {
  "video:moderate": "视频审核",
  "video:manage": "视频管理",
  "user:view": "查看用户",
  "user:manage": "管理用户",
  "tag:manage": "标签管理",
  "settings:manage": "系统设置",
  "comment:manage": "评论管理",
  "referral:view_all": "全站推广查看",
  "stats:view": "数据总览",
  "ticket:manage": "工单管理",
} as const;

export type AdminScope = keyof typeof ADMIN_SCOPES;

/** 游戏平台预设选项 */
export const GAME_PLATFORMS = [
  "Windows",
  "Mac",
  "Linux",
  "Android",
  "iOS",
  "PS5",
  "PS4",
  "Xbox",
  "Switch",
  "Web",
] as const;

/** 游戏类型常量（编辑页完整列表） */
export const GAME_TYPES = [
  "ADV",
  "RPG",
  "ACT",
  "SLG",
  "PZL",
  "SIM",
  "STG",
  "FTG",
  "SPT",
  "RAC",
  "AVG",
  "ARPG",
  "MMORPG",
  "VN",
  "MISC",
  "TAB",
  "OTHER",
] as const;
