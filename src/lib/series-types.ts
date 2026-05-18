/**
 * 合集类型（Series Type）配置
 *
 * - 类型 code 存储到 Series.type 字段（String，可空 = 未分类）
 * - 完整类型列表通过 SiteConfig.seriesTypes（Json）维护，未配置时使用内置默认值
 * - 默认预设参考 hanime1.me 的「影片系列」分类（系列合集 / OVA / 剧场版 等）
 */

// ---------------------------------------------------------------------------
// 类型与常量
// ---------------------------------------------------------------------------

export interface SeriesTypeOption {
  /** 类型 code（小写、稳定标识，存到 Series.type） */
  code: string;
  /** 显示名称 */
  label: string;
  /** Tailwind 颜色（badge 着色用，可选） */
  color?: string;
  /** 备注/说明（管理端 hover 提示） */
  description?: string;
}

/** 表示「全部 / 不过滤」的特殊 code，用于选集器配置 */
export const SERIES_TYPE_ALL = "all" as const;

/**
 * 内置默认类型（首次创建 SiteConfig 或 seriesTypes 为空时回退到此）。
 *
 * 参考 hanime1.me 的「影片系列」分类做了本地化扩展：
 * - hentai_series_compilation：里番系列合集（多季同一系列）
 * - ova：OVA / 番外短篇
 * - movie：剧场版 / 长篇
 * - adaptation：改编合集（漫画 / GAL 改编）
 * - themed：主题向合集（如 NTR、TS、辉夜等主题）
 * - extras：花絮 / 番外 / 特典
 */
export const DEFAULT_SERIES_TYPES: SeriesTypeOption[] = [
  {
    code: "hentai_series_compilation",
    label: "里番系列合集",
    color: "#e11d48",
    description: "同一系列的多话合集（如「○○系列 第1话~第N话」）",
  },
  {
    code: "ova",
    label: "OVA",
    color: "#7c3aed",
    description: "OVA / 番外短篇 / 单独发行的中短篇",
  },
  {
    code: "movie",
    label: "剧场版",
    color: "#f59e0b",
    description: "剧场版 / 长篇电影",
  },
  {
    code: "adaptation",
    label: "改编合集",
    color: "#0ea5e9",
    description: "漫画 / GAL / 小说改编的合集",
  },
  {
    code: "themed",
    label: "主题合集",
    color: "#10b981",
    description: "按主题/题材归集（如 NTR、TS、姐控等）",
  },
  {
    code: "extras",
    label: "番外特典",
    color: "#64748b",
    description: "花絮、番外、特典、彩蛋等",
  },
];

// ---------------------------------------------------------------------------
// 解析 / 校验工具
// ---------------------------------------------------------------------------

const CODE_RE = /^[a-z0-9_]{1,40}$/;

function sanitizeOption(raw: unknown): SeriesTypeOption | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const code = typeof r.code === "string" ? r.code.trim().toLowerCase() : "";
  const label = typeof r.label === "string" ? r.label.trim() : "";
  if (!code || !label) return null;
  if (!CODE_RE.test(code)) return null;
  if (code === SERIES_TYPE_ALL) return null; // 保留字
  if (label.length > 40) return null;
  const color = typeof r.color === "string" && r.color.trim() ? r.color.trim().slice(0, 32) : undefined;
  const description =
    typeof r.description === "string" && r.description.trim() ? r.description.trim().slice(0, 200) : undefined;
  return { code, label, ...(color ? { color } : {}), ...(description ? { description } : {}) };
}

/**
 * 把 DB 中的 seriesTypes（Json | unknown）合并成完整的类型列表。
 * - 数组合法：去重（code 唯一）、过滤非法项；为空时使用默认值
 * - 非数组：直接返回默认值
 */
export function mergeSeriesTypes(input: unknown): SeriesTypeOption[] {
  if (!Array.isArray(input) || input.length === 0) return DEFAULT_SERIES_TYPES.slice();
  const seen = new Set<string>();
  const result: SeriesTypeOption[] = [];
  for (const raw of input) {
    const opt = sanitizeOption(raw);
    if (!opt) continue;
    if (seen.has(opt.code)) continue;
    seen.add(opt.code);
    result.push(opt);
  }
  return result.length ? result : DEFAULT_SERIES_TYPES.slice();
}

/** 校验单个 code 是否合法（非空、字符集匹配、且在给定列表中存在）。 */
export function isValidSeriesTypeCode(code: string | null | undefined, types: SeriesTypeOption[]): boolean {
  if (!code) return false;
  if (!CODE_RE.test(code)) return false;
  return types.some((t) => t.code === code);
}

/** 通过 code 查找类型选项，找不到返回 null。 */
export function findSeriesType(code: string | null | undefined, types: SeriesTypeOption[]): SeriesTypeOption | null {
  if (!code) return null;
  return types.find((t) => t.code === code) ?? null;
}
