/**
 * 广告系统 —— 共享类型与工具函数
 *
 * 设计要点：
 * - 所有广告数据存储在 SiteConfig.sponsorAds JSON 字段中
 * - 解析时统一通过 parseSponsorAds 兼容旧数据
 * - 选取时通过 pickWeightedRandomAds 根据位置/定向/排期/权重计算
 */

/** 广告位标识（业务语义层，与具体 slotId 多对多） */
export type AdPosition =
  | "all"
  | "sidebar"
  | "header"
  | "header-carousel"
  | "in-feed"
  | "ad-gate"
  // 扩展位置
  | "video-detail"
  | "comment"
  | "profile"
  | "search"
  | "category"
  | "floating"
  | "popup";

export const AD_POSITIONS: { value: AdPosition; label: string; group?: string }[] = [
  { value: "all", label: "全部位置" },
  { value: "sidebar", label: "侧栏", group: "通用" },
  { value: "header", label: "顶栏", group: "通用" },
  { value: "header-carousel", label: "顶部轮播", group: "通用" },
  { value: "in-feed", label: "信息流", group: "通用" },
  { value: "floating", label: "悬浮卡片", group: "通用" },
  { value: "popup", label: "弹窗", group: "通用" },
  { value: "video-detail", label: "视频详情", group: "页面" },
  { value: "comment", label: "评论区", group: "页面" },
  { value: "profile", label: "个人主页", group: "页面" },
  { value: "search", label: "搜索页", group: "页面" },
  { value: "category", label: "分区/分类", group: "页面" },
  { value: "ad-gate", label: "仅广告门", group: "特殊" },
];

/** 具体广告位选项（不含"全部位置"），用于多选 UI */
export const AD_POSITION_SPECIFIC: { value: AdPosition; label: string; group?: string }[] = AD_POSITIONS.filter(
  (p) => p.value !== "all",
);

/** 不同广告位的专用图片尺寸标识 */
export type AdImageSize = "banner" | "card" | "sidebar";

export const AD_IMAGE_SIZES: { value: AdImageSize; label: string; hint: string }[] = [
  { value: "banner", label: "横幅图", hint: "用于顶部轮播/弹窗，推荐 1200×300" },
  { value: "card", label: "卡片图", hint: "用于信息流/评论区，推荐 640×360" },
  { value: "sidebar", label: "侧栏图", hint: "用于侧栏/悬浮，推荐 400×200" },
];

/** 广告位 slotId 的统一配置表：映射到 AdPosition 和 AdImageSize */
interface SlotConfig {
  position: AdPosition;
  imageSize: AdImageSize;
}

const SLOT_CONFIG: Record<string, SlotConfig> = {
  // 基础广告位
  sidebar: { position: "sidebar", imageSize: "sidebar" },
  "video-sidebar": { position: "sidebar", imageSize: "sidebar" },
  header: { position: "header", imageSize: "banner" },
  "header-carousel": { position: "header-carousel", imageSize: "banner" },
  "in-feed": { position: "in-feed", imageSize: "card" },
  "ad-gate": { position: "ad-gate", imageSize: "card" },
  // 扩展广告位
  floating: { position: "floating", imageSize: "sidebar" },
  popup: { position: "popup", imageSize: "card" },
  "video-detail": { position: "video-detail", imageSize: "card" },
  "video-detail-sidebar": { position: "video-detail", imageSize: "sidebar" },
  "video-detail-bottom": { position: "video-detail", imageSize: "card" },
  comment: { position: "comment", imageSize: "card" },
  "comment-bottom": { position: "comment", imageSize: "card" },
  profile: { position: "profile", imageSize: "card" },
  "profile-banner": { position: "profile", imageSize: "banner" },
  search: { position: "search", imageSize: "card" },
  "search-top": { position: "search", imageSize: "banner" },
  category: { position: "category", imageSize: "banner" },
  "category-banner": { position: "category", imageSize: "banner" },
};

/** 从 slotId 推导对应的 AdPosition，未知 slotId 返回 undefined（仅匹配 "all" 广告） */
export function resolveSlotPosition(slotId: string): AdPosition | undefined {
  return SLOT_CONFIG[slotId]?.position;
}

/** 从 slotId 推导对应的图片尺寸类型 */
export function resolveSlotImageSize(slotId: string): AdImageSize | undefined {
  return SLOT_CONFIG[slotId]?.imageSize;
}

const VALID_POSITIONS: Set<string> = new Set(AD_POSITIONS.map((p) => p.value));

/** 各广告位尺寸的专用图片 URL */
export interface AdImages {
  banner?: string;
  card?: string;
  sidebar?: string;
}

/** 定向投放：设备 */
export type AdDevice = "desktop" | "mobile" | "tablet" | "tauri";
export const AD_DEVICES: { value: AdDevice; label: string }[] = [
  { value: "desktop", label: "桌面浏览器" },
  { value: "mobile", label: "移动端" },
  { value: "tablet", label: "平板" },
  { value: "tauri", label: "Tauri 客户端" },
];

/** 定向投放：登录状态 */
export type AdLoginState = "guest" | "user";
export const AD_LOGIN_STATES: { value: AdLoginState; label: string }[] = [
  { value: "guest", label: "未登录访客" },
  { value: "user", label: "已登录用户" },
];

/** 定向投放配置（数组为空或 undefined 表示不限制） */
export interface AdTargeting {
  devices?: AdDevice[];
  loginStates?: AdLoginState[];
  /** 自定义分类标签，例如 video / image / game，匹配 currentCategory 上下文 */
  categories?: string[];
  /** 语言地区代码，例如 zh-CN / en，匹配 navigator.language 前缀 */
  locales?: string[];
}

/** 精细排期 */
export interface AdSchedule {
  /** 投放星期：0(周日)~6(周六)；空数组/undefined 表示每天 */
  daysOfWeek?: number[];
  /** 投放小时区间，元组为 [startHour, endHourExclusive]，跨午夜需拆为两段 */
  hourRanges?: [number, number][];
}

/** 投放上限 */
export interface AdCaps {
  /** 每日总展示次数上限（null/undefined 表示不限） */
  dailyImpressions?: number | null;
  /** 每日总点击次数上限 */
  dailyClicks?: number | null;
  /** 总展示次数上限（达到后永久下线） */
  totalImpressions?: number | null;
  /** 总点击次数上限 */
  totalClicks?: number | null;
}

/** 广告类型 */
export type AdKind = "image" | "html";

/** 单条广告的数据结构（存储在 SiteConfig.sponsorAds JSON 中） */
export interface Ad {
  /** 唯一标识（uuid，用于编辑/删除） */
  id: string;
  /** 广告标题 / 名称 */
  title: string;
  /** 广告平台名（如"Google""百度联盟"等） */
  platform: string;
  /** 跳转链接（图片广告必填，HTML 广告可选） */
  url: string;
  /** 描述文案 */
  description?: string;
  /** 默认广告图片链接（各尺寸未配置时的回退） */
  imageUrl?: string;
  /** 各广告位专用图片（未配置的尺寸回退到 imageUrl） */
  images?: AdImages;
  /** 权重（数值越大被选中概率越高，默认 1） */
  weight: number;
  /** 是否启用（false 时不展示） */
  enabled: boolean;
  /** 展示位置列表（包含 "all" 表示所有位置） */
  positions: AdPosition[];
  /** 投放开始时间（ISO string，为空表示立即开始） */
  startDate?: string | null;
  /** 投放结束时间（ISO string，为空表示长期有效） */
  endDate?: string | null;
  /** 创建时间 */
  createdAt?: string;
  /** 广告类型：image 普通图片广告 / html 自定义代码片段 */
  kind?: AdKind;
  /** kind=html 时使用的 HTML/JS 片段（支持 <script> 标签） */
  html?: string;
  /** 定向投放配置 */
  targeting?: AdTargeting;
  /** 精细排期（在 startDate/endDate 范围内进一步限制） */
  schedule?: AdSchedule;
  /** 投放上限 */
  caps?: AdCaps;
  /** 备注（仅后台可见，不展示） */
  notes?: string;
}

/**
 * 根据广告位选取最合适的图片 URL。
 * 优先使用该位置对应尺寸的专用图，未配置则回退到默认 imageUrl。
 */
export function getAdImage(ad: Ad, slotId?: string): string | undefined {
  if (slotId && ad.images) {
    const size = resolveSlotImageSize(slotId);
    if (size) {
      const url = ad.images[size];
      if (url) return url;
    }
  }
  return ad.imageUrl;
}

/** 从原始对象解析各广告位专用图片 URL */
export function parseAdImages(raw: unknown): AdImages | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const result: AdImages = {};
  if (typeof obj.banner === "string" && obj.banner) result.banner = obj.banner;
  if (typeof obj.card === "string" && obj.card) result.card = obj.card;
  if (typeof obj.sidebar === "string" && obj.sidebar) result.sidebar = obj.sidebar;
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseStringArray(raw: unknown, valid?: Set<string>): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const result = raw.filter((v): v is string => typeof v === "string" && (!valid || valid.has(v)));
  return result.length > 0 ? result : undefined;
}

const VALID_DEVICES = new Set<string>(AD_DEVICES.map((d) => d.value));
const VALID_LOGIN_STATES = new Set<string>(AD_LOGIN_STATES.map((s) => s.value));

function parseTargeting(raw: unknown): AdTargeting | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const result: AdTargeting = {};
  const devices = parseStringArray(obj.devices, VALID_DEVICES) as AdDevice[] | undefined;
  if (devices) result.devices = devices;
  const loginStates = parseStringArray(obj.loginStates, VALID_LOGIN_STATES) as AdLoginState[] | undefined;
  if (loginStates) result.loginStates = loginStates;
  const categories = parseStringArray(obj.categories);
  if (categories) result.categories = categories;
  const locales = parseStringArray(obj.locales);
  if (locales) result.locales = locales;
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseSchedule(raw: unknown): AdSchedule | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const result: AdSchedule = {};
  if (Array.isArray(obj.daysOfWeek)) {
    const days = obj.daysOfWeek.filter((n): n is number => typeof n === "number" && n >= 0 && n <= 6);
    if (days.length > 0) result.daysOfWeek = Array.from(new Set(days)).sort();
  }
  if (Array.isArray(obj.hourRanges)) {
    const ranges = obj.hourRanges
      .filter((r): r is [number, number] => Array.isArray(r) && r.length === 2 && r.every((n) => typeof n === "number"))
      .map(([s, e]) => [Math.max(0, Math.min(24, s)), Math.max(0, Math.min(24, e))] as [number, number])
      .filter(([s, e]) => s < e);
    if (ranges.length > 0) result.hourRanges = ranges;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseCaps(raw: unknown): AdCaps | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const result: AdCaps = {};
  const pickNum = (key: string): number | null | undefined => {
    const v = obj[key];
    if (v === null) return null;
    if (typeof v === "number" && v >= 0) return v;
    return undefined;
  };
  const dailyImp = pickNum("dailyImpressions");
  if (dailyImp !== undefined) result.dailyImpressions = dailyImp;
  const dailyClk = pickNum("dailyClicks");
  if (dailyClk !== undefined) result.dailyClicks = dailyClk;
  const totalImp = pickNum("totalImpressions");
  if (totalImp !== undefined) result.totalImpressions = totalImp;
  const totalClk = pickNum("totalClicks");
  if (totalClk !== undefined) result.totalClicks = totalClk;
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * 从 SiteConfig.sponsorAds JSON 字段解析广告列表。
 * 统一处理旧数据兼容、字段缺省、类型校验，供客户端和管理端共用。
 */
export function parseSponsorAds(raw: unknown): Ad[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, idx) => ({
    id: item?.id ?? `legacy-${idx}`,
    title: item?.title ?? "",
    platform: item?.platform ?? "",
    url: item?.url ?? "",
    description: item?.description || undefined,
    imageUrl: item?.imageUrl || undefined,
    images: parseAdImages(item?.images),
    weight: typeof item?.weight === "number" ? item.weight : 1,
    enabled: item?.enabled !== false,
    positions: normalizePositions(item ?? {}),
    startDate: item?.startDate ?? null,
    endDate: item?.endDate ?? null,
    createdAt: item?.createdAt ?? undefined,
    kind: item?.kind === "html" ? "html" : "image",
    html: typeof item?.html === "string" && item.html.length > 0 ? item.html : undefined,
    targeting: parseTargeting(item?.targeting),
    schedule: parseSchedule(item?.schedule),
    caps: parseCaps(item?.caps),
    notes: typeof item?.notes === "string" && item.notes.length > 0 ? item.notes : undefined,
  }));
}

/** 将旧版单一 position 字段规范化为 positions 数组（兼容旧数据） */
export function normalizePositions(item: { position?: string; positions?: string[] }): AdPosition[] {
  if (Array.isArray(item.positions) && item.positions.length > 0) {
    return item.positions.filter((p): p is AdPosition => VALID_POSITIONS.has(p));
  }
  const pos = item.position;
  if (!pos || !VALID_POSITIONS.has(pos)) return ["all"];
  return [pos as AdPosition];
}

/** 获取广告位置的显示文本 */
export function getPositionsLabel(positions: AdPosition[]): string {
  if (positions.length === 0 || positions.includes("all")) return "全部位置";
  return positions.map((p) => AD_POSITIONS.find((ap) => ap.value === p)?.label ?? p).join("、");
}

/** 检查广告是否在投放日期范围内（startDate / endDate） */
export function isAdInSchedule(ad: Ad, now = new Date()): boolean {
  if (ad.startDate) {
    const start = new Date(ad.startDate);
    if (now < start) return false;
  }
  if (ad.endDate) {
    const end = new Date(ad.endDate);
    if (now > end) return false;
  }
  return true;
}

/** 检查广告是否在精细排期（dayOfWeek / hourRanges）内。空配置视为不限。 */
export function isAdInFineSchedule(ad: Ad, now = new Date()): boolean {
  const sch = ad.schedule;
  if (!sch) return true;
  if (sch.daysOfWeek && sch.daysOfWeek.length > 0) {
    if (!sch.daysOfWeek.includes(now.getDay())) return false;
  }
  if (sch.hourRanges && sch.hourRanges.length > 0) {
    const h = now.getHours();
    const hit = sch.hourRanges.some(([s, e]) => h >= s && h < e);
    if (!hit) return false;
  }
  return true;
}

/** 检查广告是否匹配指定广告位 */
export function isAdForPosition(ad: Ad, slotPosition?: string): boolean {
  const positions = ad.positions ?? [];
  if (slotPosition === "header-carousel") return positions.includes("header-carousel");
  if (!positions || positions.length === 0 || positions.includes("all")) return true;
  if (!slotPosition) return false;
  return positions.includes(slotPosition as AdPosition);
}

/** 客户端运行上下文 —— 供 getActiveAds 做定向匹配 */
export interface AdRuntimeContext {
  device?: AdDevice;
  loginState?: AdLoginState;
  category?: string;
  locale?: string;
  /** 已被服务端标记为耗尽配额的广告 ID 集合（达到 caps 上限），将被排除 */
  exhaustedIds?: Set<string>;
}

/** 检查广告定向是否匹配运行上下文 */
export function isAdTargetingMatched(ad: Ad, ctx?: AdRuntimeContext): boolean {
  const t = ad.targeting;
  if (!t) return true;
  if (t.devices && t.devices.length > 0) {
    if (!ctx?.device) return false;
    if (!t.devices.includes(ctx.device)) return false;
  }
  if (t.loginStates && t.loginStates.length > 0) {
    if (!ctx?.loginState) return false;
    if (!t.loginStates.includes(ctx.loginState)) return false;
  }
  if (t.categories && t.categories.length > 0) {
    if (!ctx?.category) return false;
    if (!t.categories.includes(ctx.category)) return false;
  }
  if (t.locales && t.locales.length > 0) {
    if (!ctx?.locale) return false;
    const ok = t.locales.some((l) => ctx.locale === l || ctx.locale?.startsWith(`${l}-`));
    if (!ok) return false;
  }
  return true;
}

/**
 * 获取可用广告：启用 + 时间范围内 + 精细排期 + 匹配位置 + 匹配定向 + 未耗尽配额
 */
export function getActiveAds(ads: Ad[], slotPosition?: string, ctx?: AdRuntimeContext): Ad[] {
  const now = new Date();
  return ads.filter(
    (a) =>
      a.enabled &&
      isAdInSchedule(a, now) &&
      isAdInFineSchedule(a, now) &&
      isAdForPosition(a, slotPosition) &&
      isAdTargetingMatched(a, ctx) &&
      !ctx?.exhaustedIds?.has(a.id),
  );
}

/**
 * 按权重随机选取 N 条不重复广告
 */
export function pickWeightedRandomAds(ads: Ad[], count: number, slotPosition?: string, ctx?: AdRuntimeContext): Ad[] {
  const active = getActiveAds(ads, slotPosition, ctx);
  if (active.length === 0) return [];
  if (active.length <= count) return shuffle(active);

  const picked: Ad[] = [];
  const pool = active.map((a) => ({ ad: a, weight: Math.max(a.weight, 1) }));

  for (let i = 0; i < count && pool.length > 0; i++) {
    const totalWeight = pool.reduce((s, p) => s + p.weight, 0);
    let rand = Math.random() * totalWeight;
    let idx = 0;
    for (let j = 0; j < pool.length; j++) {
      rand -= pool[j].weight;
      if (rand <= 0) {
        idx = j;
        break;
      }
    }
    picked.push(pool[idx].ad);
    pool.splice(idx, 1);
  }

  return picked;
}

/** Fisher-Yates 洗牌 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 客户端探测当前设备类型 */
export function detectDevice(): AdDevice {
  if (typeof window === "undefined") return "desktop";
  // Tauri 客户端
  const w = window as unknown as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  if (w.__TAURI__ != null || w.__TAURI_INTERNALS__ != null) return "tauri";
  const ua = navigator.userAgent || "";
  const isTablet = /iPad|Android(?!.*Mobile)|Tablet/i.test(ua);
  if (isTablet) return "tablet";
  const isMobile = /Mobi|Android|iPhone|iPod/i.test(ua);
  if (isMobile) return "mobile";
  return "desktop";
}
