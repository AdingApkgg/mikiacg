"use client";

/**
 * 缓存图片的自然宽高比，给瀑布流卡片做「下次进来直接按真实比例占位」用，
 * 避免 3:4 默认占位 → 加载完成跳到自然比例引起的列重排抖动。
 *
 * 性能关键：瀑布流一页有 20+ 张图，挂载时每张卡都会 get 一次、图片加载完每张卡都 set 一次。
 * 旧实现里每次 get/set 都做同步 JSON.parse + JSON.stringify + localStorage.setItem，
 * 在 500 entry 上限下单串 ~25KB，单页就会触发 60+ 次主线程阻塞，肉眼可感的卡顿。
 *
 * 现实现：
 * - 模块加载时一次性把 localStorage 解析进内存 Map（首次访问触发，惰性）
 * - get/set 全部在内存中完成，O(1) 无阻塞
 * - 写入用 requestIdleCallback / setTimeout 合并，多次写只产生一次 stringify + setItem
 * - LRU 上限避免无限增长（用户长期浏览大量图）
 */

const STORAGE_KEY = "mikiacg.img-aspect.v1";
const MAX_ENTRIES = 500;

let memoryCache: Map<string, number> | null = null;
let flushScheduled = false;

function loadFromStorage(): Map<string, number> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return new Map();
    return new Map(Object.entries(parsed as Record<string, number>));
  } catch {
    return new Map();
  }
}

function ensureCache(): Map<string, number> {
  if (memoryCache === null) {
    memoryCache = loadFromStorage();
  }
  return memoryCache;
}

function flushToStorage() {
  flushScheduled = false;
  if (typeof window === "undefined" || memoryCache === null) return;
  try {
    // Map 迭代顺序就是插入顺序，截尾即可保留最近 MAX_ENTRIES 个
    const entries = Array.from(memoryCache.entries());
    const trimmed = entries.length > MAX_ENTRIES ? entries.slice(entries.length - MAX_ENTRIES) : entries;
    // 同步内存 Map 与即将写入的快照，避免下次读还包含已淘汰条目
    if (trimmed.length !== entries.length) {
      memoryCache = new Map(trimmed);
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(trimmed)));
  } catch {
    // 配额满 / 隐私模式等失败都静默忽略
  }
}

function scheduleFlush() {
  if (flushScheduled || typeof window === "undefined") return;
  flushScheduled = true;
  // 优先用 requestIdleCallback 在浏览器空闲时落盘，降级 setTimeout
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  if (typeof ric === "function") {
    ric(flushToStorage);
  } else {
    setTimeout(flushToStorage, 1000);
  }
}

export function getCachedAspect(url: string): number | null {
  if (!url) return null;
  const ratio = ensureCache().get(url);
  return typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

export function setCachedAspect(url: string, ratio: number): void {
  if (!url || !Number.isFinite(ratio) || ratio <= 0) return;
  const cache = ensureCache();
  const rounded = Number(ratio.toFixed(4));
  const existing = cache.get(url);
  // 同值短路：避免无意义的写盘调度
  if (existing === rounded) return;
  // 删除再插入，让 Map 保持「最近写入靠后」的 LRU 序
  cache.delete(url);
  cache.set(url, rounded);
  scheduleFlush();
}
