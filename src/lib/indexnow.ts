import { getServerConfig } from "@/lib/server-config";

const INDEXNOW_ENDPOINTS = [
  { name: "IndexNow", url: "https://api.indexnow.org/indexnow" },
  { name: "Yandex", url: "https://yandex.com/indexnow" },
];

const REQUEST_TIMEOUT = 5000;
const BATCH_SIZE = 10000;

export type IndexableContentType = "video" | "game" | "image" | "series";

const CONTENT_PATH_PREFIX: Record<IndexableContentType, string> = {
  video: "video",
  game: "game",
  image: "image",
  series: "series",
};

async function fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 提交 URL 到 IndexNow（优化实时性）
 */
export async function submitToIndexNow(urls: string | string[]): Promise<boolean> {
  const config = await getServerConfig();
  const key = config.indexNowKey;

  if (!key) {
    return false;
  }

  const urlList = Array.isArray(urls) ? urls : [urls];

  if (urlList.length === 0) {
    return false;
  }

  const firstUrl = new URL(urlList[0]);
  const host = firstUrl.host;

  const payload = JSON.stringify({
    host,
    key,
    keyLocation: `https://${host}/${key}.txt`,
    urlList,
  });

  const headers = {
    "Content-Type": "application/json; charset=utf-8",
  };

  try {
    await Promise.any(
      INDEXNOW_ENDPOINTS.map(async (endpoint) => {
        const response = await fetchWithTimeout(
          endpoint.url,
          { method: "POST", headers, body: payload },
          REQUEST_TIMEOUT,
        );

        if (response.ok || response.status === 202) {
          console.log(`IndexNow: ${endpoint.name} 提交成功，${urlList.length} 个 URL`);
          return true;
        }
        throw new Error(`${endpoint.name}: ${response.status}`);
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * 通用内容推送：根据内容类型构造 URL 并提交
 */
export async function submitContentToIndexNow(type: IndexableContentType, id: string): Promise<boolean> {
  const config = await getServerConfig();
  const appUrl = config.siteUrl;
  if (!appUrl) return false;

  const url = `${appUrl}/${CONTENT_PATH_PREFIX[type]}/${id}`;
  return submitToIndexNow(url);
}

/**
 * 批量推送同一类型内容，自动分批避免单次 URL 数过多
 */
export async function submitContentsToIndexNow(
  type: IndexableContentType,
  ids: string[],
): Promise<{ success: number; failed: number }> {
  const config = await getServerConfig();
  const appUrl = config.siteUrl;
  if (!appUrl || !config.indexNowKey || ids.length === 0) {
    return { success: 0, failed: ids.length };
  }

  const prefix = CONTENT_PATH_PREFIX[type];
  const urls = ids.map((id) => `${appUrl}/${prefix}/${id}`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    const result = await submitToIndexNow(batch);
    if (result) {
      success += batch.length;
    } else {
      failed += batch.length;
    }
  }

  return { success, failed };
}

// ---------------------------------------------------------------------------
// 内容类型快捷方法（保持向后兼容）
// ---------------------------------------------------------------------------

export const submitVideoToIndexNow = (videoId: string) => submitContentToIndexNow("video", videoId);
export const submitVideosToIndexNow = (videoIds: string[]) => submitContentsToIndexNow("video", videoIds);

export const submitGameToIndexNow = (gameId: string) => submitContentToIndexNow("game", gameId);
export const submitGamesToIndexNow = (gameIds: string[]) => submitContentsToIndexNow("game", gameIds);

export const submitImagePostToIndexNow = (postId: string) => submitContentToIndexNow("image", postId);
export const submitImagePostsToIndexNow = (postIds: string[]) => submitContentsToIndexNow("image", postIds);

export const submitSeriesToIndexNow = (seriesId: string) => submitContentToIndexNow("series", seriesId);
export const submitSeriesListToIndexNow = (seriesIds: string[]) => submitContentsToIndexNow("series", seriesIds);

/**
 * 提交首页/列表页等站点结构页面
 */
export async function submitSitePages(): Promise<boolean> {
  const config = await getServerConfig();
  const appUrl = config.siteUrl;
  if (!appUrl) return false;

  const pages = [
    appUrl,
    `${appUrl}/game`,
    `${appUrl}/image`,
    `${appUrl}/series`,
    `${appUrl}/tags`,
    `${appUrl}/ranking`,
    `${appUrl}/links`,
    `${appUrl}/feedback`,
    `${appUrl}/search`,
  ];

  return submitToIndexNow(pages);
}
