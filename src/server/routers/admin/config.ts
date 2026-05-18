import { router, adminProcedure, requireScope } from "../../trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { reloadPublicSiteConfig } from "@/lib/site-config";
import { reloadServerConfig } from "@/lib/server-config";
import { HOME_LAYOUT_PRESET_IDS, LANDING_CARD_IDS, SECTION_MODULE_IDS } from "@/lib/home-layout";

const ALLOWED_CONFIG_KEYS = new Set([
  "siteName",
  "siteUrl",
  "siteDescription",
  "siteLogo",
  "siteFavicon",
  "siteKeywords",
  "googleVerification",
  "githubUrl",
  "securityEmail",
  "announcement",
  "announcementEnabled",
  "allowRegistration",
  "allowUpload",
  "allowComment",
  "requireLoginToComment",
  "requireEmailVerify",
  "sectionCompositeEnabled",
  "sectionVideoEnabled",
  "sectionImageEnabled",
  "sectionGameEnabled",
  "videoSortOptions",
  "gameSortOptions",
  "imageSortOptions",
  "videoDefaultSort",
  "gameDefaultSort",
  "imageDefaultSort",
  "videoSelectorMode",
  "videoSelectorMaxCount",
  "videoSelectorSeriesType",
  "seriesTypes",
  "videosPerPage",
  "commentsPerPage",
  "maxUploadSize",
  "allowedVideoFormats",
  "adminBatchLimit",
  "uploadBatchLimit",
  "imageCompressEnabled",
  "imageCompressProfiles",
  "imageCompressBypassRules",
  "coverWidth",
  "coverAvifQuality",
  "coverAvifEffort",
  "coverWebpQuality",
  "coverJpegQuality",
  "coverProxyThumbEnabled",
  "thumbnailPresets",
  "contactEmail",
  "socialLinks",
  "privacyPolicy",
  "termsOfService",
  "aboutPage",
  "footerText",
  "footerLinks",
  "icpBeian",
  "publicSecurityBeian",
  "adsEnabled",
  "adGateEnabled",
  "adGateViewsRequired",
  "adGateHours",
  "sponsorAds",
  "captchaLogin",
  "captchaRegister",
  "captchaComment",
  "captchaForgotPassword",
  "turnstileSiteKey",
  "turnstileSecretKey",
  "recaptchaSiteKey",
  "recaptchaSecretKey",
  "hcaptchaSiteKey",
  "hcaptchaSecretKey",
  "fileUploadEnabled",
  "fileStorageRouteRules",
  "fileDefaultPolicyId",
  "cloudImportEnabled",
  "dropboxAppKey",
  "mailSendMode",
  "smtpHost",
  "smtpPort",
  "smtpUser",
  "smtpPassword",
  "smtpFrom",
  "mailApiUrl",
  "mailApiKey",
  "mailApiFrom",
  "mailApiHeaders",
  "uploadDir",
  "indexNowKey",
  "googleServiceAccountEmail",
  "googlePrivateKey",
  "storageProvider",
  "storageEndpoint",
  "storageBucket",
  "storageRegion",
  "storageAccessKey",
  "storageSecretKey",
  "storageCustomDomain",
  "storagePathPrefix",
  "referralEnabled",
  "referralPointsPerUser",
  "pointsRules",
  "checkinEnabled",
  "checkinPointsMin",
  "checkinPointsMax",
  "usdtPaymentEnabled",
  "usdtWalletAddress",
  "usdtPointsPerUnit",
  "usdtOrderTimeoutMin",
  "usdtMinAmount",
  "usdtMaxAmount",
  "backupEnabled",
  "backupIntervalHours",
  "backupRetentionDays",
  "backupIncludeUploads",
  "backupIncludeConfig",
  "themeHue",
  "themeColorTemp",
  "themeBorderRadius",
  "themeGlassOpacity",
  "themeAnimations",
  "animationSpeed",
  "animationPageTransition",
  "animationStagger",
  "animationHover",
  "animationDialog",
  "animationTab",
  "animationPreset",
  "homeLayout",
  "effectEnabled",
  "effectType",
  "effectDensity",
  "effectSpeed",
  "effectOpacity",
  "effectColor",
  "soundDefaultEnabled",
  "entrySoundUrl",
  "entrySoundVolume",
  "entrySoundMode",
  "entrySoundIntervalHours",
  "analyticsGoogleId",
  "analyticsGtmId",
  "analyticsCfToken",
  "analyticsClarityId",
  "analyticsBingVerification",
  "oauthGoogleClientId",
  "oauthGoogleClientSecret",
  "oauthGithubClientId",
  "oauthGithubClientSecret",
  "oauthDiscordClientId",
  "oauthDiscordClientSecret",
  "oauthAppleClientId",
  "oauthAppleClientSecret",
  "oauthTwitterClientId",
  "oauthTwitterClientSecret",
  "oauthFacebookClientId",
  "oauthFacebookClientSecret",
  "oauthMicrosoftClientId",
  "oauthMicrosoftClientSecret",
  "oauthTwitchClientId",
  "oauthTwitchClientSecret",
  "oauthSpotifyClientId",
  "oauthSpotifyClientSecret",
  "oauthLinkedinClientId",
  "oauthLinkedinClientSecret",
  "oauthGitlabClientId",
  "oauthGitlabClientSecret",
  "oauthRedditClientId",
  "oauthRedditClientSecret",
  "oauthQqClientId",
  "oauthQqClientSecret",
  "oauthWechatClientId",
  "oauthWechatClientSecret",
  "oauthTelegramBotToken",
  "oauthTelegramBotUsername",
  "channelEnabled",
  "channelMaxPerUser",
  "channelMaxMembers",
  "channelMessageMaxLength",
  "dmEnabled",
  "dmMessageMaxLength",
  "dmRateLimit",
  "showIpLocation",
  "showDeviceInfo",
  "showCommentExtraMeta",
  "adminShowFullIp",
  "adminShowUserAgent",
  "adminShowDeviceDetail",
  "redirectEnabled",
  "redirectCountdown",
  "redirectWhitelist",
  "redirectTitle",
  "redirectDescription",
  "redirectDisclaimer",
  "appDownloadPopupEnabled",
  "appDownloadPopupTitle",
  "appDownloadPopupDescription",
  "appDownloadPopupImage",
  "appDownloadPopupButtonText",
  "appDownloadPopupPlatforms",
  "appDownloadPopupUrlIos",
  "appDownloadPopupUrlAndroid",
  "appDownloadPopupUrlWindows",
  "appDownloadPopupUrlMacos",
  "appDownloadPopupUrlFallback",
  "appDownloadPopupCooldownHours",
  "appDownloadPopupDelayMs",
]);

const NON_NULLABLE_KEYS = new Set([
  "siteName",
  "storageProvider",
  "captchaLogin",
  "captchaRegister",
  "captchaComment",
  "captchaForgotPassword",
]);

export const adminConfigRouter = router({
  // ========== 网站配置 ==========

  // 获取网站配置
  getSiteConfig: adminProcedure.use(requireScope("settings:manage")).query(async ({ ctx }) => {
    let config = await ctx.prisma.siteConfig.findUnique({
      where: { id: "default" },
    });

    if (!config) {
      try {
        config = await ctx.prisma.siteConfig.create({
          data: { id: "default" },
        });
      } catch (e) {
        // 并发时可能已被其他请求创建，再查一次
        config = await ctx.prisma.siteConfig.findUnique({
          where: { id: "default" },
        });
        if (!config) throw e;
      }
    }

    return config;
  }),

  // 更新网站配置
  updateSiteConfig: adminProcedure
    .use(requireScope("settings:manage"))
    .input(
      z.object({
        // 基本信息
        siteName: z.string().min(1).max(100).optional(),
        siteUrl: z.string().url().optional().nullable().or(z.literal("")),
        siteDescription: z.string().max(500).optional().nullable(),
        siteLogo: z.string().url().optional().nullable().or(z.literal("")),
        siteFavicon: z.string().url().optional().nullable().or(z.literal("")),
        siteKeywords: z.string().max(500).optional().nullable(),

        // SEO / 验证
        googleVerification: z.string().max(200).optional().nullable().or(z.literal("")),
        githubUrl: z.string().url().optional().nullable().or(z.literal("")),
        securityEmail: z.string().email().optional().nullable().or(z.literal("")),

        // 公告
        announcement: z.string().max(2000).optional().nullable(),
        announcementEnabled: z.boolean().optional(),

        // 功能开关
        allowRegistration: z.boolean().optional(),
        allowUpload: z.boolean().optional(),
        allowComment: z.boolean().optional(),
        requireLoginToComment: z.boolean().optional(),
        requireEmailVerify: z.boolean().optional(),

        // 内容分区开关
        sectionCompositeEnabled: z.boolean().optional(),
        sectionVideoEnabled: z.boolean().optional(),
        sectionImageEnabled: z.boolean().optional(),
        sectionGameEnabled: z.boolean().optional(),

        // 分区排序选项（逗号分隔，可选值: latest,views,likes,title）
        videoSortOptions: z.string().max(200).optional(),
        gameSortOptions: z.string().max(200).optional(),
        imageSortOptions: z.string().max(200).optional(),
        videoDefaultSort: z.enum(["latest", "views", "likes", "titleAsc", "titleDesc"]).optional(),
        gameDefaultSort: z.enum(["latest", "views", "likes", "titleAsc", "titleDesc"]).optional(),
        imageDefaultSort: z.enum(["latest", "views", "likes", "titleAsc", "titleDesc"]).optional(),

        // 内容设置
        videoSelectorMode: z.enum(["series", "author", "uploader", "disabled"]).optional(),
        videoSelectorMaxCount: z.number().int().min(10).max(10000).optional(),
        videoSelectorSeriesType: z.string().max(40).optional().nullable().or(z.literal("")),
        seriesTypes: z
          .array(
            z.object({
              code: z
                .string()
                .min(1)
                .max(40)
                .regex(/^[a-z0-9_]+$/, "只允许小写字母、数字和下划线")
                .refine((v) => v !== "all", 'code 不能是保留字 "all"'),
              label: z.string().min(1).max(40),
              color: z.string().max(32).optional().nullable().or(z.literal("")),
              description: z.string().max(200).optional().nullable().or(z.literal("")),
            }),
          )
          .max(50)
          .optional()
          .nullable(),
        videosPerPage: z.number().int().min(5).max(100).optional(),
        commentsPerPage: z.number().int().min(5).max(100).optional(),
        maxUploadSize: z.number().int().min(10).max(10000).optional(),
        allowedVideoFormats: z.string().max(200).optional(),
        adminBatchLimit: z.number().int().min(100).max(100000).optional(),
        uploadBatchLimit: z.number().int().min(1).max(100000).optional(),

        // 媒体 / 图片压缩
        imageCompressEnabled: z.boolean().optional(),
        imageCompressProfiles: z
          .record(
            z.enum(["avatar", "cover", "misc", "sticker"]),
            z.object({
              enabled: z.boolean(),
              format: z.enum(["webp", "avif"]),
              quality: z.number().int().min(1).max(100),
              lossless: z.boolean(),
              maxWidth: z.number().int().min(16).max(8192),
              maxHeight: z.number().int().min(16).max(8192),
            }),
          )
          .optional()
          .nullable(),
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
          .max(30)
          .optional()
          .nullable(),
        coverWidth: z.number().int().min(256).max(4096).optional(),
        coverAvifQuality: z.number().int().min(1).max(100).optional(),
        coverAvifEffort: z.number().int().min(0).max(9).optional(),
        coverWebpQuality: z.number().int().min(1).max(100).optional(),
        coverJpegQuality: z.number().int().min(1).max(100).optional(),
        coverProxyThumbEnabled: z.boolean().optional(),
        thumbnailPresets: z
          .record(
            z.enum(["gridPrimary", "gridSecondary", "detailGrid", "sideList", "microThumb", "adminTable"]),
            z.object({
              width: z.number().int().min(16).max(4096),
              height: z.number().int().min(16).max(4096),
              quality: z.number().int().min(1).max(100),
              forceThumb: z.boolean(),
            }),
          )
          .optional()
          .nullable(),

        // 联系方式
        contactEmail: z.string().email().optional().nullable().or(z.literal("")),
        socialLinks: z.record(z.string(), z.string()).optional().nullable(),

        // 法律与信息页面
        privacyPolicy: z.string().max(50000).optional().nullable(),
        termsOfService: z.string().max(50000).optional().nullable(),
        aboutPage: z.string().max(50000).optional().nullable(),

        // 页脚
        footerText: z.string().max(1000).optional().nullable(),
        footerLinks: z
          .array(
            z.object({
              label: z.string().min(1).max(50),
              url: z.string().url(),
            }),
          )
          .max(10)
          .optional()
          .nullable(),

        // 备案
        icpBeian: z.string().max(100).optional().nullable(),
        publicSecurityBeian: z.string().max(100).optional().nullable(),

        // 广告系统
        adsEnabled: z.boolean().optional(),

        // 广告门
        adGateEnabled: z.boolean().optional(),
        adGateViewsRequired: z.number().int().min(1).max(20).optional(),
        adGateHours: z.number().int().min(1).max(168).optional(),

        // 广告列表（统一管理，广告门和页面广告位共用）
        sponsorAds: z
          .array(
            z.object({
              id: z.string().max(50).optional(),
              title: z.string().min(1).max(200),
              platform: z.string().max(100).optional().default(""),
              // url 对图片广告必填，对 html 广告可空，故放宽校验
              url: z.string().max(2000).optional().default(""),
              description: z.string().max(500).optional().default(""),
              imageUrl: z.string().max(2000).optional().default(""),
              images: z
                .object({
                  banner: z.string().max(2000).optional().default(""),
                  card: z.string().max(2000).optional().default(""),
                  sidebar: z.string().max(2000).optional().default(""),
                })
                .optional()
                .nullable(),
              weight: z.number().int().min(1).max(100).optional().default(1),
              enabled: z.boolean().optional().default(true),
              positions: z
                .array(
                  z.enum([
                    "all",
                    "sidebar",
                    "header",
                    "header-carousel",
                    "in-feed",
                    "ad-gate",
                    "video-detail",
                    "comment",
                    "profile",
                    "search",
                    "category",
                    "floating",
                    "popup",
                  ]),
                )
                .optional()
                .default(["all"]),
              /** @deprecated 兼容旧数据，读取时由客户端 normalizePositions 处理 */
              position: z
                .enum([
                  "all",
                  "sidebar",
                  "header",
                  "header-carousel",
                  "in-feed",
                  "ad-gate",
                  "video-page",
                  "video-detail",
                  "comment",
                  "profile",
                  "search",
                  "category",
                  "floating",
                  "popup",
                ])
                .optional(),
              startDate: z.string().nullable().optional(),
              endDate: z.string().nullable().optional(),
              createdAt: z.string().optional(),
              // 扩展字段
              kind: z.enum(["image", "html"]).optional().default("image"),
              html: z.string().max(20000).optional().nullable(),
              notes: z.string().max(1000).optional().nullable(),
              targeting: z
                .object({
                  devices: z
                    .array(z.enum(["desktop", "mobile", "tablet", "tauri"]))
                    .max(4)
                    .optional(),
                  loginStates: z
                    .array(z.enum(["guest", "user"]))
                    .max(2)
                    .optional(),
                  categories: z.array(z.string().max(64)).max(20).optional(),
                  locales: z.array(z.string().max(20)).max(20).optional(),
                })
                .optional()
                .nullable(),
              schedule: z
                .object({
                  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
                  hourRanges: z
                    .array(z.tuple([z.number().min(0).max(24), z.number().min(0).max(24)]))
                    .max(8)
                    .optional(),
                })
                .optional()
                .nullable(),
              caps: z
                .object({
                  dailyImpressions: z.number().int().min(0).nullable().optional(),
                  dailyClicks: z.number().int().min(0).nullable().optional(),
                  totalImpressions: z.number().int().min(0).nullable().optional(),
                  totalClicks: z.number().int().min(0).nullable().optional(),
                })
                .optional()
                .nullable(),
            }),
          )
          .max(200)
          .optional()
          .nullable(),

        // 验证码 / 人机验证
        captchaLogin: z.enum(["none", "math", "slider", "turnstile", "recaptcha", "hcaptcha"]).optional(),
        captchaRegister: z.enum(["none", "math", "slider", "turnstile", "recaptcha", "hcaptcha"]).optional(),
        captchaComment: z.enum(["none", "math", "slider", "turnstile", "recaptcha", "hcaptcha"]).optional(),
        captchaForgotPassword: z.enum(["none", "math", "slider", "turnstile", "recaptcha", "hcaptcha"]).optional(),
        turnstileSiteKey: z.string().max(500).optional().nullable().or(z.literal("")),
        turnstileSecretKey: z.string().max(500).optional().nullable().or(z.literal("")),
        recaptchaSiteKey: z.string().max(500).optional().nullable().or(z.literal("")),
        recaptchaSecretKey: z.string().max(500).optional().nullable().or(z.literal("")),
        hcaptchaSiteKey: z.string().max(500).optional().nullable().or(z.literal("")),
        hcaptchaSecretKey: z.string().max(500).optional().nullable().or(z.literal("")),

        // 用户文件上传
        fileUploadEnabled: z.boolean().optional(),
        fileStorageRouteRules: z
          .array(
            z.object({
              mimePattern: z.string(),
              policyId: z.string(),
            }),
          )
          .optional()
          .nullable(),
        fileDefaultPolicyId: z.string().optional().nullable().or(z.literal("")),

        // 网盘导入
        cloudImportEnabled: z.boolean().optional(),
        dropboxAppKey: z.string().max(200).optional().nullable().or(z.literal("")),

        // 对象存储
        storageProvider: z.enum(["local", "s3", "r2", "minio", "oss", "cos"]).optional(),
        storageEndpoint: z.string().max(500).optional().nullable().or(z.literal("")),
        storageBucket: z.string().max(200).optional().nullable().or(z.literal("")),
        storageRegion: z.string().max(100).optional().nullable().or(z.literal("")),
        storageAccessKey: z.string().max(500).optional().nullable().or(z.literal("")),
        storageSecretKey: z.string().max(500).optional().nullable().or(z.literal("")),
        storageCustomDomain: z.string().max(500).optional().nullable().or(z.literal("")),
        storagePathPrefix: z.string().max(200).optional().nullable().or(z.literal("")),

        // SMTP 邮件
        mailSendMode: z.enum(["smtp", "http_api"]).optional(),
        smtpHost: z.string().max(500).optional().nullable().or(z.literal("")),
        smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
        smtpUser: z.string().max(500).optional().nullable().or(z.literal("")),
        smtpPassword: z.string().max(500).optional().nullable().or(z.literal("")),
        smtpFrom: z.string().max(500).optional().nullable().or(z.literal("")),
        mailApiUrl: z.string().url().optional().nullable().or(z.literal("")),
        mailApiKey: z.string().max(1000).optional().nullable().or(z.literal("")),
        mailApiFrom: z.string().max(500).optional().nullable().or(z.literal("")),
        mailApiHeaders: z.string().max(10000).optional().nullable().or(z.literal("")),

        // 上传目录
        uploadDir: z.string().max(500).optional(),

        // 搜索引擎推送
        indexNowKey: z.string().max(500).optional().nullable().or(z.literal("")),
        googleServiceAccountEmail: z.string().max(500).optional().nullable().or(z.literal("")),
        googlePrivateKey: z.string().max(10000).optional().nullable().or(z.literal("")),

        // 推广系统
        referralEnabled: z.boolean().optional(),
        referralPointsPerUser: z.number().int().min(1).max(100000).optional(),

        // 积分规则
        pointsRules: z
          .record(
            z.string(),
            z.object({
              enabled: z.boolean(),
              points: z.number().int().min(0).max(10000),
              dailyLimit: z.number().int().min(0).max(1000),
            }),
          )
          .optional()
          .nullable(),

        // 签到系统
        checkinEnabled: z.boolean().optional(),
        checkinPointsMin: z.number().int().min(1).max(100000).optional(),
        checkinPointsMax: z.number().int().min(1).max(100000).optional(),

        // USDT 支付
        usdtPaymentEnabled: z.boolean().optional(),
        usdtWalletAddress: z.string().max(100).optional().nullable().or(z.literal("")),
        usdtPointsPerUnit: z.number().int().min(1).optional(),
        usdtOrderTimeoutMin: z.number().int().min(5).max(1440).optional(),
        usdtMinAmount: z.number().min(0).optional().nullable(),
        usdtMaxAmount: z.number().min(0).optional().nullable(),

        // 数据备份
        backupEnabled: z.boolean().optional(),
        backupIntervalHours: z.number().int().min(1).max(720).optional(),
        backupRetentionDays: z.number().int().min(1).max(365).optional(),
        backupIncludeUploads: z.boolean().optional(),
        backupIncludeConfig: z.boolean().optional(),

        // 个性化样式
        themeHue: z.number().int().min(0).max(360).optional(),
        themeColorTemp: z.number().int().min(-100).max(100).optional(),
        themeBorderRadius: z.number().min(0).max(2).optional(),
        themeGlassOpacity: z.number().min(0).max(1).optional(),
        themeAnimations: z.boolean().optional(),

        // 动画细分配置
        animationSpeed: z.number().min(0.5).max(2.0).optional(),
        animationPageTransition: z.boolean().optional(),
        animationStagger: z.boolean().optional(),
        animationHover: z.boolean().optional(),
        animationDialog: z.boolean().optional(),
        animationTab: z.boolean().optional(),
        animationPreset: z.enum(["minimal", "standard", "rich"]).optional(),

        // 首页与分区页布局
        homeLayout: z
          .object({
            preset: z.enum([...HOME_LAYOUT_PRESET_IDS, "custom"] as [string, ...string[]]),
            landing: z.object({
              title: z.string().max(50),
              subtitle: z.string().max(120),
              cards: z
                .array(
                  z.object({
                    id: z.enum(LANDING_CARD_IDS as unknown as [string, ...string[]]),
                    enabled: z.boolean(),
                    title: z.string().max(40),
                    subtitle: z.string().max(100),
                  }),
                )
                .length(3),
            }),
            section: z.object({
              modules: z
                .array(
                  z.object({
                    id: z.enum(SECTION_MODULE_IDS as unknown as [string, ...string[]]),
                    enabled: z.boolean(),
                  }),
                )
                .length(4),
              gridColumns: z.object({
                mobile: z.union([z.literal(1), z.literal(2)]),
                desktop: z.union([z.literal(2), z.literal(3), z.literal(4)]),
              }),
              adDensity: z.number().int().min(0).max(50),
            }),
          })
          .optional()
          .nullable(),

        // 视觉效果
        effectEnabled: z.boolean().optional(),
        effectType: z.enum(["sakura", "firefly", "snow", "stars", "aurora", "cyber", "none"]).optional(),
        effectDensity: z.number().int().min(1).max(100).optional(),
        effectSpeed: z.number().min(0.1).max(3.0).optional(),
        effectOpacity: z.number().min(0).max(1).optional(),
        effectColor: z.string().max(50).optional().nullable().or(z.literal("")),
        soundDefaultEnabled: z.boolean().optional(),
        entrySoundUrl: z.string().max(2000).optional().nullable().or(z.literal("")),
        entrySoundVolume: z.number().min(0).max(1).optional(),
        entrySoundMode: z.enum(["session", "once", "interval"]).optional(),
        entrySoundIntervalHours: z.number().int().min(1).max(8760).optional(),

        // 频道
        channelEnabled: z.boolean().optional(),
        channelMaxPerUser: z.number().int().min(1).max(100).optional(),
        channelMaxMembers: z.number().int().min(2).max(10000).optional(),
        channelMessageMaxLength: z.number().int().min(1).max(10000).optional(),

        // 私信
        dmEnabled: z.boolean().optional(),
        dmMessageMaxLength: z.number().int().min(1).max(10000).optional(),
        dmRateLimit: z.number().int().min(1).max(300).optional(),

        // 隐私与信息展示
        showIpLocation: z.boolean().optional(),
        showDeviceInfo: z.boolean().optional(),
        showCommentExtraMeta: z.boolean().optional(),
        adminShowFullIp: z.boolean().optional(),
        adminShowUserAgent: z.boolean().optional(),
        adminShowDeviceDetail: z.boolean().optional(),

        // 外链中转
        redirectEnabled: z.boolean().optional(),
        redirectCountdown: z.number().int().min(1).max(30).optional(),
        redirectWhitelist: z.array(z.string().max(253)).max(200).optional(),
        redirectTitle: z.string().max(100).optional().nullable().or(z.literal("")),
        redirectDescription: z.string().max(500).optional().nullable().or(z.literal("")),
        redirectDisclaimer: z.string().max(500).optional().nullable().or(z.literal("")),

        // APP 下载推荐弹窗
        appDownloadPopupEnabled: z.boolean().optional(),
        appDownloadPopupTitle: z.string().max(100).optional().nullable().or(z.literal("")),
        appDownloadPopupDescription: z.string().max(2000).optional().nullable(),
        appDownloadPopupImage: z.string().url().optional().nullable().or(z.literal("")),
        appDownloadPopupButtonText: z.string().max(50).optional().nullable().or(z.literal("")),
        appDownloadPopupPlatforms: z.string().max(100).optional().nullable().or(z.literal("")),
        appDownloadPopupUrlIos: z.string().url().optional().nullable().or(z.literal("")),
        appDownloadPopupUrlAndroid: z.string().url().optional().nullable().or(z.literal("")),
        appDownloadPopupUrlWindows: z.string().url().optional().nullable().or(z.literal("")),
        appDownloadPopupUrlMacos: z.string().url().optional().nullable().or(z.literal("")),
        appDownloadPopupUrlFallback: z.string().url().optional().nullable().or(z.literal("")),
        appDownloadPopupCooldownHours: z.number().int().min(0).max(8760).optional(),
        appDownloadPopupDelayMs: z.number().int().min(0).max(60000).optional(),

        // 统计分析
        analyticsGoogleId: z.string().max(200).optional().nullable().or(z.literal("")),
        analyticsGtmId: z.string().max(200).optional().nullable().or(z.literal("")),
        analyticsCfToken: z.string().max(200).optional().nullable().or(z.literal("")),
        analyticsClarityId: z.string().max(200).optional().nullable().or(z.literal("")),
        analyticsBingVerification: z.string().max(200).optional().nullable().or(z.literal("")),

        // OAuth 社交登录
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const cleaned = Object.fromEntries(
        Object.entries(input)
          .filter(([key]) => ALLOWED_CONFIG_KEYS.has(key))
          .map(([key, value]) => [key, value === "" && !NON_NULLABLE_KEYS.has(key) ? null : value])
          .filter(([, value]) => value !== undefined),
      ) as Record<string, unknown>;

      // Json 字段传纯对象/数组，避免 Prisma 序列化问题
      if (Array.isArray(cleaned.sponsorAds)) {
        cleaned.sponsorAds = JSON.parse(JSON.stringify(cleaned.sponsorAds)) as Prisma.InputJsonValue;
      }
      if (
        cleaned.socialLinks != null &&
        typeof cleaned.socialLinks === "object" &&
        !Array.isArray(cleaned.socialLinks)
      ) {
        cleaned.socialLinks = JSON.parse(JSON.stringify(cleaned.socialLinks)) as Prisma.InputJsonValue;
      }
      if (Array.isArray(cleaned.footerLinks)) {
        cleaned.footerLinks = JSON.parse(JSON.stringify(cleaned.footerLinks)) as Prisma.InputJsonValue;
      }
      if (cleaned.pointsRules != null && typeof cleaned.pointsRules === "object") {
        cleaned.pointsRules = JSON.parse(JSON.stringify(cleaned.pointsRules)) as Prisma.InputJsonValue;
      }
      if (Array.isArray(cleaned.fileStorageRouteRules)) {
        cleaned.fileStorageRouteRules = JSON.parse(
          JSON.stringify(cleaned.fileStorageRouteRules),
        ) as Prisma.InputJsonValue;
      }
      if (cleaned.imageCompressProfiles != null && typeof cleaned.imageCompressProfiles === "object") {
        cleaned.imageCompressProfiles = JSON.parse(
          JSON.stringify(cleaned.imageCompressProfiles),
        ) as Prisma.InputJsonValue;
      }
      if (Array.isArray(cleaned.imageCompressBypassRules)) {
        cleaned.imageCompressBypassRules = JSON.parse(
          JSON.stringify(cleaned.imageCompressBypassRules),
        ) as Prisma.InputJsonValue;
      }
      if (cleaned.thumbnailPresets != null && typeof cleaned.thumbnailPresets === "object") {
        cleaned.thumbnailPresets = JSON.parse(JSON.stringify(cleaned.thumbnailPresets)) as Prisma.InputJsonValue;
      }
      if (cleaned.homeLayout != null && typeof cleaned.homeLayout === "object") {
        cleaned.homeLayout = JSON.parse(JSON.stringify(cleaned.homeLayout)) as Prisma.InputJsonValue;
      }
      if (Array.isArray(cleaned.seriesTypes)) {
        // 去重 + 仅保留必要字段
        const seen = new Set<string>();
        const list: Array<{ code: string; label: string; color?: string; description?: string }> = [];
        for (const raw of cleaned.seriesTypes as Array<Record<string, unknown>>) {
          const code = String(raw.code || "")
            .trim()
            .toLowerCase();
          const label = String(raw.label || "").trim();
          if (!code || !label || seen.has(code)) continue;
          seen.add(code);
          const color = typeof raw.color === "string" && raw.color.trim() ? raw.color.trim() : undefined;
          const description =
            typeof raw.description === "string" && raw.description.trim() ? raw.description.trim() : undefined;
          list.push({ code, label, ...(color ? { color } : {}), ...(description ? { description } : {}) });
        }
        cleaned.seriesTypes = JSON.parse(JSON.stringify(list)) as Prisma.InputJsonValue;
      }
      // "all" 表示不过滤，存为 null 简化业务侧判断
      if (cleaned.videoSelectorSeriesType === "all") {
        cleaned.videoSelectorSeriesType = null;
      }

      const config = await ctx.prisma.siteConfig.upsert({
        where: { id: "default" },
        create: { id: "default", ...cleaned } as Prisma.SiteConfigCreateInput,
        update: cleaned as Prisma.SiteConfigUpdateInput,
      });

      // 刷新内存缓存
      await reloadPublicSiteConfig();
      await reloadServerConfig();

      // OAuth 配置变更时重建 auth 实例
      const oauthChanged = Object.keys(input).some((k) => k.startsWith("oauth"));
      if (oauthChanged) {
        const { invalidateOAuthConfig } = await import("@/lib/auth");
        await invalidateOAuthConfig();
      }

      // 积分规则变更时清除内存缓存
      if (input.pointsRules !== undefined) {
        const { invalidatePointsRulesCache } = await import("@/lib/points");
        invalidatePointsRulesCache();
      }

      // 备份配置变更时热更新调度器
      if (input.backupEnabled !== undefined || input.backupIntervalHours !== undefined) {
        try {
          const { restartBackupScheduler } = await import("@/lib/backup");
          restartBackupScheduler();
        } catch {
          // 开发环境可能不可用
        }
      }

      return config;
    }),

  // ==================== 测试邮件 ====================

  sendTestEmail: adminProcedure
    .use(requireScope("settings:manage"))
    .input(z.object({ to: z.string().email() }))
    .mutation(async ({ input }) => {
      const { getServerConfig } = await import("@/lib/server-config");
      const config = await getServerConfig();

      const mode = config.mailSendMode;
      if (mode === "smtp" && !config.smtp) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "SMTP 未配置完整" });
      }
      if (mode === "http_api" && !config.httpEmailApi) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "HTTP API 未配置完整" });
      }

      const { sendMail } = await import("@/lib/email");
      const siteName = config.siteName;
      const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#f4f4f5;">
<table role="presentation" style="width:100%;border-collapse:collapse;">
<tr><td align="center" style="padding:40px 0;">
<table role="presentation" style="width:100%;max-width:600px;border-collapse:collapse;background:#fff;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,.1);">
<tr><td style="padding:40px 40px 20px;text-align:center;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:12px 12px 0 0;">
<h1 style="margin:0;color:#fff;font-size:28px;font-weight:600;">${siteName}</h1>
</td></tr>
<tr><td style="padding:40px;">
<h2 style="margin:0 0 20px;color:#18181b;font-size:24px;">邮件配置测试</h2>
<p style="color:#52525b;font-size:16px;line-height:1.6;">
如果您收到了这封邮件，说明邮件发送功能（${mode === "http_api" ? "HTTP API" : "SMTP"}）配置正确，一切正常运作。
</p>
</td></tr>
<tr><td style="padding:20px 40px 40px;text-align:center;border-top:1px solid #e4e4e7;">
<p style="margin:0;color:#a1a1aa;font-size:12px;">此邮件由系统自动发送，请勿直接回复。</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

      await sendMail(input.to, `【${siteName}】邮件配置测试`, html, siteName);
      return { success: true };
    }),

  // ==================== 配置备份与还原 ====================

  exportSiteConfig: adminProcedure.use(requireScope("settings:manage")).query(async ({ ctx }) => {
    const [config, friendLinks] = await Promise.all([
      ctx.prisma.siteConfig.findUnique({ where: { id: "default" } }),
      ctx.prisma.friendLink.findMany({ orderBy: { sort: "desc" } }),
    ]);

    if (!config) {
      throw new TRPCError({ code: "NOT_FOUND", message: "配置不存在" });
    }

    const { id: _id, createdAt: _ca, updatedAt: _ua, ...exportable } = config;
    void _id;
    void _ca;
    void _ua;
    return {
      _exportedAt: new Date().toISOString(),
      _version: 2,
      ...exportable,
      _friendLinks: friendLinks.map(({ id: _fid, createdAt: _fc, updatedAt: _fu, ...rest }) => {
        void _fid;
        void _fc;
        void _fu;
        return rest;
      }),
    };
  }),

  importSiteConfig: adminProcedure
    .use(requireScope("settings:manage"))
    .input(
      z.object({
        data: z.record(z.string(), z.unknown()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data } = input;

      const systemKeys = new Set(["_exportedAt", "_version", "_friendLinks", "id", "createdAt", "updatedAt"]);

      const cleaned = Object.fromEntries(
        Object.entries(data)
          .filter(([key]) => !systemKeys.has(key) && ALLOWED_CONFIG_KEYS.has(key))
          .filter(([, value]) => value !== undefined),
      ) as Record<string, unknown>;

      // 保证 Json 字段可序列化
      for (const jsonKey of ["sponsorAds", "socialLinks", "footerLinks", "thumbnailPresets"]) {
        if (cleaned[jsonKey] != null) {
          cleaned[jsonKey] = JSON.parse(JSON.stringify(cleaned[jsonKey])) as Prisma.InputJsonValue;
        }
      }

      let importedCount = Object.keys(cleaned).length;

      // 还原 SiteConfig
      if (importedCount > 0) {
        await ctx.prisma.siteConfig.upsert({
          where: { id: "default" },
          create: { id: "default", ...cleaned } as Prisma.SiteConfigCreateInput,
          update: cleaned as Prisma.SiteConfigUpdateInput,
        });
        await reloadPublicSiteConfig();
        await reloadServerConfig();
      }

      // 还原友情链接
      const friendLinksData = data._friendLinks;
      if (Array.isArray(friendLinksData) && friendLinksData.length > 0) {
        await ctx.prisma.friendLink.deleteMany();
        for (const link of friendLinksData) {
          if (typeof link === "object" && link !== null && "name" in link && "url" in link) {
            const fl = link as Record<string, unknown>;
            await ctx.prisma.friendLink.create({
              data: {
                name: String(fl.name),
                url: String(fl.url),
                logo: fl.logo ? String(fl.logo) : null,
                description: fl.description ? String(fl.description) : null,
                sort: typeof fl.sort === "number" ? fl.sort : 0,
                visible: fl.visible !== false,
              },
            });
          }
        }
        importedCount += friendLinksData.length;
      }

      if (importedCount === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "导入数据为空或格式不正确" });
      }

      return { imported: importedCount };
    }),
});
