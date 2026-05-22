import { z } from "zod";
import type { SiteConfig } from "@/generated/prisma/client";
import { mergeImageCompressBypassRules, mergeImageCompressProfiles } from "@/lib/image-compress-config";
import { mergeThumbnailPresets, THUMBNAIL_PRESET_NAMES } from "@/lib/thumbnail-presets";
import { mergeSeriesTypes } from "@/lib/series-types";

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

export const validEnum = <T extends string>(value: unknown, valid: readonly T[], fallback: T): T =>
  valid.includes(value as T) ? (value as T) : fallback;

const s = (v: unknown, fallback = ""): string => (v as string) || fallback;
const n = (v: unknown, fallback: number): number => (v as number) ?? fallback;
const b = (v: unknown, fallback: boolean): boolean => (v as boolean) ?? fallback;
const imageSortOptions = (v: unknown): string => {
  const raw = s(v).trim();
  return raw || "latest,views,likes";
};

// ---------------------------------------------------------------------------
// 共享枚举
// ---------------------------------------------------------------------------

export const captchaType = z.enum(["none", "math", "slider", "turnstile", "recaptcha", "hcaptcha"]);
export const sortEnum = z.enum(["latest", "views", "likes", "titleAsc", "titleDesc"]);
export const storageProviderEnum = z.enum(["local", "s3", "r2", "minio", "oss", "cos"]);
export const videoSelectorModeEnum = z.enum(["series", "author", "uploader", "disabled"]);
export const mailSendModeEnum = z.enum(["smtp", "http_api"]);
export const animationPresetEnum = z.enum(["minimal", "standard", "rich"]);
export const effectTypeEnum = z.enum(["sakura", "firefly", "snow", "stars", "aurora", "cyber", "none"]);
export const entrySoundModeEnum = z.enum(["session", "once", "interval"]);

// ---------------------------------------------------------------------------
// Per-tab Schemas（严格校验，不使用 .catch()）
// ---------------------------------------------------------------------------

export const basicTabSchema = z.object({
  siteName: z.string().min(1, "网站名称不能为空").max(100),
  siteUrl: z.string().url("请输入有效的 URL").optional().nullable().or(z.literal("")),
  siteDescription: z.string().max(500).optional().nullable(),
  siteLogo: z.string().url("请输入有效的 URL").optional().nullable().or(z.literal("")),
  siteFavicon: z.string().url("请输入有效的 URL").optional().nullable().or(z.literal("")),
  siteKeywords: z.string().max(500).optional().nullable(),
  contactEmail: z.string().email("请输入有效的邮箱").optional().nullable().or(z.literal("")),
  announcementEnabled: z.boolean(),
  announcement: z.string().max(2000).optional().nullable(),
});

export const featuresTabSchema = z.object({
  allowRegistration: z.boolean(),
  allowUpload: z.boolean(),
  allowComment: z.boolean(),
  requireLoginToComment: z.boolean(),
  requireEmailVerify: z.boolean(),
  sectionCompositeEnabled: z.boolean(),
  sectionVideoEnabled: z.boolean(),
  sectionImageEnabled: z.boolean(),
  sectionGameEnabled: z.boolean(),
  videoSortOptions: z.string().max(200),
  gameSortOptions: z.string().max(200),
  imageSortOptions: z.string().max(200),
  videoDefaultSort: sortEnum,
  gameDefaultSort: sortEnum,
  imageDefaultSort: sortEnum,
  usdtPaymentEnabled: z.boolean(),
  usdtWalletAddress: z.string().max(100).optional().nullable().or(z.literal("")),
  usdtPointsPerUnit: z.number().int().min(1),
  usdtOrderTimeoutMin: z.number().int().min(5).max(1440),
  usdtMinAmount: z.number().min(0).optional().nullable(),
  usdtMaxAmount: z.number().min(0).optional().nullable(),
});

export const themeTabSchema = z.object({
  themeHue: z.number().int().min(0).max(360),
  themeColorTemp: z.number().int().min(-100).max(100),
  themeBorderRadius: z.number().min(0).max(2),
  themeGlassOpacity: z.number().min(0).max(1),
  themeAnimations: z.boolean(),
  animationSpeed: z.number().min(0.5).max(2.0),
  animationPageTransition: z.boolean(),
  animationStagger: z.boolean(),
  animationHover: z.boolean(),
  animationDialog: z.boolean(),
  animationTab: z.boolean(),
  animationPreset: animationPresetEnum,
});

export const captchaTabSchema = z.object({
  captchaLogin: captchaType,
  captchaRegister: captchaType,
  captchaComment: captchaType,
  captchaForgotPassword: captchaType,
  turnstileSiteKey: z.string().max(500).optional().nullable().or(z.literal("")),
  turnstileSecretKey: z.string().max(500).optional().nullable().or(z.literal("")),
  recaptchaSiteKey: z.string().max(500).optional().nullable().or(z.literal("")),
  recaptchaSecretKey: z.string().max(500).optional().nullable().or(z.literal("")),
  hcaptchaSiteKey: z.string().max(500).optional().nullable().or(z.literal("")),
  hcaptchaSecretKey: z.string().max(500).optional().nullable().or(z.literal("")),
});

export const effectsTabSchema = z.object({
  effectEnabled: z.boolean(),
  effectType: effectTypeEnum,
  effectDensity: z.number().int().min(1).max(100),
  effectSpeed: z.number().min(0.1).max(3.0),
  effectOpacity: z.number().min(0).max(1),
  effectColor: z.string().max(50).optional().nullable().or(z.literal("")),
  soundDefaultEnabled: z.boolean(),
  entrySoundUrl: z.string().max(2000).optional().nullable().or(z.literal("")),
  entrySoundVolume: z.number().min(0).max(1),
  entrySoundMode: entrySoundModeEnum,
  entrySoundIntervalHours: z.number().int().min(1).max(8760),
});

export const seriesTypeOptionSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_]+$/, "只允许小写字母、数字和下划线")
    .refine((v) => v !== "all", 'code 不能是保留字 "all"'),
  label: z.string().min(1, "请填写名称").max(40),
  color: z.string().max(32).optional().or(z.literal("")),
  description: z.string().max(200).optional().or(z.literal("")),
});

export const contentTabSchema = z.object({
  videoSelectorMode: videoSelectorModeEnum,
  videoSelectorMaxCount: z.number().int().min(10).max(10000),
  /** 选集器（series 模式）仅显示该类型；"all" 表示不过滤 */
  videoSelectorSeriesType: z.string().max(40),
  seriesTypes: z.array(seriesTypeOptionSchema).max(50),
  videosPerPage: z.number().int().min(5).max(100),
  commentsPerPage: z.number().int().min(5).max(100),
  maxUploadSize: z.number().int().min(10).max(10000),
  allowedVideoFormats: z.string().min(1, "允许的视频格式不能为空").max(200),
  adminBatchLimit: z.number().int().min(100).max(100000),
});

const imageCompressProfileFormSchema = z.object({
  enabled: z.boolean(),
  format: z.enum(["webp", "avif"]),
  quality: z.number().int().min(1).max(100),
  lossless: z.boolean(),
  maxWidth: z.number().int().min(16).max(8192),
  maxHeight: z.number().int().min(16).max(8192),
});

const thumbnailPresetSchema = z.object({
  width: z.number().int().min(16).max(4096),
  height: z.number().int().min(16).max(4096),
  quality: z.number().int().min(1).max(100),
  forceThumb: z.boolean(),
});

export const thumbnailPresetsSchema = z.object(
  Object.fromEntries(THUMBNAIL_PRESET_NAMES.map((n) => [n, thumbnailPresetSchema])) as Record<
    (typeof THUMBNAIL_PRESET_NAMES)[number],
    typeof thumbnailPresetSchema
  >,
);

export const mediaTabSchema = z.object({
  imageCompressEnabled: z.boolean(),
  imageCompressProfiles: z.record(z.enum(["avatar", "cover", "misc", "sticker"]), imageCompressProfileFormSchema),
  imageCompressBypassRules: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        name: z.string().max(200),
        enabled: z.boolean(),
        conditions: z.object({
          mimeTypes: z.array(z.string().max(120)).max(50),
          uploadTypes: z.array(z.string().max(32)).max(20),
          maxFileSize: z
            .number()
            .int()
            .min(1)
            .max(500 * 1024 * 1024)
            .nullable(),
        }),
      }),
    )
    .max(30),
  coverWidth: z.number().int().min(256).max(4096),
  coverAvifQuality: z.number().int().min(1).max(100),
  coverAvifEffort: z.number().int().min(0).max(9),
  coverWebpQuality: z.number().int().min(1).max(100),
  coverJpegQuality: z.number().int().min(1).max(100),
  coverProxyThumbEnabled: z.boolean(),
  thumbnailPresets: thumbnailPresetsSchema,
});

export const emailTabSchema = z.object({
  mailSendMode: mailSendModeEnum,
  smtpHost: z.string().max(500).optional().nullable().or(z.literal("")),
  smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
  smtpUser: z.string().max(500).optional().nullable().or(z.literal("")),
  smtpPassword: z.string().max(500).optional().nullable().or(z.literal("")),
  smtpFrom: z.string().max(500).optional().nullable().or(z.literal("")),
  mailApiUrl: z.string().url("请输入有效的 URL").optional().nullable().or(z.literal("")),
  mailApiKey: z.string().max(1000).optional().nullable().or(z.literal("")),
  mailApiFrom: z.string().max(500).optional().nullable().or(z.literal("")),
  mailApiHeaders: z.string().max(10000).optional().nullable().or(z.literal("")),
  uploadDir: z.string().min(1, "上传目录不能为空").max(500),
});

export const storageTabSchema = z.object({
  storageProvider: storageProviderEnum,
  storageEndpoint: z.string().max(500).optional().nullable().or(z.literal("")),
  storageBucket: z.string().max(200).optional().nullable().or(z.literal("")),
  storageRegion: z.string().max(100).optional().nullable().or(z.literal("")),
  storageAccessKey: z.string().max(500).optional().nullable().or(z.literal("")),
  storageSecretKey: z.string().max(500).optional().nullable().or(z.literal("")),
  storageCustomDomain: z.string().max(500).optional().nullable().or(z.literal("")),
  storagePathPrefix: z.string().max(200).optional().nullable().or(z.literal("")),
});

export const pagesTabSchema = z.object({
  privacyPolicy: z.string().max(50000).optional().nullable(),
  termsOfService: z.string().max(50000).optional().nullable(),
  aboutPage: z.string().max(50000).optional().nullable(),
});

export const footerTabSchema = z.object({
  githubUrl: z.string().url("请输入有效的 URL").optional().nullable().or(z.literal("")),
  footerText: z.string().max(1000).optional().nullable(),
  icpBeian: z.string().max(100).optional().nullable(),
  publicSecurityBeian: z.string().max(100).optional().nullable(),
});

export const oauthTabSchema = z.object({
  oauthGoogleClientId: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthGoogleClientSecret: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthGithubClientId: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthGithubClientSecret: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthDiscordClientId: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthDiscordClientSecret: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthAppleClientId: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthAppleClientSecret: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthTwitterClientId: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthTwitterClientSecret: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthFacebookClientId: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthFacebookClientSecret: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthMicrosoftClientId: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthMicrosoftClientSecret: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthTwitchClientId: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthTwitchClientSecret: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthSpotifyClientId: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthSpotifyClientSecret: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthLinkedinClientId: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthLinkedinClientSecret: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthGitlabClientId: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthGitlabClientSecret: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthRedditClientId: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthRedditClientSecret: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthQqClientId: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthQqClientSecret: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthWechatClientId: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthWechatClientSecret: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthTelegramBotToken: z.string().max(500).optional().nullable().or(z.literal("")),
  oauthTelegramBotUsername: z.string().max(100).optional().nullable().or(z.literal("")),
});

export const seoTabSchema = z.object({
  googleVerification: z.string().max(200).optional().nullable().or(z.literal("")),
  securityEmail: z.string().email("请输入有效的邮箱").optional().nullable().or(z.literal("")),
  indexNowKey: z.string().max(500).optional().nullable().or(z.literal("")),
  googleServiceAccountEmail: z.string().max(500).optional().nullable().or(z.literal("")),
  googlePrivateKey: z.string().max(10000).optional().nullable().or(z.literal("")),
});

export const messagingTabSchema = z.object({
  channelEnabled: z.boolean(),
  channelMaxPerUser: z.number().int().min(1).max(100),
  channelMaxMembers: z.number().int().min(2).max(10000),
  channelMessageMaxLength: z.number().int().min(1).max(10000),
  dmEnabled: z.boolean(),
  dmMessageMaxLength: z.number().int().min(1).max(10000),
  dmRateLimit: z.number().int().min(1).max(300),
});

export const privacyTabSchema = z.object({
  showIpLocation: z.boolean(),
  showDeviceInfo: z.boolean(),
  showCommentExtraMeta: z.boolean(),
  adminShowFullIp: z.boolean(),
  adminShowUserAgent: z.boolean(),
  adminShowDeviceDetail: z.boolean(),
});

export const analyticsTabSchema = z.object({
  analyticsGoogleId: z.string().max(200).optional().nullable().or(z.literal("")),
  analyticsGtmId: z.string().max(200).optional().nullable().or(z.literal("")),
  analyticsCfToken: z.string().max(200).optional().nullable().or(z.literal("")),
  analyticsClarityId: z.string().max(200).optional().nullable().or(z.literal("")),
  analyticsBingVerification: z.string().max(200).optional().nullable().or(z.literal("")),
});

export const redirectTabSchema = z.object({
  redirectEnabled: z.boolean(),
  redirectCountdown: z.number().int().min(1).max(30),
  redirectWhitelist: z.array(z.string().max(253)).max(200),
  redirectTitle: z.string().max(100).optional().nullable().or(z.literal("")),
  redirectDescription: z.string().max(500).optional().nullable().or(z.literal("")),
  redirectDisclaimer: z.string().max(500).optional().nullable().or(z.literal("")),
});

export const APP_DOWNLOAD_PLATFORM_IDS = ["ios", "android", "windows", "macos"] as const;
export type AppDownloadPlatformId = (typeof APP_DOWNLOAD_PLATFORM_IDS)[number];

export const appDownloadTabSchema = z.object({
  appDownloadPopupEnabled: z.boolean(),
  appDownloadPopupTitle: z.string().max(100).optional().nullable().or(z.literal("")),
  appDownloadPopupDescription: z.string().max(2000).optional().nullable(),
  appDownloadPopupImage: z.string().url("请输入有效的 URL").optional().nullable().or(z.literal("")),
  appDownloadPopupButtonText: z.string().max(50).optional().nullable().or(z.literal("")),
  appDownloadPopupPlatforms: z.string().max(100).optional().nullable().or(z.literal("")),
  appDownloadPopupUrlIos: z.string().url("请输入有效的 URL").optional().nullable().or(z.literal("")),
  appDownloadPopupUrlAndroid: z.string().url("请输入有效的 URL").optional().nullable().or(z.literal("")),
  appDownloadPopupUrlWindows: z.string().url("请输入有效的 URL").optional().nullable().or(z.literal("")),
  appDownloadPopupUrlMacos: z.string().url("请输入有效的 URL").optional().nullable().or(z.literal("")),
  appDownloadPopupUrlFallback: z.string().url("请输入有效的 URL").optional().nullable().or(z.literal("")),
  appDownloadPopupCooldownHours: z.number().int().min(0).max(8760),
  appDownloadPopupDelayMs: z.number().int().min(0).max(60000),
});

// ---------------------------------------------------------------------------
// 类型导出
// ---------------------------------------------------------------------------

export type BasicTabValues = z.infer<typeof basicTabSchema>;
export type FeaturesTabValues = z.infer<typeof featuresTabSchema>;
export type ThemeTabValues = z.infer<typeof themeTabSchema>;
export type CaptchaTabValues = z.infer<typeof captchaTabSchema>;
export type EffectsTabValues = z.infer<typeof effectsTabSchema>;
export type ContentTabValues = z.infer<typeof contentTabSchema>;
export type MediaTabValues = z.infer<typeof mediaTabSchema>;
export type EmailTabValues = z.infer<typeof emailTabSchema>;
export type StorageTabValues = z.infer<typeof storageTabSchema>;
export type PagesTabValues = z.infer<typeof pagesTabSchema>;
export type FooterTabValues = z.infer<typeof footerTabSchema>;
export type OAuthTabValues = z.infer<typeof oauthTabSchema>;
export type SeoTabValues = z.infer<typeof seoTabSchema>;
export type MessagingTabValues = z.infer<typeof messagingTabSchema>;
export type PrivacyTabValues = z.infer<typeof privacyTabSchema>;
export type AnalyticsTabValues = z.infer<typeof analyticsTabSchema>;
export type RedirectTabValues = z.infer<typeof redirectTabSchema>;
export type AppDownloadTabValues = z.infer<typeof appDownloadTabSchema>;

// ---------------------------------------------------------------------------
// SiteConfig → 表单值 pick 函数
// ---------------------------------------------------------------------------

export const OAUTH_PROVIDERS = [
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

export function pickBasicValues(cfg: SiteConfig): BasicTabValues {
  return {
    siteName: cfg.siteName,
    siteUrl: s(cfg.siteUrl),
    siteDescription: cfg.siteDescription || "",
    siteLogo: cfg.siteLogo || "",
    siteFavicon: cfg.siteFavicon || "",
    siteKeywords: cfg.siteKeywords || "",
    contactEmail: cfg.contactEmail || "",
    announcementEnabled: cfg.announcementEnabled,
    announcement: cfg.announcement || "",
  };
}

export function pickFeaturesValues(cfg: SiteConfig): FeaturesTabValues {
  return {
    allowRegistration: cfg.allowRegistration,
    allowUpload: cfg.allowUpload,
    allowComment: cfg.allowComment,
    requireLoginToComment: b(cfg.requireLoginToComment, false),
    requireEmailVerify: cfg.requireEmailVerify,
    sectionCompositeEnabled: b(cfg.sectionCompositeEnabled, true),
    sectionVideoEnabled: b(cfg.sectionVideoEnabled, true),
    sectionImageEnabled: b(cfg.sectionImageEnabled, true),
    sectionGameEnabled: b(cfg.sectionGameEnabled, true),
    videoSortOptions: s(cfg.videoSortOptions, "latest,views,likes"),
    gameSortOptions: s(cfg.gameSortOptions, "latest,views,likes"),
    imageSortOptions: imageSortOptions(cfg.imageSortOptions),
    videoDefaultSort: validEnum(cfg.videoDefaultSort, ["latest", "views", "likes", "titleAsc", "titleDesc"], "latest"),
    gameDefaultSort: validEnum(cfg.gameDefaultSort, ["latest", "views", "likes", "titleAsc", "titleDesc"], "latest"),
    imageDefaultSort: validEnum(cfg.imageDefaultSort, ["latest", "views", "likes", "titleAsc", "titleDesc"], "latest"),
    usdtPaymentEnabled: b(cfg.usdtPaymentEnabled, false),
    usdtWalletAddress: s(cfg.usdtWalletAddress),
    usdtPointsPerUnit: n(cfg.usdtPointsPerUnit, 10000),
    usdtOrderTimeoutMin: n(cfg.usdtOrderTimeoutMin, 30),
    usdtMinAmount: (cfg.usdtMinAmount as number) ?? null,
    usdtMaxAmount: (cfg.usdtMaxAmount as number) ?? null,
  };
}

export function pickThemeValues(cfg: SiteConfig): ThemeTabValues {
  return {
    themeHue: n(cfg.themeHue, 350),
    themeColorTemp: n(cfg.themeColorTemp, 0),
    themeBorderRadius: n(cfg.themeBorderRadius, 0.625),
    themeGlassOpacity: n(cfg.themeGlassOpacity, 0.7),
    themeAnimations: b(cfg.themeAnimations, true),
    animationSpeed: n(cfg.animationSpeed, 1.0),
    animationPageTransition: b(cfg.animationPageTransition, true),
    animationStagger: b(cfg.animationStagger, true),
    animationHover: b(cfg.animationHover, true),
    animationDialog: b(cfg.animationDialog, true),
    animationTab: b(cfg.animationTab, true),
    animationPreset: validEnum(cfg.animationPreset, ["minimal", "standard", "rich"], "standard"),
  };
}

export function pickCaptchaValues(cfg: SiteConfig): CaptchaTabValues {
  const v = ["none", "math", "slider", "turnstile", "recaptcha", "hcaptcha"] as const;
  return {
    captchaLogin: validEnum(cfg.captchaLogin, v, "math"),
    captchaRegister: validEnum(cfg.captchaRegister, v, "none"),
    captchaComment: validEnum(cfg.captchaComment, v, "none"),
    captchaForgotPassword: validEnum(cfg.captchaForgotPassword, v, "none"),
    turnstileSiteKey: s(cfg.turnstileSiteKey),
    turnstileSecretKey: s(cfg.turnstileSecretKey),
    recaptchaSiteKey: s(cfg.recaptchaSiteKey),
    recaptchaSecretKey: s(cfg.recaptchaSecretKey),
    hcaptchaSiteKey: s(cfg.hcaptchaSiteKey),
    hcaptchaSecretKey: s(cfg.hcaptchaSecretKey),
  };
}

export function pickEffectsValues(cfg: SiteConfig): EffectsTabValues {
  return {
    effectEnabled: b(cfg.effectEnabled, true),
    effectType: validEnum(cfg.effectType, ["sakura", "firefly", "snow", "stars", "aurora", "cyber", "none"], "sakura"),
    effectDensity: n(cfg.effectDensity, 50),
    effectSpeed: n(cfg.effectSpeed, 1.0),
    effectOpacity: n(cfg.effectOpacity, 0.8),
    effectColor: s(cfg.effectColor),
    soundDefaultEnabled: b(cfg.soundDefaultEnabled, true),
    entrySoundUrl: s(cfg.entrySoundUrl),
    entrySoundVolume: n(cfg.entrySoundVolume, 0.5),
    entrySoundMode: validEnum(cfg.entrySoundMode, ["session", "once", "interval"], "session"),
    entrySoundIntervalHours: n(cfg.entrySoundIntervalHours, 24),
  };
}

export function pickContentValues(cfg: SiteConfig): ContentTabValues {
  const cfgAny = cfg as unknown as Record<string, unknown>;
  return {
    videoSelectorMode: validEnum(cfg.videoSelectorMode, ["series", "author", "uploader", "disabled"], "series"),
    videoSelectorMaxCount: n(cfg.videoSelectorMaxCount, 100),
    videoSelectorSeriesType: s(cfgAny.videoSelectorSeriesType, "all"),
    seriesTypes: mergeSeriesTypes(cfgAny.seriesTypes).map((t) => ({
      code: t.code,
      label: t.label,
      color: t.color ?? "",
      description: t.description ?? "",
    })),
    videosPerPage: cfg.videosPerPage,
    commentsPerPage: cfg.commentsPerPage,
    maxUploadSize: cfg.maxUploadSize,
    allowedVideoFormats: cfg.allowedVideoFormats,
    adminBatchLimit: n(cfg.adminBatchLimit, 10000),
  };
}

export function pickMediaValues(cfg: SiteConfig): MediaTabValues {
  return {
    imageCompressEnabled: b(cfg.imageCompressEnabled, true),
    imageCompressProfiles: mergeImageCompressProfiles(cfg.imageCompressProfiles),
    imageCompressBypassRules: mergeImageCompressBypassRules(cfg.imageCompressBypassRules).map((r) => ({
      ...r,
      conditions: {
        ...r.conditions,
        mimeTypes: [...r.conditions.mimeTypes],
        uploadTypes: [...r.conditions.uploadTypes],
      },
    })),
    coverWidth: n(cfg.coverWidth, 1280),
    coverAvifQuality: n(cfg.coverAvifQuality, 65),
    coverAvifEffort: n(cfg.coverAvifEffort, 2),
    coverWebpQuality: n(cfg.coverWebpQuality, 82),
    coverJpegQuality: n(cfg.coverJpegQuality, 88),
    coverProxyThumbEnabled: b(cfg.coverProxyThumbEnabled, true),
    thumbnailPresets: mergeThumbnailPresets(cfg.thumbnailPresets),
  };
}

export function pickEmailValues(cfg: SiteConfig): EmailTabValues {
  return {
    mailSendMode: validEnum(cfg.mailSendMode, ["smtp", "http_api"], "smtp"),
    smtpHost: s(cfg.smtpHost),
    smtpPort: n(cfg.smtpPort, 465),
    smtpUser: s(cfg.smtpUser),
    smtpPassword: s(cfg.smtpPassword),
    smtpFrom: s(cfg.smtpFrom),
    mailApiUrl: s(cfg.mailApiUrl),
    mailApiKey: s(cfg.mailApiKey),
    mailApiFrom: s(cfg.mailApiFrom),
    mailApiHeaders: s(cfg.mailApiHeaders),
    uploadDir: s(cfg.uploadDir, "./uploads"),
  };
}

export function pickStorageValues(cfg: SiteConfig): StorageTabValues {
  return {
    storageProvider: validEnum(cfg.storageProvider, ["local", "s3", "r2", "minio", "oss", "cos"], "local"),
    storageEndpoint: s(cfg.storageEndpoint),
    storageBucket: s(cfg.storageBucket),
    storageRegion: s(cfg.storageRegion),
    storageAccessKey: s(cfg.storageAccessKey),
    storageSecretKey: s(cfg.storageSecretKey),
    storageCustomDomain: s(cfg.storageCustomDomain),
    storagePathPrefix: s(cfg.storagePathPrefix),
  };
}

export function pickPagesValues(cfg: SiteConfig): PagesTabValues {
  return {
    privacyPolicy: s(cfg.privacyPolicy),
    termsOfService: s(cfg.termsOfService),
    aboutPage: s(cfg.aboutPage),
  };
}

export function pickFooterValues(cfg: SiteConfig): FooterTabValues {
  return {
    githubUrl: s(cfg.githubUrl),
    footerText: cfg.footerText || "",
    icpBeian: cfg.icpBeian || "",
    publicSecurityBeian: cfg.publicSecurityBeian || "",
  };
}

export function pickOAuthValues(cfg: SiteConfig): OAuthTabValues {
  const r = cfg as unknown as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const k of OAUTH_PROVIDERS) {
    result[`oauth${k}ClientId`] = s(r[`oauth${k}ClientId`]);
    result[`oauth${k}ClientSecret`] = s(r[`oauth${k}ClientSecret`]);
  }
  result.oauthTelegramBotToken = s(r.oauthTelegramBotToken);
  result.oauthTelegramBotUsername = s(r.oauthTelegramBotUsername);
  return result as unknown as OAuthTabValues;
}

export function pickSeoValues(cfg: SiteConfig): SeoTabValues {
  return {
    googleVerification: s(cfg.googleVerification),
    securityEmail: s(cfg.securityEmail),
    indexNowKey: s(cfg.indexNowKey),
    googleServiceAccountEmail: s(cfg.googleServiceAccountEmail),
    googlePrivateKey: s(cfg.googlePrivateKey),
  };
}

export function pickMessagingValues(cfg: SiteConfig): MessagingTabValues {
  return {
    channelEnabled: b(cfg.channelEnabled, true),
    channelMaxPerUser: n(cfg.channelMaxPerUser, 5),
    channelMaxMembers: n(cfg.channelMaxMembers, 200),
    channelMessageMaxLength: n(cfg.channelMessageMaxLength, 2000),
    dmEnabled: b(cfg.dmEnabled, true),
    dmMessageMaxLength: n(cfg.dmMessageMaxLength, 2000),
    dmRateLimit: n(cfg.dmRateLimit, 30),
  };
}

export function pickPrivacyValues(cfg: SiteConfig): PrivacyTabValues {
  return {
    showIpLocation: b(cfg.showIpLocation, true),
    showDeviceInfo: b(cfg.showDeviceInfo, true),
    showCommentExtraMeta: b(cfg.showCommentExtraMeta, false),
    adminShowFullIp: b(cfg.adminShowFullIp, true),
    adminShowUserAgent: b(cfg.adminShowUserAgent, false),
    adminShowDeviceDetail: b(cfg.adminShowDeviceDetail, true),
  };
}

export function pickAnalyticsValues(cfg: SiteConfig): AnalyticsTabValues {
  return {
    analyticsGoogleId: s(cfg.analyticsGoogleId),
    analyticsGtmId: s(cfg.analyticsGtmId),
    analyticsCfToken: s(cfg.analyticsCfToken),
    analyticsClarityId: s(cfg.analyticsClarityId),
    analyticsBingVerification: s(cfg.analyticsBingVerification),
  };
}

export function pickRedirectValues(cfg: SiteConfig): RedirectTabValues {
  return {
    redirectEnabled: b(cfg.redirectEnabled, true),
    redirectCountdown: n(cfg.redirectCountdown, 5),
    redirectWhitelist: Array.isArray(cfg.redirectWhitelist) ? (cfg.redirectWhitelist as string[]) : [],
    redirectTitle: s(cfg.redirectTitle),
    redirectDescription: s(cfg.redirectDescription),
    redirectDisclaimer: s(cfg.redirectDisclaimer),
  };
}

export function pickAppDownloadValues(cfg: SiteConfig): AppDownloadTabValues {
  const cfgAny = cfg as unknown as Record<string, unknown>;
  return {
    appDownloadPopupEnabled: b(cfgAny.appDownloadPopupEnabled, false),
    appDownloadPopupTitle: s(cfgAny.appDownloadPopupTitle),
    appDownloadPopupDescription: s(cfgAny.appDownloadPopupDescription),
    appDownloadPopupImage: s(cfgAny.appDownloadPopupImage),
    appDownloadPopupButtonText: s(cfgAny.appDownloadPopupButtonText),
    appDownloadPopupPlatforms: s(cfgAny.appDownloadPopupPlatforms, "ios,android"),
    appDownloadPopupUrlIos: s(cfgAny.appDownloadPopupUrlIos),
    appDownloadPopupUrlAndroid: s(cfgAny.appDownloadPopupUrlAndroid),
    appDownloadPopupUrlWindows: s(cfgAny.appDownloadPopupUrlWindows),
    appDownloadPopupUrlMacos: s(cfgAny.appDownloadPopupUrlMacos),
    appDownloadPopupUrlFallback: s(cfgAny.appDownloadPopupUrlFallback),
    appDownloadPopupCooldownHours: n(cfgAny.appDownloadPopupCooldownHours, 24),
    appDownloadPopupDelayMs: n(cfgAny.appDownloadPopupDelayMs, 1500),
  };
}
