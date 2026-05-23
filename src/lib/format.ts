import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
// 直接 import locale 对象并手动 register；副作用 import "dayjs/locale/zh-cn" 在 Next.js
// server 端的 ESM/CJS interop 下会把 locale 注册到另一个 dayjs 实例上,导致 fromNow() 始终输出英文
import zhCnLocale from "dayjs/locale/zh-cn";

dayjs.extend(relativeTime);
dayjs.locale(zhCnLocale, undefined, true);

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function formatViews(views: number): string {
  if (views >= 100000000) {
    return `${(views / 100000000).toFixed(1)}亿`;
  }
  if (views >= 10000) {
    return `${(views / 10000).toFixed(1)}万`;
  }
  return views.toString();
}

export function formatRelativeTime(date: Date | string): string {
  return dayjs(date).locale("zh-cn").fromNow();
}

export function formatDate(date: Date | string, format: string = "YYYY-MM-DD"): string {
  return dayjs(date).format(format);
}

/** 字节数格式化：自动选择 B/KB/MB/GB 单位 */
export function formatBytes(bytes: string | number): string {
  const n = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
