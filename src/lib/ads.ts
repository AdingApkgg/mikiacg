/**
 * 广告系统 —— 共享类型与工具函数
 */

/** 单条广告的数据结构（存储在 SiteConfig.sponsorAds JSON 中） */
export interface Ad {
  /** 广告标题 / 名称 */
  title: string;
  /** 广告平台名（如"Google""百度联盟"等） */
  platform: string;
  /** 跳转链接 */
  url: string;
  /** 描述文案 */
  description?: string;
  /** 广告图片链接 */
  imageUrl?: string;
  /** 权重（数值越大被选中概率越高，默认 1） */
  weight: number;
  /** 是否启用（false 时不展示） */
  enabled: boolean;
}

/**
 * 按权重随机选取 N 条不重复广告
 * @param ads    全量广告列表（仅启用的会参与选取）
 * @param count  需要选取的数量
 * @returns      选中的广告数组（最多 count 条，如可用广告不足则返回全部可用）
 */
export function pickWeightedRandomAds(ads: Ad[], count: number): Ad[] {
  const enabled = ads.filter((a) => a.enabled);
  if (enabled.length === 0) return [];
  if (enabled.length <= count) return shuffle(enabled);

  const picked: Ad[] = [];
  // 复制一份可变池
  const pool = enabled.map((a) => ({ ad: a, weight: Math.max(a.weight, 1) }));

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
    pool.splice(idx, 1); // 不重复选取
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
