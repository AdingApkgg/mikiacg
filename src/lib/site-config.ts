import { prisma } from "@/lib/prisma";
import type { Ad } from "@/lib/ads";
import { mergeThumbnailPresets, type ThumbnailPresets } from "@/lib/thumbnail-presets";
import { mergeSeriesTypes, type SeriesTypeOption } from "@/lib/series-types";

/** 公开站点配置（不含敏感字段，可安全传给客户端） */
export interface PublicSiteConfig {
  siteName: string;
  siteUrl: string;
  siteDescription: string | null;
  siteLogo: string | null;
  siteFavicon: string | null;
  siteKeywords: string | null;
  googleVerification: string | null;
  githubUrl: string | null;
  securityEmail: string | null;
  announcement: string | null;
  announcementEnabled: boolean;
  allowRegistration: boolean;
  requireEmailVerify: boolean;
  allowUpload: boolean;
  allowComment: boolean;
  requireLoginToComment: boolean;
  contactEmail: string | null;
  socialLinks: Record<string, string> | null;
  privacyPolicy: string | null;
  termsOfService: string | null;
  aboutPage: string | null;
  footerText: string | null;
  footerLinks: Array<{ label: string; url: string }> | null;
  icpBeian: string | null;
  publicSecurityBeian: string | null;
  adsEnabled: boolean;
  adGateEnabled: boolean;
  adGateViewsRequired: number;
  adGateHours: number;
  sponsorAds: Ad[] | null;
  themeHue: number;
  themeColorTemp: number;
  themeBorderRadius: number;
  themeGlassOpacity: number;
  themeAnimations: boolean;
  animationSpeed: number;
  animationPageTransition: boolean;
  animationStagger: boolean;
  animationHover: boolean;
  animationDialog: boolean;
  animationTab: boolean;
  animationPreset: string;
  effectEnabled: boolean;
  effectType: string;
  effectDensity: number;
  effectSpeed: number;
  effectOpacity: number;
  effectColor: string;
  soundDefaultEnabled: boolean;
  entrySoundUrl: string | null;
  entrySoundVolume: number;
  entrySoundMode: string;
  entrySoundIntervalHours: number;
  oauthProviders: string[];
  /** Telegram Login Widget 使用的 bot 用户名（不带 @）。启用 TG 登录时非空。 */
  telegramBotUsername: string | null;
  /** Telegram Bot 数字 ID（由 botToken 冒号前的部分派生；公开信息，用于 oauth.telegram.org 跳转）。 */
  telegramBotId: string | null;
  captchaLogin: string;
  captchaRegister: string;
  captchaComment: string;
  captchaForgotPassword: string;
  turnstileSiteKey: string | null;
  recaptchaSiteKey: string | null;
  hcaptchaSiteKey: string | null;
  referralEnabled: boolean;
  videoSelectorMode: string;
  videoSelectorMaxCount: number;
  /** 选集器（series 模式）只显示该类型的合集；null 表示不过滤 */
  videoSelectorSeriesType: string | null;
  /** 合集类型可选项（动态可维护，未配置时使用内置默认值） */
  seriesTypes: SeriesTypeOption[];
  sectionCompositeEnabled: boolean;
  sectionVideoEnabled: boolean;
  sectionImageEnabled: boolean;
  sectionGameEnabled: boolean;
  videoSortOptions: string;
  gameSortOptions: string;
  imageSortOptions: string;
  videoDefaultSort: string;
  gameDefaultSort: string;
  imageDefaultSort: string;
  analyticsGoogleId: string | null;
  analyticsGtmId: string | null;
  analyticsCfToken: string | null;
  analyticsClarityId: string | null;
  analyticsBingVerification: string | null;
  fileUploadEnabled: boolean;
  channelEnabled: boolean;
  channelMaxPerUser: number;
  channelMaxMembers: number;
  channelMessageMaxLength: number;
  dmEnabled: boolean;
  dmMessageMaxLength: number;
  dmRateLimit: number;
  showIpLocation: boolean;
  showDeviceInfo: boolean;
  showCommentExtraMeta: boolean;
  redirectEnabled: boolean;
  redirectCountdown: number;
  redirectWhitelist: string[];
  redirectTitle: string | null;
  redirectDescription: string | null;
  redirectDisclaimer: string | null;
  /** /api/cover 是否启用 ?w/h/q 列表缩略图；为 false 时前端不带缩略参数、接口仅代理原图 */
  coverProxyThumbEnabled: boolean;
  /** 前端缩略图档位（6 档语义预设，合并缺省值后永远完整） */
  thumbnailPresets: ThumbnailPresets;
  /** APP 下载推荐弹窗 */
  appDownloadPopup: {
    enabled: boolean;
    title: string | null;
    description: string | null;
    image: string | null;
    buttonText: string | null;
    /** 展示平台白名单：ios / android / windows / macos */
    platforms: string[];
    urls: {
      ios: string | null;
      android: string | null;
      windows: string | null;
      macos: string | null;
      fallback: string | null;
    };
    cooldownHours: number;
    delayMs: number;
  };
  /** 榜单系统 */
  rankingEnabled: boolean;
  rankingTopN: number;
  /** 加权公式 { views, likes, favorites, comments }，未配置时使用默认 0.1/1/3/2 */
  rankingWeights: { views: number; likes: number; favorites: number; comments: number } | null;
  /** 综合榜配额 { video, image, game }，未配置时使用默认 40/30/30 */
  rankingCombinedQuota: { video: number; image: number; game: number } | null;
}

// ---------------------------------------------------------------------------
// globalThis 单例（dev 热重载保持引用，prod 整个进程生命周期有效）
// ---------------------------------------------------------------------------

const g = globalThis as unknown as { __publicSiteConfig?: PublicSiteConfig };
let _inflight: Promise<PublicSiteConfig> | null = null;

// ---------------------------------------------------------------------------
// DB → PublicSiteConfig
// ---------------------------------------------------------------------------

const OAUTH_KEYS = [
  "Google",
  "Github",
  "Discord",
  "Apple",
  "Twitter",
  "Facebook",
  "Microsoft",
  "Twitch",
  "Spotify",
  "Linkedin",
  "Gitlab",
  "Reddit",
  "Qq",
  "Wechat",
] as const;

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function normalizeImageSortOptions(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw || "latest,views,likes";
}

function toPublic(c: Record<string, unknown>): PublicSiteConfig {
  const oauthProviders: string[] = [];
  for (const k of OAUTH_KEYS) {
    if (c[`oauth${k}ClientId`] && c[`oauth${k}ClientSecret`]) oauthProviders.push(k.toLowerCase());
  }
  // Telegram 登录：只需 bot token（Mini App 用），Widget 还需要 bot username。
  // 两者缺一不可才在登录按钮中显示 Telegram（TMA 内部另走按钮隐藏/显示）。
  const telegramBotToken = (c.oauthTelegramBotToken as string | null) || null;
  const telegramBotUsername = (c.oauthTelegramBotUsername as string | null) || null;
  // bot_id 是 token 冒号前的数字部分，公开信息（每个使用 Telegram Login Widget 的站点都暴露）
  const telegramBotIdRaw = telegramBotToken ? telegramBotToken.split(":")[0] : null;
  const telegramBotId = telegramBotIdRaw && /^\d+$/.test(telegramBotIdRaw) ? telegramBotIdRaw : null;
  if (telegramBotToken) oauthProviders.push("telegram");

  return {
    siteName: (c.siteName as string) || "ACGN Site",
    siteUrl: stripTrailingSlash((c.siteUrl as string) || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4000"),
    siteDescription: (c.siteDescription as string) ?? null,
    siteLogo: (c.siteLogo as string) ?? null,
    siteFavicon: (c.siteFavicon as string) ?? null,
    siteKeywords: (c.siteKeywords as string) ?? null,
    googleVerification: (c.googleVerification as string) ?? null,
    githubUrl: (c.githubUrl as string) ?? null,
    securityEmail: (c.securityEmail as string) ?? null,
    announcement: (c.announcement as string) ?? null,
    announcementEnabled: (c.announcementEnabled as boolean) ?? false,
    allowRegistration: (c.allowRegistration as boolean) ?? true,
    requireEmailVerify: (c.requireEmailVerify as boolean) ?? false,
    allowUpload: (c.allowUpload as boolean) ?? true,
    allowComment: (c.allowComment as boolean) ?? true,
    requireLoginToComment: (c.requireLoginToComment as boolean) ?? false,
    contactEmail: (c.contactEmail as string) ?? null,
    socialLinks: c.socialLinks as Record<string, string> | null,
    privacyPolicy: (c.privacyPolicy as string) ?? null,
    termsOfService: (c.termsOfService as string) ?? null,
    aboutPage: (c.aboutPage as string) ?? null,
    footerText: (c.footerText as string) ?? null,
    footerLinks: c.footerLinks as Array<{ label: string; url: string }> | null,
    icpBeian: (c.icpBeian as string) ?? null,
    publicSecurityBeian: (c.publicSecurityBeian as string) ?? null,
    adsEnabled: (c.adsEnabled as boolean) ?? false,
    adGateEnabled: (c.adGateEnabled as boolean) ?? false,
    adGateViewsRequired: (c.adGateViewsRequired as number) ?? 3,
    adGateHours: (c.adGateHours as number) ?? 12,
    sponsorAds: c.sponsorAds as Ad[] | null,
    themeHue: (c.themeHue as number) ?? 350,
    themeColorTemp: (c.themeColorTemp as number) ?? 0,
    themeBorderRadius: (c.themeBorderRadius as number) ?? 0.625,
    themeGlassOpacity: (c.themeGlassOpacity as number) ?? 0.7,
    themeAnimations: (c.themeAnimations as boolean) ?? true,
    animationSpeed: (c.animationSpeed as number) ?? 1.0,
    animationPageTransition: (c.animationPageTransition as boolean) ?? true,
    animationStagger: (c.animationStagger as boolean) ?? true,
    animationHover: (c.animationHover as boolean) ?? true,
    animationDialog: (c.animationDialog as boolean) ?? true,
    animationTab: (c.animationTab as boolean) ?? true,
    animationPreset: (c.animationPreset as string) ?? "standard",
    effectEnabled: (c.effectEnabled as boolean) ?? true,
    effectType: (c.effectType as string) ?? "sakura",
    effectDensity: (c.effectDensity as number) ?? 50,
    effectSpeed: (c.effectSpeed as number) ?? 1.0,
    effectOpacity: (c.effectOpacity as number) ?? 0.8,
    effectColor: (c.effectColor as string) ?? "",
    soundDefaultEnabled: (c.soundDefaultEnabled as boolean) ?? true,
    entrySoundUrl: (c.entrySoundUrl as string) ?? null,
    entrySoundVolume: (c.entrySoundVolume as number) ?? 0.5,
    entrySoundMode: (c.entrySoundMode as string) ?? "session",
    entrySoundIntervalHours: (c.entrySoundIntervalHours as number) ?? 24,
    oauthProviders,
    telegramBotUsername,
    telegramBotId,
    captchaLogin: (c.captchaLogin as string) ?? "math",
    captchaRegister: (c.captchaRegister as string) ?? "none",
    captchaComment: (c.captchaComment as string) ?? "none",
    captchaForgotPassword: (c.captchaForgotPassword as string) ?? "none",
    turnstileSiteKey: (c.turnstileSiteKey as string) ?? null,
    recaptchaSiteKey: (c.recaptchaSiteKey as string) ?? null,
    hcaptchaSiteKey: (c.hcaptchaSiteKey as string) ?? null,
    referralEnabled: (c.referralEnabled as boolean) ?? false,
    videoSelectorMode: (c.videoSelectorMode as string) ?? "series",
    videoSelectorMaxCount: (c.videoSelectorMaxCount as number) ?? 100,
    videoSelectorSeriesType:
      typeof c.videoSelectorSeriesType === "string" && c.videoSelectorSeriesType && c.videoSelectorSeriesType !== "all"
        ? (c.videoSelectorSeriesType as string)
        : null,
    seriesTypes: mergeSeriesTypes(c.seriesTypes),
    sectionCompositeEnabled: (c.sectionCompositeEnabled as boolean) ?? true,
    sectionVideoEnabled: (c.sectionVideoEnabled as boolean) ?? true,
    sectionImageEnabled: (c.sectionImageEnabled as boolean) ?? true,
    sectionGameEnabled: (c.sectionGameEnabled as boolean) ?? true,
    videoSortOptions: (c.videoSortOptions as string) ?? "latest,views,likes",
    gameSortOptions: (c.gameSortOptions as string) ?? "latest,views,likes",
    imageSortOptions: normalizeImageSortOptions(c.imageSortOptions),
    videoDefaultSort: (c.videoDefaultSort as string) ?? "latest",
    gameDefaultSort: (c.gameDefaultSort as string) ?? "latest",
    imageDefaultSort: (c.imageDefaultSort as string) ?? "latest",
    analyticsGoogleId: (c.analyticsGoogleId as string) ?? null,
    analyticsGtmId: (c.analyticsGtmId as string) ?? null,
    analyticsCfToken: (c.analyticsCfToken as string) ?? null,
    analyticsClarityId: (c.analyticsClarityId as string) ?? null,
    analyticsBingVerification: (c.analyticsBingVerification as string) ?? null,
    fileUploadEnabled: (c.fileUploadEnabled as boolean) ?? false,
    channelEnabled: (c.channelEnabled as boolean) ?? true,
    channelMaxPerUser: (c.channelMaxPerUser as number) ?? 5,
    channelMaxMembers: (c.channelMaxMembers as number) ?? 200,
    channelMessageMaxLength: (c.channelMessageMaxLength as number) ?? 2000,
    dmEnabled: (c.dmEnabled as boolean) ?? true,
    dmMessageMaxLength: (c.dmMessageMaxLength as number) ?? 2000,
    dmRateLimit: (c.dmRateLimit as number) ?? 30,
    showIpLocation: (c.showIpLocation as boolean) ?? true,
    showDeviceInfo: (c.showDeviceInfo as boolean) ?? true,
    showCommentExtraMeta: (c.showCommentExtraMeta as boolean) ?? false,
    redirectEnabled: (c.redirectEnabled as boolean) ?? true,
    redirectCountdown: (c.redirectCountdown as number) ?? 5,
    redirectWhitelist: Array.isArray(c.redirectWhitelist) ? (c.redirectWhitelist as string[]) : [],
    redirectTitle: (c.redirectTitle as string) ?? null,
    redirectDescription: (c.redirectDescription as string) ?? null,
    redirectDisclaimer: (c.redirectDisclaimer as string) ?? null,
    coverProxyThumbEnabled: typeof c.coverProxyThumbEnabled === "boolean" ? c.coverProxyThumbEnabled : true,
    thumbnailPresets: mergeThumbnailPresets(c.thumbnailPresets),
    appDownloadPopup: {
      enabled: (c.appDownloadPopupEnabled as boolean) ?? false,
      title: (c.appDownloadPopupTitle as string) ?? null,
      description: (c.appDownloadPopupDescription as string) ?? null,
      image: (c.appDownloadPopupImage as string) ?? null,
      buttonText: (c.appDownloadPopupButtonText as string) ?? null,
      platforms:
        typeof c.appDownloadPopupPlatforms === "string" && c.appDownloadPopupPlatforms
          ? (c.appDownloadPopupPlatforms as string)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
      urls: {
        ios: (c.appDownloadPopupUrlIos as string) ?? null,
        android: (c.appDownloadPopupUrlAndroid as string) ?? null,
        windows: (c.appDownloadPopupUrlWindows as string) ?? null,
        macos: (c.appDownloadPopupUrlMacos as string) ?? null,
        fallback: (c.appDownloadPopupUrlFallback as string) ?? null,
      },
      cooldownHours: (c.appDownloadPopupCooldownHours as number) ?? 24,
      delayMs: (c.appDownloadPopupDelayMs as number) ?? 1500,
    },
    rankingEnabled: typeof c.rankingEnabled === "boolean" ? c.rankingEnabled : true,
    rankingTopN: typeof c.rankingTopN === "number" && c.rankingTopN > 0 ? c.rankingTopN : 100,
    rankingWeights:
      c.rankingWeights &&
      typeof c.rankingWeights === "object" &&
      typeof (c.rankingWeights as Record<string, unknown>).views === "number"
        ? (c.rankingWeights as { views: number; likes: number; favorites: number; comments: number })
        : null,
    rankingCombinedQuota:
      c.rankingCombinedQuota &&
      typeof c.rankingCombinedQuota === "object" &&
      typeof (c.rankingCombinedQuota as Record<string, unknown>).video === "number"
        ? (c.rankingCombinedQuota as { video: number; image: number; game: number })
        : null,
  };
}

async function loadFromDB(): Promise<PublicSiteConfig> {
  let row = await prisma.siteConfig.findUnique({ where: { id: "default" } });
  if (!row) {
    row = await prisma.siteConfig.upsert({
      where: { id: "default" },
      create: { id: "default" },
      update: {},
    });
  }
  return toPublic(row as unknown as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/**
 * 获取公开站点配置。
 * 常驻内存，读取零开销。首次调用自动从 DB 加载（singleflight 防并发）。
 */
export async function getPublicSiteConfig(): Promise<PublicSiteConfig> {
  if (g.__publicSiteConfig) return g.__publicSiteConfig;
  if (_inflight) return _inflight;

  _inflight = loadFromDB()
    .then((c) => {
      g.__publicSiteConfig = c;
      _inflight = null;
      return c;
    })
    .catch((e) => {
      _inflight = null;
      throw e;
    });

  return _inflight;
}

/**
 * 从 DB 重新加载到内存。管理员保存 / 导入配置 / 初始化向导后调用。
 */
export async function reloadPublicSiteConfig(): Promise<void> {
  g.__publicSiteConfig = await loadFromDB();
}
