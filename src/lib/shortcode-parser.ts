/**
 * 短代码解析器
 * 将类似 WordPress 的短代码格式转换为结构化数据
 */

export interface VideoExtraInfo {
  intro?: string;                    // 作品介绍
  episodes?: { title: string; content: string }[];  // 剧集介绍
  author?: string;                   // 原作者
  authorIntro?: string;              // 作者介绍
  keywords?: string[];               // 搜索关键词
  downloads?: { name: string; url: string; password?: string }[];  // 下载链接
  relatedVideos?: string[];          // 相关视频标题
  notices?: { type: 'info' | 'success' | 'warning' | 'error'; content: string }[];  // 公告
}

/**
 * 解析短代码内容为结构化数据
 */
export function parseShortcode(content: string): VideoExtraInfo {
  const result: VideoExtraInfo = {};

  // 解析 alert 标签（公告）
  const alertRegex = /\{alert\s+type="([^"]+)"\}([\s\S]*?)\{\/alert\}/g;
  let alertMatch;
  const notices: VideoExtraInfo['notices'] = [];
  while ((alertMatch = alertRegex.exec(content)) !== null) {
    const type = alertMatch[1] as 'info' | 'success' | 'warning' | 'error';
    const alertContent = cleanHtml(alertMatch[2]);
    notices.push({ type, content: alertContent });
  }
  if (notices.length > 0) {
    result.notices = notices;
  }

  // 解析 tabs 标签
  const tabsRegex = /\{tabs\}([\s\S]*?)\{\/tabs\}/g;
  let tabsMatch;
  while ((tabsMatch = tabsRegex.exec(content)) !== null) {
    const tabsContent = tabsMatch[1];
    
    // 解析每个 tab-pane
    const paneRegex = /\{tabs-pane\s+label="([^"]+)"\}([\s\S]*?)\{\/tabs-pane\}/g;
    let paneMatch;
    while ((paneMatch = paneRegex.exec(tabsContent)) !== null) {
      const label = paneMatch[1];
      const paneContent = cleanHtml(paneMatch[2]);

      switch (label) {
        case '作品介绍':
          result.intro = paneContent;
          break;
        case '剧集介绍':
          // 从 paneContent 中提取剧集信息
          const episodes = parseEpisodes(paneMatch[2]);
          if (episodes.length > 0) {
            result.episodes = episodes;
          }
          break;
        case '作品信息':
          // 提取作者信息
          const authorMatch = paneContent.match(/原作者[：:]\s*【?([^】\n]+)】?/);
          if (authorMatch) {
            result.author = authorMatch[1].trim();
          }
          break;
        case '搜索关键词':
          const keywords = paneContent
            .split('\n')
            .map(k => k.trim())
            .filter(k => k.length > 0);
          if (keywords.length > 0) {
            result.keywords = keywords;
          }
          break;
        case '视频下载':
          const downloads = parseDownloads(paneMatch[2]);
          if (downloads.length > 0) {
            result.downloads = downloads;
          }
          break;
        case '作者介绍':
          result.authorIntro = paneContent;
          break;
      }
    }
  }

  // 解析 card-list 标签（相关视频）
  const cardListRegex = /\{card-list\}([\s\S]*?)\{\/card-list\}/g;
  let cardListMatch;
  const relatedVideos: string[] = [];
  while ((cardListMatch = cardListRegex.exec(content)) !== null) {
    const cardContent = cardListMatch[1];
    const itemRegex = /\{card-list-item\}([\s\S]*?)\{\/card-list-item\}/g;
    let itemMatch;
    while ((itemMatch = itemRegex.exec(cardContent)) !== null) {
      const title = cleanHtml(itemMatch[1]).trim();
      if (title) {
        relatedVideos.push(title);
      }
    }
  }
  if (relatedVideos.length > 0) {
    result.relatedVideos = relatedVideos;
  }

  return result;
}

/**
 * 解析剧集介绍
 */
function parseEpisodes(content: string): { title: string; content: string }[] {
  const episodes: { title: string; content: string }[] = [];
  
  // 从 alert 标签中提取剧集
  const alertRegex = /\{alert\s+type="[^"]+"\}([\s\S]*?)\{\/alert\}/g;
  let match;
  while ((match = alertRegex.exec(content)) !== null) {
    const alertContent = match[1];
    
    // 提取标题（如 【第一集】）
    const titleMatch = alertContent.match(/<p[^>]*>【([^】]+)】<\/p>|【([^】]+)】/);
    if (titleMatch) {
      const title = titleMatch[1] || titleMatch[2];
      const episodeContent = cleanHtml(alertContent.replace(/<p[^>]*>【[^】]+】<\/p>|【[^】]+】/, ''));
      episodes.push({ title, content: episodeContent.trim() });
    }
  }
  
  return episodes;
}

/**
 * 解析下载链接
 */
function parseDownloads(content: string): { name: string; url: string; password?: string }[] {
  const downloads: { name: string; url: string; password?: string }[] = [];
  
  // 解析 cloud 短代码
  const cloudRegex = /\{cloud\s+title="([^"]+)"\s+type="[^"]*"\s+url="([^"]+)"(?:\s+password="([^"]*)")?\s*\/?\}/g;
  let match;
  while ((match = cloudRegex.exec(content)) !== null) {
    downloads.push({
      name: match[1],
      url: match[2],
      password: match[3] || undefined,
    });
  }
  
  return downloads;
}

/**
 * 清理 HTML 标签和多余空白
 */
function cleanHtml(content: string): string {
  return content
    .replace(/<[^>]+>/g, '') // 移除 HTML 标签
    .replace(/\{[^}]+\}/g, '') // 移除短代码
    .replace(/\*\*([^*]+)\*\*/g, '$1') // 移除 Markdown 加粗
    .replace(/\n{3,}/g, '\n\n') // 合并多个换行
    .trim();
}

/**
 * 将结构化数据转换为显示用的 Markdown
 */
export function extraInfoToMarkdown(info: VideoExtraInfo): string {
  const parts: string[] = [];

  if (info.intro) {
    parts.push(`## 作品介绍\n\n${info.intro}`);
  }

  if (info.episodes && info.episodes.length > 0) {
    parts.push(`## 剧集介绍\n\n${info.episodes.map(ep => 
      `### ${ep.title}\n\n${ep.content}`
    ).join('\n\n')}`);
  }

  if (info.author) {
    parts.push(`## 作品信息\n\n**原作者:** ${info.author}`);
  }

  if (info.authorIntro) {
    parts.push(`## 作者介绍\n\n${info.authorIntro}`);
  }

  if (info.keywords && info.keywords.length > 0) {
    parts.push(`## 搜索关键词\n\n${info.keywords.join('、')}`);
  }

  if (info.downloads && info.downloads.length > 0) {
    parts.push(`## 下载链接\n\n${info.downloads.map(d => 
      `- [${d.name}](${d.url})${d.password ? ` (密码: ${d.password})` : ''}`
    ).join('\n')}`);
  }

  if (info.relatedVideos && info.relatedVideos.length > 0) {
    parts.push(`## 相关视频\n\n${info.relatedVideos.map(v => `- ${v}`).join('\n')}`);
  }

  return parts.join('\n\n---\n\n');
}

/**
 * 批量解析多个视频数据
 */
export interface BatchImportItem {
  title: string;
  videoUrl: string;
  coverUrl?: string;
  description?: string;
  shortcodeContent?: string;  // 原始短代码内容
  tags?: string[];
  customId?: string;
}

export function parseBatchImport(items: BatchImportItem[]): (BatchImportItem & { extraInfo?: VideoExtraInfo })[] {
  return items.map(item => {
    if (item.shortcodeContent) {
      const extraInfo = parseShortcode(item.shortcodeContent);
      return { ...item, extraInfo };
    }
    return item;
  });
}
