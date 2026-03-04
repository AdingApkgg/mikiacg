"use client";

import { useState, useEffect } from "react";
import { useForm, useFieldArray, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Settings,
  Search,
  Loader2,
  CheckCircle,
  XCircle,
  Globe,
  Send,
  Save,
  Info,
  ToggleLeft,
  FileText,
  Link2,
  Shield,
  Megaphone,
  Plus,
  Trash2,
  HardDrive,
  Download,
  Upload,
  Sparkles,
  Volume2,
  KeyRound,
  Mail,
  FolderOpen,
  Palette,
  ShieldCheck,
  TriangleAlert,
  Copy,
} from "lucide-react";
import { toast } from "@/lib/toast-with-sound";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// 配置表单 schema
const configFormSchema = z.object({
  // 基本信息
  siteName: z.string().min(1, "网站名称不能为空").max(100),
  siteUrl: z.string().url("请输入有效的 URL").optional().nullable().or(z.literal("")),
  siteDescription: z.string().max(500).optional().nullable(),
  siteLogo: z.string().url("请输入有效的 URL").optional().nullable().or(z.literal("")),
  siteFavicon: z.string().url("请输入有效的 URL").optional().nullable().or(z.literal("")),
  siteKeywords: z.string().max(500).optional().nullable(),
  
  // SEO / 验证
  googleVerification: z.string().max(200).optional().nullable().or(z.literal("")),
  githubUrl: z.string().url("请输入有效的 URL").optional().nullable().or(z.literal("")),
  securityEmail: z.string().email("请输入有效的邮箱").optional().nullable().or(z.literal("")),
  
  // 公告
  announcement: z.string().max(2000).optional().nullable(),
  announcementEnabled: z.boolean(),
  
  // 功能开关
  allowRegistration: z.boolean(),
  allowUpload: z.boolean(),
  allowComment: z.boolean(),
  requireLoginToComment: z.boolean(),
  requireEmailVerify: z.boolean(),
  
  // 内容设置
  videosPerPage: z.number().int().min(5).max(100),
  commentsPerPage: z.number().int().min(5).max(100),
  maxUploadSize: z.number().int().min(10).max(10000),
  allowedVideoFormats: z.string().max(200),
  
  // 联系方式
  contactEmail: z.string().email("请输入有效的邮箱").optional().nullable().or(z.literal("")),
  
  // 页脚
  footerText: z.string().max(1000).optional().nullable(),
  
  // 备案
  icpBeian: z.string().max(100).optional().nullable(),
  publicSecurityBeian: z.string().max(100).optional().nullable(),

  // 广告系统
  adsEnabled: z.boolean(),

  // 广告门
  adGateEnabled: z.boolean(),
  adGateViewsRequired: z.number().int().min(1).max(20),
  adGateHours: z.number().int().min(1).max(168),

  // 广告列表（统一管理，广告门和页面广告位共用）
  sponsorAds: z.array(z.object({
    title: z.string().min(1, "标题必填").max(200),
    platform: z.string().max(100),
    url: z.string().url("请输入有效 URL"),
    description: z.string().max(500),
    imageUrl: z.string().max(2000),
    weight: z.number().int().min(1).max(100),
    enabled: z.boolean(),
  })),

  // 验证码 / 人机验证
  captchaLogin: z.enum(["none", "math", "turnstile"]).catch("math"),
  captchaRegister: z.enum(["none", "math", "turnstile"]).catch("none"),
  captchaComment: z.enum(["none", "math", "turnstile"]).catch("none"),
  captchaForgotPassword: z.enum(["none", "math", "turnstile"]).catch("none"),
  turnstileSiteKey: z.string().max(500).optional().nullable().or(z.literal("")),
  turnstileSecretKey: z.string().max(500).optional().nullable().or(z.literal("")),

  // SMTP 邮件
  smtpHost: z.string().max(500).optional().nullable().or(z.literal("")),
  smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
  smtpUser: z.string().max(500).optional().nullable().or(z.literal("")),
  smtpPassword: z.string().max(500).optional().nullable().or(z.literal("")),
  smtpFrom: z.string().max(500).optional().nullable().or(z.literal("")),

  // 上传目录
  uploadDir: z.string().max(500).optional(),

  // 搜索引擎推送密钥
  indexNowKey: z.string().max(500).optional().nullable().or(z.literal("")),
  googleServiceAccountEmail: z.string().max(500).optional().nullable().or(z.literal("")),
  googlePrivateKey: z.string().max(10000).optional().nullable().or(z.literal("")),

  // 对象存储
  storageProvider: z.enum(["local", "s3", "r2", "minio", "oss", "cos"]).catch("local"),
  storageEndpoint: z.string().max(500).optional().nullable().or(z.literal("")),
  storageBucket: z.string().max(200).optional().nullable().or(z.literal("")),
  storageRegion: z.string().max(100).optional().nullable().or(z.literal("")),
  storageAccessKey: z.string().max(500).optional().nullable().or(z.literal("")),
  storageSecretKey: z.string().max(500).optional().nullable().or(z.literal("")),
  storageCustomDomain: z.string().max(500).optional().nullable().or(z.literal("")),
  storagePathPrefix: z.string().max(200).optional().nullable().or(z.literal("")),

  // 个性化样式
  themeHue: z.number().int().min(0).max(360),
  themeColorTemp: z.number().int().min(-100).max(100),
  themeBorderRadius: z.number().min(0).max(2),
  themeGlassOpacity: z.number().min(0).max(1),
  themeAnimations: z.boolean(),

  // 视觉效果
  effectEnabled: z.boolean(),
  effectType: z.enum(["sakura", "firefly", "snow", "stars", "aurora", "cyber", "none"]).catch("sakura"),
  effectDensity: z.number().int().min(1).max(100),
  effectSpeed: z.number().min(0.1).max(3.0),
  effectOpacity: z.number().min(0).max(1),
  effectColor: z.string().max(50).optional().nullable().or(z.literal("")),
  soundDefaultEnabled: z.boolean(),

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
});

type ConfigFormValues = z.infer<typeof configFormSchema>;

type AdsFieldArrayProps = {
  control: Control<ConfigFormValues>;
  fields: Array<{ id: string }>;
  append: (item: { title: string; platform: string; url: string; description: string; imageUrl: string; weight: number; enabled: boolean }) => void;
  remove: (index: number) => void;
};

function AdsFieldArray({ control, fields, append, remove }: AdsFieldArrayProps) {
  return (
    <div className="space-y-3">
      {fields.map((field, index) => (
        <div key={field.id} className="flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">广告 #{index + 1}</span>
            <div className="flex items-center gap-2">
              <FormField
                control={control}
                name={`sponsorAds.${index}.enabled`}
                render={({ field: f }) => (
                  <FormItem className="flex items-center gap-1.5 space-y-0">
                    <FormLabel className="text-xs text-muted-foreground">启用</FormLabel>
                    <FormControl>
                      <Switch checked={f.value ?? true} onCheckedChange={f.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <FormField
              control={control}
              name={`sponsorAds.${index}.title`}
              render={({ field: f }) => (
                <FormItem>
                  <FormLabel className="text-xs">广告标题</FormLabel>
                  <FormControl>
                    <Input {...f} placeholder="例如：XXX推广" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`sponsorAds.${index}.platform`}
              render={({ field: f }) => (
                <FormItem>
                  <FormLabel className="text-xs">广告平台名</FormLabel>
                  <FormControl>
                    <Input {...f} value={f.value ?? ""} placeholder="例如：Google、百度联盟" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`sponsorAds.${index}.url`}
              render={({ field: f }) => (
                <FormItem>
                  <FormLabel className="text-xs">跳转链接</FormLabel>
                  <FormControl>
                    <Input {...f} type="url" placeholder="https://..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`sponsorAds.${index}.imageUrl`}
              render={({ field: f }) => (
                <FormItem>
                  <FormLabel className="text-xs">图片链接</FormLabel>
                  <FormControl>
                    <Input {...f} value={f.value ?? ""} placeholder="https://...图片URL" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`sponsorAds.${index}.description`}
              render={({ field: f }) => (
                <FormItem>
                  <FormLabel className="text-xs">描述（可选）</FormLabel>
                  <FormControl>
                    <Input {...f} value={f.value ?? ""} placeholder="简短广告描述" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`sponsorAds.${index}.weight`}
              render={({ field: f }) => (
                <FormItem>
                  <FormLabel className="text-xs">权重（1-100）</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={f.value ?? 1}
                      onChange={(e) => f.onChange(parseInt(e.target.value, 10) || 1)}
                      placeholder="1"
                    />
                  </FormControl>
                  <FormDescription className="text-[10px]">数值越大展示概率越高</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ title: "", platform: "", url: "", description: "", imageUrl: "", weight: 1, enabled: true })}
      >
        <Plus className="h-4 w-4 mr-2" />
        添加广告
      </Button>
    </div>
  );
}

function ThemePreviewPanel({ hue, colorTemp, borderRadius, glassOpacity, animations }: {
  hue: number;
  colorTemp: number;
  borderRadius: number;
  glassOpacity: number;
  animations: boolean;
}) {
  const accentHue = (hue + 45) % 360;
  let neutralHue = hue;
  if (colorTemp > 0) neutralHue = hue + (50 - hue) * (colorTemp / 100);
  else if (colorTemp < 0) neutralHue = hue + (220 - hue) * (-colorTemp / 100);

  const p = `oklch(0.55 0.24 ${hue})`;
  const pDark = `oklch(0.7 0.2 ${hue})`;
  const bg = `oklch(0.99 0.005 ${neutralHue})`;
  const bgDark = `oklch(0.13 0.02 ${neutralHue})`;
  const cardDarkAlpha = (a: number) => `oklch(0.18 0.025 ${hue} / ${a}%)`;
  const mutedFg = `oklch(0.5 0.03 ${hue})`;
  const mutedFgDark = `oklch(0.65 0.03 ${hue})`;
  const accent = `oklch(0.92 0.05 ${accentHue})`;
  const border = `oklch(0.9 0.02 ${hue})`;
  const borderDark = `oklch(1 0 0 / 12%)`;
  const r = `${borderRadius}rem`;
  const rSm = `${Math.max(0, borderRadius - 0.25)}rem`;

  return (
    <div className="sticky top-6 space-y-3">
      <p className="text-sm font-medium text-muted-foreground">实时预览</p>

      {/* Light mode preview */}
      <div
        className="overflow-hidden border shadow-sm"
        style={{ background: bg, borderRadius: r, borderColor: border }}
      >
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${border}` }}>
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-full" style={{ background: p }} />
            <span className="text-xs font-medium" style={{ color: `oklch(0.15 0.02 ${hue})` }}>浅色模式</span>
          </div>
          <div className="flex gap-1">
            <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#ef4444" }} />
            <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#eab308" }} />
            <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#22c55e" }} />
          </div>
        </div>
        <div className="p-3 space-y-2.5">
          <div className="flex gap-2">
            <div
              className={`px-3 py-1.5 text-[10px] text-white font-medium ${animations ? "transition-all" : ""}`}
              style={{ background: p, borderRadius: rSm }}
            >
              主要按钮
            </div>
            <div
              className="px-3 py-1.5 text-[10px] font-medium"
              style={{ background: accent, borderRadius: rSm, color: `oklch(0.25 0.1 ${accentHue})` }}
            >
              次要按钮
            </div>
            <div
              className="px-3 py-1.5 text-[10px]"
              style={{ border: `1px solid ${border}`, borderRadius: rSm, color: mutedFg }}
            >
              描边按钮
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="flex-1 h-7 px-2 flex items-center text-[10px]"
              style={{ border: `1px solid ${border}`, borderRadius: rSm, color: mutedFg, background: `oklch(0.92 0.02 ${hue})` }}
            >
              输入框...
            </div>
            <div className="h-4 w-8 rounded-full" style={{ background: p }} />
          </div>
          <div
            className="p-2.5"
            style={{ background: `oklch(1 0 0 / ${Math.round(glassOpacity * 100)}%)`, borderRadius: rSm, border: `1px solid ${border}`, backdropFilter: "blur(8px)" }}
          >
            <div className="h-2 w-3/4 rounded-full mb-1.5" style={{ background: `oklch(0.15 0.02 ${hue})`, opacity: 0.7 }} />
            <div className="h-2 w-1/2 rounded-full" style={{ background: mutedFg, opacity: 0.4 }} />
          </div>
          <div className="flex gap-1.5">
            {[hue, accentHue, (hue + 85) % 360, (hue + 135) % 360].map((ch, i) => (
              <div key={i} className="flex-1 h-6 rounded-sm" style={{ background: `oklch(0.65 0.2 ${ch})`, borderRadius: rSm, opacity: 0.8 }} />
            ))}
          </div>
        </div>
      </div>

      {/* Dark mode preview */}
      <div
        className="overflow-hidden border shadow-sm"
        style={{ background: bgDark, borderRadius: r, borderColor: borderDark }}
      >
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${borderDark}` }}>
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-full" style={{ background: pDark }} />
            <span className="text-xs font-medium" style={{ color: `oklch(0.95 0.01 ${hue})` }}>深色模式</span>
          </div>
          <div className="flex gap-1">
            <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#ef4444" }} />
            <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#eab308" }} />
            <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#22c55e" }} />
          </div>
        </div>
        <div className="p-3 space-y-2.5">
          <div className="flex gap-2">
            <div
              className={`px-3 py-1.5 text-[10px] font-medium ${animations ? "transition-all" : ""}`}
              style={{ background: pDark, borderRadius: rSm, color: `oklch(0.13 0.02 ${hue})` }}
            >
              主要按钮
            </div>
            <div
              className="px-3 py-1.5 text-[10px] font-medium"
              style={{ background: `oklch(0.35 0.1 ${accentHue})`, borderRadius: rSm, color: `oklch(0.92 0.05 ${accentHue})` }}
            >
              次要按钮
            </div>
            <div
              className="px-3 py-1.5 text-[10px]"
              style={{ border: `1px solid ${borderDark}`, borderRadius: rSm, color: mutedFgDark }}
            >
              描边按钮
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="flex-1 h-7 px-2 flex items-center text-[10px]"
              style={{ border: `1px solid ${borderDark}`, borderRadius: rSm, color: mutedFgDark, background: `oklch(1 0 0 / 15%)` }}
            >
              输入框...
            </div>
            <div className="h-4 w-8 rounded-full" style={{ background: pDark }} />
          </div>
          <div
            className="p-2.5"
            style={{ background: cardDarkAlpha(Math.round(glassOpacity * 100)), borderRadius: rSm, border: `1px solid ${borderDark}`, backdropFilter: "blur(8px)" }}
          >
            <div className="h-2 w-3/4 rounded-full mb-1.5" style={{ background: `oklch(0.95 0.01 ${hue})`, opacity: 0.7 }} />
            <div className="h-2 w-1/2 rounded-full" style={{ background: mutedFgDark, opacity: 0.4 }} />
          </div>
          <div className="flex gap-1.5">
            {[hue, accentHue, (hue + 85) % 360, (hue + 135) % 360].map((ch, i) => (
              <div key={i} className="flex-1 h-6 rounded-sm" style={{ background: `oklch(0.7 0.2 ${ch})`, borderRadius: rSm, opacity: 0.8 }} />
            ))}
          </div>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        保存后全站生效，刷新页面查看完整效果
      </p>
    </div>
  );
}

interface SearchEngineStatus {
  indexnow: { configured: boolean; keyFile: string | null };
  google: { configured: boolean; note: string | null };
}

export default function AdminSettingsPage() {
  const { data: permissions } = trpc.admin.getMyPermissions.useQuery();
  const {
    data: config,
    isLoading: configLoading,
    isError: configError,
    refetch,
  } = trpc.admin.getSiteConfig.useQuery(undefined, {
    enabled: !!permissions?.scopes.includes("settings:manage"),
    retry: 1,
  });
  const updateConfig = trpc.admin.updateSiteConfig.useMutation({
    onSuccess: () => {
      toast.success("配置已保存");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "保存失败");
    },
  });

  const exportConfig = trpc.admin.exportSiteConfig.useQuery(undefined, {
    enabled: false,
  });

  const importConfig = trpc.admin.importSiteConfig.useMutation({
    onSuccess: (result) => {
      toast.success(`已还原 ${result.imported} 项配置`);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "还原失败");
    },
  });

  const handleExportConfig = async () => {
    try {
      const result = await exportConfig.refetch();
      if (result.data) {
        const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `site-config-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("配置已导出");
      }
    } catch {
      toast.error("导出失败");
    }
  };

  const handleImportConfig = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (typeof data !== "object" || data === null) {
          toast.error("文件格式不正确");
          return;
        }
        setPendingImport(data);
        setShowImportDialog(true);
      } catch {
        toast.error("文件解析失败，请确保是有效的 JSON 文件");
      }
    };
    input.click();
  };

  const confirmImport = () => {
    if (pendingImport) {
      importConfig.mutate({ data: pendingImport });
    }
    setShowImportDialog(false);
    setPendingImport(null);
  };

  const [engineStatus, setEngineStatus] = useState<SearchEngineStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recentDays, setRecentDays] = useState(7);
  const [lastResult, setLastResult] = useState<{ type: string; message: string; time: Date } | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [pendingImport, setPendingImport] = useState<Record<string, unknown> | null>(null);

  const validEnum = <T extends string>(value: unknown, valid: readonly T[], fallback: T): T =>
    valid.includes(value as T) ? (value as T) : fallback;

  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configFormSchema),
    shouldUnregister: false,
    defaultValues: {
      siteName: "",
      siteUrl: "",
      siteDescription: "",
      siteLogo: "",
      siteFavicon: "",
      siteKeywords: "",
      googleVerification: "",
      githubUrl: "",
      securityEmail: "",
      announcement: "",
      announcementEnabled: false,
      allowRegistration: true,
      allowUpload: true,
      allowComment: true,
      requireLoginToComment: false,
      requireEmailVerify: false,
      videosPerPage: 20,
      commentsPerPage: 20,
      maxUploadSize: 500,
      allowedVideoFormats: "mp4,webm,m3u8",
      contactEmail: "",
      footerText: "",
      icpBeian: "",
      publicSecurityBeian: "",
      adsEnabled: false,
      adGateEnabled: false,
      adGateViewsRequired: 3,
      adGateHours: 12,
      sponsorAds: [],
      captchaLogin: "math",
      captchaRegister: "none",
      captchaComment: "none",
      captchaForgotPassword: "none",
      turnstileSiteKey: "",
      turnstileSecretKey: "",
      smtpHost: "",
      smtpPort: 465,
      smtpUser: "",
      smtpPassword: "",
      smtpFrom: "",
      uploadDir: "./uploads",
      indexNowKey: "",
      googleServiceAccountEmail: "",
      googlePrivateKey: "",
      storageProvider: "local",
      storageEndpoint: "",
      storageBucket: "",
      storageRegion: "",
      storageAccessKey: "",
      storageSecretKey: "",
      storageCustomDomain: "",
      storagePathPrefix: "",
      themeHue: 285,
      themeColorTemp: 0,
      themeBorderRadius: 0.625,
      themeGlassOpacity: 0.7,
      themeAnimations: true,
      effectEnabled: true,
      effectType: "sakura",
      effectDensity: 50,
      effectSpeed: 1.0,
      effectOpacity: 0.8,
      effectColor: "",
      soundDefaultEnabled: true,
      oauthGoogleClientId: "", oauthGoogleClientSecret: "",
      oauthGithubClientId: "", oauthGithubClientSecret: "",
      oauthDiscordClientId: "", oauthDiscordClientSecret: "",
      oauthAppleClientId: "", oauthAppleClientSecret: "",
      oauthTwitterClientId: "", oauthTwitterClientSecret: "",
      oauthFacebookClientId: "", oauthFacebookClientSecret: "",
      oauthMicrosoftClientId: "", oauthMicrosoftClientSecret: "",
      oauthTwitchClientId: "", oauthTwitchClientSecret: "",
      oauthSpotifyClientId: "", oauthSpotifyClientSecret: "",
      oauthLinkedinClientId: "", oauthLinkedinClientSecret: "",
      oauthGitlabClientId: "", oauthGitlabClientSecret: "",
      oauthRedditClientId: "", oauthRedditClientSecret: "",
    },
  });
  const { fields: adsFields, append: appendAd, remove: removeAd } = useFieldArray({
    control: form.control,
    name: "sponsorAds",
  });

  // 当配置加载完成后，更新表单
  useEffect(() => {
    if (config) {
      form.reset({
        siteName: config.siteName,
        siteUrl: (config as Record<string, unknown>).siteUrl as string || "",
        siteDescription: config.siteDescription || "",
        siteLogo: config.siteLogo || "",
        siteFavicon: config.siteFavicon || "",
        siteKeywords: config.siteKeywords || "",
        googleVerification: (config as Record<string, unknown>).googleVerification as string || "",
        githubUrl: (config as Record<string, unknown>).githubUrl as string || "",
        securityEmail: (config as Record<string, unknown>).securityEmail as string || "",
        announcement: config.announcement || "",
        announcementEnabled: config.announcementEnabled,
        allowRegistration: config.allowRegistration,
        allowUpload: config.allowUpload,
        allowComment: config.allowComment,
        requireLoginToComment: (config as { requireLoginToComment?: boolean }).requireLoginToComment ?? false,
        requireEmailVerify: config.requireEmailVerify,
        videosPerPage: config.videosPerPage,
        commentsPerPage: config.commentsPerPage,
        maxUploadSize: config.maxUploadSize,
        allowedVideoFormats: config.allowedVideoFormats,
        contactEmail: config.contactEmail || "",
        footerText: config.footerText || "",
        icpBeian: config.icpBeian || "",
        publicSecurityBeian: config.publicSecurityBeian || "",
        adsEnabled: (config as { adsEnabled?: boolean }).adsEnabled ?? false,
        adGateEnabled: (config as { adGateEnabled?: boolean }).adGateEnabled ?? false,
        adGateViewsRequired: (config as { adGateViewsRequired?: number }).adGateViewsRequired ?? 3,
        adGateHours: (config as { adGateHours?: number }).adGateHours ?? 12,
        sponsorAds: ((config as unknown as { sponsorAds?: ConfigFormValues["sponsorAds"] }).sponsorAds ?? []).map((item) => ({
          title: item.title ?? "",
          platform: item.platform ?? "",
          url: item.url ?? "",
          description: item.description ?? "",
          imageUrl: item.imageUrl ?? "",
          weight: item.weight ?? 1,
          enabled: item.enabled !== false,
        })),
        captchaLogin: validEnum((config as Record<string, unknown>).captchaLogin, ["none", "math", "turnstile"] as const, "math"),
        captchaRegister: validEnum((config as Record<string, unknown>).captchaRegister, ["none", "math", "turnstile"] as const, "none"),
        captchaComment: validEnum((config as Record<string, unknown>).captchaComment, ["none", "math", "turnstile"] as const, "none"),
        captchaForgotPassword: validEnum((config as Record<string, unknown>).captchaForgotPassword, ["none", "math", "turnstile"] as const, "none"),
        turnstileSiteKey: ((config as Record<string, unknown>).turnstileSiteKey as string) || "",
        turnstileSecretKey: ((config as Record<string, unknown>).turnstileSecretKey as string) || "",
        smtpHost: ((config as Record<string, unknown>).smtpHost as string) || "",
        smtpPort: ((config as Record<string, unknown>).smtpPort as number) ?? 465,
        smtpUser: ((config as Record<string, unknown>).smtpUser as string) || "",
        smtpPassword: ((config as Record<string, unknown>).smtpPassword as string) || "",
        smtpFrom: ((config as Record<string, unknown>).smtpFrom as string) || "",
        uploadDir: ((config as Record<string, unknown>).uploadDir as string) || "./uploads",
        indexNowKey: ((config as Record<string, unknown>).indexNowKey as string) || "",
        googleServiceAccountEmail: ((config as Record<string, unknown>).googleServiceAccountEmail as string) || "",
        googlePrivateKey: ((config as Record<string, unknown>).googlePrivateKey as string) || "",
        storageProvider: validEnum((config as Record<string, unknown>).storageProvider, ["local", "s3", "r2", "minio", "oss", "cos"] as const, "local"),
        storageEndpoint: ((config as Record<string, unknown>).storageEndpoint as string) || "",
        storageBucket: ((config as Record<string, unknown>).storageBucket as string) || "",
        storageRegion: ((config as Record<string, unknown>).storageRegion as string) || "",
        storageAccessKey: ((config as Record<string, unknown>).storageAccessKey as string) || "",
        storageSecretKey: ((config as Record<string, unknown>).storageSecretKey as string) || "",
        storageCustomDomain: ((config as Record<string, unknown>).storageCustomDomain as string) || "",
        storagePathPrefix: ((config as Record<string, unknown>).storagePathPrefix as string) || "",
        themeHue: (config as Record<string, unknown>).themeHue as number ?? 285,
        themeColorTemp: (config as Record<string, unknown>).themeColorTemp as number ?? 0,
        themeBorderRadius: (config as Record<string, unknown>).themeBorderRadius as number ?? 0.625,
        themeGlassOpacity: (config as Record<string, unknown>).themeGlassOpacity as number ?? 0.7,
        themeAnimations: (config as Record<string, unknown>).themeAnimations as boolean ?? true,
        effectEnabled: (config as Record<string, unknown>).effectEnabled as boolean ?? true,
        effectType: validEnum((config as Record<string, unknown>).effectType, ["sakura", "firefly", "snow", "stars", "aurora", "cyber", "none"] as const, "sakura"),
        effectDensity: (config as Record<string, unknown>).effectDensity as number ?? 50,
        effectSpeed: (config as Record<string, unknown>).effectSpeed as number ?? 1.0,
        effectOpacity: (config as Record<string, unknown>).effectOpacity as number ?? 0.8,
        effectColor: ((config as Record<string, unknown>).effectColor as string) || "",
        soundDefaultEnabled: (config as Record<string, unknown>).soundDefaultEnabled as boolean ?? true,
        ...Object.fromEntries(
          ["Google", "Github", "Discord", "Apple", "Twitter", "Facebook", "Microsoft", "Twitch", "Spotify", "Linkedin", "Gitlab", "Reddit"]
            .flatMap((k) => [
              [`oauth${k}ClientId`, ((config as Record<string, unknown>)[`oauth${k}ClientId`] as string) || ""],
              [`oauth${k}ClientSecret`, ((config as Record<string, unknown>)[`oauth${k}ClientSecret`] as string) || ""],
            ])
        ),
      });
    }
  }, [config, form]);

  useEffect(() => {
    fetch("/api/indexnow")
      .then((res) => res.json())
      .then(setEngineStatus)
      .catch(() => setEngineStatus({
        indexnow: { configured: false, keyFile: null },
        google: { configured: false, note: null },
      }));
  }, []);

  const handleSubmitIndex = async (type: "recent" | "all" | "site" | "sitemap") => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/indexnow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, days: recentDays }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        setLastResult({ type, message: data.message, time: new Date() });
      } else {
        toast.error(data.error || "提交失败");
      }
    } catch {
      toast.error("请求失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = (values: ConfigFormValues) => {
    updateConfig.mutate(values);
  };

  const onFormError = (errors: Record<string, unknown>) => {
    const keys = Object.keys(errors);
    if (keys.length > 0) {
      toast.error(`表单验证失败：${keys.join(", ")} 字段有误`);
    }
  };

  if (!permissions?.scopes.includes("settings:manage")) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        您没有系统设置权限
      </div>
    );
  }

  if (configLoading && !config) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {configError && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          配置加载失败，请点击下方「保存设置」尝试创建或刷新后重试。
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            系统设置
          </h1>
          <p className="text-muted-foreground mt-1">
            配置网站的系统参数
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportConfig}>
            <Download className="h-4 w-4 mr-1" />
            备份配置
          </Button>
          <Button variant="outline" size="sm" onClick={handleImportConfig}>
            <Upload className="h-4 w-4 mr-1" />
            还原配置
          </Button>
        </div>
      </div>

      <AlertDialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认还原配置</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>还原将覆盖当前的所有系统配置（含友情链接），此操作不可撤销。建议先备份当前配置后再还原。</p>
                {typeof pendingImport?._exportedAt === "string" && (
                  <p className="mt-2 text-xs">
                    配置备份时间：{new Date(pendingImport._exportedAt).toLocaleString()}
                  </p>
                )}
                {Array.isArray(pendingImport?._friendLinks) && (
                  <p className="mt-1 text-xs">
                    包含 {(pendingImport._friendLinks as unknown[]).length} 条友情链接
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmImport} disabled={importConfig.isPending}>
              {importConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              确认还原
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Tabs defaultValue="basic" className="space-y-4">
        <TabsList className="grid w-full grid-cols-6 sm:grid-cols-12 lg:w-auto lg:inline-grid">
          <TabsTrigger value="basic" className="gap-2">
            <Info className="h-4 w-4" />
            <span className="hidden sm:inline">基本信息</span>
          </TabsTrigger>
          <TabsTrigger value="features" className="gap-2">
            <ToggleLeft className="h-4 w-4" />
            <span className="hidden sm:inline">功能开关</span>
          </TabsTrigger>
          <TabsTrigger value="captcha" className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">验证码</span>
          </TabsTrigger>
          <TabsTrigger value="theme" className="gap-2">
            <Palette className="h-4 w-4" />
            <span className="hidden sm:inline">个性化样式</span>
          </TabsTrigger>
          <TabsTrigger value="effects" className="gap-2">
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">视觉效果</span>
          </TabsTrigger>
          <TabsTrigger value="content" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">内容设置</span>
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">邮件</span>
          </TabsTrigger>
          <TabsTrigger value="storage" className="gap-2">
            <HardDrive className="h-4 w-4" />
            <span className="hidden sm:inline">对象存储</span>
          </TabsTrigger>
          <TabsTrigger value="footer" className="gap-2">
            <Link2 className="h-4 w-4" />
            <span className="hidden sm:inline">页脚备案</span>
          </TabsTrigger>
          <TabsTrigger value="ads" className="gap-2">
            <Megaphone className="h-4 w-4" />
            <span className="hidden sm:inline">广告</span>
          </TabsTrigger>
          <TabsTrigger value="seo" className="gap-2">
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">SEO</span>
          </TabsTrigger>
          <TabsTrigger value="oauth" className="gap-2">
            <KeyRound className="h-4 w-4" />
            <span className="hidden sm:inline">社交登录</span>
          </TabsTrigger>
        </TabsList>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, onFormError)}>
            {/* 基本信息 */}
            <TabsContent value="basic" forceMount className="data-[state=inactive]:hidden">
              <Card>
                <CardHeader>
                  <CardTitle>基本信息</CardTitle>
                  <CardDescription>设置网站的基本信息</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="siteName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>网站名称</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Your Site Name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="siteUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>站点 URL</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} placeholder="https://www.example.com" />
                        </FormControl>
                        <FormDescription>站点的访问地址，用于生成 SEO、Sitemap、RSS 等。留空则使用 .env 中的 NEXT_PUBLIC_APP_URL</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="siteDescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>网站描述</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            value={field.value || ""}
                            placeholder="一句话介绍你的网站..."
                            rows={3}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="siteLogo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Logo URL</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} placeholder="https://..." />
                          </FormControl>
                          <FormDescription>留空使用默认 Logo</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="siteFavicon"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Favicon URL</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} placeholder="https://..." />
                          </FormControl>
                          <FormDescription>留空使用默认图标</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="siteKeywords"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SEO 关键词</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} placeholder="关键词1,关键词2,关键词3" />
                        </FormControl>
                        <FormDescription>多个关键词用逗号分隔</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contactEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>联系邮箱</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} type="email" placeholder="admin@example.com" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-3">公告设置</h4>
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="announcementEnabled"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                              <FormLabel>启用公告</FormLabel>
                              <FormDescription>在首页顶部显示公告横幅</FormDescription>
                            </div>
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="announcement"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>公告内容</FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                value={field.value || ""}
                                placeholder="支持 Markdown 格式..."
                                rows={4}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <Button type="submit" disabled={updateConfig.isPending}>
                    {updateConfig.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    保存设置
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 功能开关 */}
            <TabsContent value="features" forceMount className="data-[state=inactive]:hidden">
              <Card>
                <CardHeader>
                  <CardTitle>功能开关</CardTitle>
                  <CardDescription>控制网站各项功能的开启/关闭</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="allowRegistration"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>允许注册</FormLabel>
                          <FormDescription>关闭后新用户将无法注册</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="requireEmailVerify"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>注册邮箱验证</FormLabel>
                          <FormDescription>注册时需要验证邮箱</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="allowUpload"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>允许上传</FormLabel>
                          <FormDescription>关闭后用户将无法上传视频</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="allowComment"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>允许评论</FormLabel>
                          <FormDescription>关闭后用户将无法发表评论</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="requireLoginToComment"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>评论需要登录</FormLabel>
                          <FormDescription>开启后只有登录用户才能发表评论，关闭则允许匿名评论</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <Button type="submit" disabled={updateConfig.isPending}>
                    {updateConfig.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    保存设置
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 个性化样式 */}
            <TabsContent value="theme" forceMount className="data-[state=inactive]:hidden">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                {/* 左侧：设置控件 */}
                <div className="xl:col-span-2 space-y-4">
                  {/* 主题色 */}
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="text-base">主题色</CardTitle>
                      <CardDescription>选择全站主色调，影响按钮、链接、高亮等所有主色元素</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="themeHue"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-6 w-6 rounded-full border shadow-sm"
                                  style={{ background: `oklch(0.6 0.24 ${field.value})` }}
                                />
                                <span className="text-sm font-medium">{field.value}°</span>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => field.onChange(285)}
                              >
                                重置
                              </Button>
                            </div>
                            <FormControl>
                              <div
                                className="relative h-3 rounded-full cursor-pointer"
                                style={{
                                  background: "linear-gradient(to right, oklch(0.6 0.24 0), oklch(0.6 0.24 30), oklch(0.6 0.24 60), oklch(0.6 0.24 90), oklch(0.6 0.24 120), oklch(0.6 0.24 150), oklch(0.6 0.24 180), oklch(0.6 0.24 210), oklch(0.6 0.24 240), oklch(0.6 0.24 270), oklch(0.6 0.24 300), oklch(0.6 0.24 330), oklch(0.6 0.24 360))",
                                }}
                              >
                                <input
                                  type="range"
                                  min={0}
                                  max={360}
                                  value={field.value}
                                  onChange={(e) => field.onChange(Number(e.target.value))}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                <div
                                  className="absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 border-white shadow-md pointer-events-none"
                                  style={{
                                    left: `calc(${(field.value / 360) * 100}% - 10px)`,
                                    background: `oklch(0.6 0.24 ${field.value})`,
                                  }}
                                />
                              </div>
                            </FormControl>
                            <div className="flex flex-wrap gap-1.5 pt-3">
                              {([
                                { hue: 0, label: "红", emoji: "🔴" },
                                { hue: 25, label: "橙", emoji: "🟠" },
                                { hue: 60, label: "黄", emoji: "🟡" },
                                { hue: 145, label: "绿", emoji: "🟢" },
                                { hue: 200, label: "蓝", emoji: "🔵" },
                                { hue: 270, label: "紫", emoji: "🟣" },
                                { hue: 285, label: "默认", emoji: "💜" },
                                { hue: 330, label: "粉", emoji: "🩷" },
                              ] as const).map(({ hue, label }) => (
                                <button
                                  key={hue}
                                  type="button"
                                  onClick={() => field.onChange(hue)}
                                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs border transition-all ${
                                    field.value === hue
                                      ? "border-foreground/30 bg-foreground/5 font-medium"
                                      : "border-transparent hover:border-border hover:bg-muted/50"
                                  }`}
                                >
                                  <span
                                    className="h-3 w-3 rounded-full shrink-0"
                                    style={{ background: `oklch(0.6 0.24 ${hue})` }}
                                  />
                                  {label}
                                </button>
                              ))}
                            </div>
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  {/* 色温 & 圆角 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-4">
                        <CardTitle className="text-base">色温</CardTitle>
                        <CardDescription>调节背景和中性面的冷暖色调</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <FormField
                          control={form.control}
                          name="themeColorTemp"
                          render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium">
                                  {field.value === 0 ? "中性" : field.value > 0 ? `偏暖 +${field.value}` : `偏冷 ${field.value}`}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => field.onChange(0)}
                                >
                                  重置
                                </Button>
                              </div>
                              <FormControl>
                                <div
                                  className="relative h-3 rounded-full cursor-pointer"
                                  style={{
                                    background: "linear-gradient(to right, oklch(0.7 0.12 220), oklch(0.92 0.005 0), oklch(0.75 0.12 50))",
                                  }}
                                >
                                  <input
                                    type="range"
                                    min={-100}
                                    max={100}
                                    value={field.value}
                                    onChange={(e) => field.onChange(Number(e.target.value))}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  />
                                  <div
                                    className="absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 border-white shadow-md bg-background pointer-events-none"
                                    style={{
                                      left: `calc(${((field.value + 100) / 200) * 100}% - 10px)`,
                                    }}
                                  />
                                </div>
                              </FormControl>
                              <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
                                <span>冷色调</span>
                                <span>中性</span>
                                <span>暖色调</span>
                              </div>
                            </FormItem>
                          )}
                        />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-4">
                        <CardTitle className="text-base">圆角</CardTitle>
                        <CardDescription>控制按钮、卡片等组件圆角大小</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <FormField
                          control={form.control}
                          name="themeBorderRadius"
                          render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium">{field.value.toFixed(2)} rem</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => field.onChange(0.625)}
                                >
                                  重置
                                </Button>
                              </div>
                              <FormControl>
                                <input
                                  type="range"
                                  min={0}
                                  max={2}
                                  step={0.05}
                                  value={field.value}
                                  onChange={(e) => field.onChange(Number(e.target.value))}
                                  className="w-full accent-primary h-1.5"
                                />
                              </FormControl>
                              <div className="flex items-center gap-2 pt-3">
                                {([
                                  { v: 0, label: "直角" },
                                  { v: 0.375, label: "小" },
                                  { v: 0.625, label: "默认" },
                                  { v: 1.0, label: "大" },
                                  { v: 1.5, label: "超大" },
                                ] as const).map(({ v, label }) => (
                                  <button
                                    key={v}
                                    type="button"
                                    onClick={() => field.onChange(v)}
                                    className={`flex-1 h-8 border text-[10px] transition-all ${
                                      Math.abs(field.value - v) < 0.01
                                        ? "border-primary bg-primary/10 text-primary font-medium"
                                        : "border-border hover:border-primary/50"
                                    }`}
                                    style={{ borderRadius: `${v}rem` }}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </FormItem>
                          )}
                        />
                      </CardContent>
                    </Card>
                  </div>

                  {/* 透明度 & 动画 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-4">
                        <CardTitle className="text-base">玻璃态透明度</CardTitle>
                        <CardDescription>毛玻璃效果背景的通透程度</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <FormField
                          control={form.control}
                          name="themeGlassOpacity"
                          render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium">{Math.round(field.value * 100)}%</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => field.onChange(0.7)}
                                >
                                  重置
                                </Button>
                              </div>
                              <FormControl>
                                <input
                                  type="range"
                                  min={0}
                                  max={1}
                                  step={0.05}
                                  value={field.value}
                                  onChange={(e) => field.onChange(Number(e.target.value))}
                                  className="w-full accent-primary h-1.5"
                                />
                              </FormControl>
                              <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
                                <span>全透明</span>
                                <span>半透明</span>
                                <span>不透明</span>
                              </div>
                              {/* 玻璃态预览 */}
                              <div
                                className="mt-3 relative overflow-hidden rounded-lg h-16"
                                style={{
                                  background: "linear-gradient(135deg, oklch(0.6 0.24 285), oklch(0.5 0.2 330))",
                                }}
                              >
                                <div
                                  className="absolute inset-2 rounded-md flex items-center justify-center text-xs text-foreground"
                                  style={{
                                    background: `oklch(1 0 0 / ${Math.round(field.value * 100)}%)`,
                                    backdropFilter: "blur(12px)",
                                    WebkitBackdropFilter: "blur(12px)",
                                  }}
                                >
                                  玻璃态预览
                                </div>
                              </div>
                            </FormItem>
                          )}
                        />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-4">
                        <CardTitle className="text-base">动画</CardTitle>
                        <CardDescription>控制全站界面过渡与关键帧动画</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <FormField
                          control={form.control}
                          name="themeAnimations"
                          render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center justify-between rounded-lg border p-3">
                                <div className="space-y-0.5">
                                  <FormLabel className="text-sm">启用界面动画</FormLabel>
                                  <FormDescription className="text-xs">关闭后禁用所有过渡和关键帧动画</FormDescription>
                                </div>
                                <FormControl>
                                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                                </FormControl>
                              </div>
                              <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                                <div className={`h-3 w-3 rounded-full bg-primary ${field.value ? "animate-pulse" : ""}`} />
                                <span>{field.value ? "动画已启用 — 界面元素将展示过渡效果" : "动画已禁用 — 所有过渡和动画将被移除"}</span>
                              </div>
                            </FormItem>
                          )}
                        />
                      </CardContent>
                    </Card>
                  </div>

                  {/* 预设主题 */}
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="text-base">预设主题</CardTitle>
                      <CardDescription>一键应用预设的配色方案</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {([
                          { label: "默认紫", hue: 285, temp: 0, radius: 0.625, desc: "经典 ACGN 紫" },
                          { label: "海洋蓝", hue: 210, temp: -30, radius: 0.75, desc: "冷色调科技感" },
                          { label: "樱花粉", hue: 340, temp: 20, radius: 1.0, desc: "温暖少女风" },
                          { label: "森林绿", hue: 145, temp: 15, radius: 0.5, desc: "自然清新感" },
                          { label: "极光紫", hue: 270, temp: -15, radius: 0.875, desc: "梦幻冷紫" },
                          { label: "琥珀橙", hue: 30, temp: 50, radius: 0.625, desc: "活力暖色调" },
                          { label: "赛博青", hue: 185, temp: -40, radius: 0.25, desc: "赛博朋克风" },
                          { label: "薰衣草", hue: 295, temp: 10, radius: 1.25, desc: "优雅柔和紫" },
                        ] as const).map(({ label, hue, temp, radius, desc }) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => {
                              form.setValue("themeHue", hue, { shouldDirty: true });
                              form.setValue("themeColorTemp", temp, { shouldDirty: true });
                              form.setValue("themeBorderRadius", radius, { shouldDirty: true });
                            }}
                            className={`group relative overflow-hidden rounded-lg border p-3 text-left transition-all hover:shadow-sm ${
                              form.watch("themeHue") === hue && form.watch("themeColorTemp") === temp
                                ? "border-primary ring-1 ring-primary/30"
                                : "border-border hover:border-primary/40"
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1.5">
                              <div
                                className="h-4 w-4 rounded-full shrink-0"
                                style={{ background: `oklch(0.6 0.24 ${hue})` }}
                              />
                              <span className="text-sm font-medium">{label}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-tight">{desc}</p>
                            <div
                              className="absolute top-0 right-0 h-full w-1"
                              style={{ background: `oklch(0.6 0.24 ${hue})` }}
                            />
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex items-center gap-3">
                    <Button type="submit" disabled={updateConfig.isPending}>
                      {updateConfig.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      保存设置
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        form.setValue("themeHue", 285, { shouldDirty: true });
                        form.setValue("themeColorTemp", 0, { shouldDirty: true });
                        form.setValue("themeBorderRadius", 0.625, { shouldDirty: true });
                        form.setValue("themeGlassOpacity", 0.7, { shouldDirty: true });
                        form.setValue("themeAnimations", true, { shouldDirty: true });
                      }}
                    >
                      全部重置为默认
                    </Button>
                  </div>
                </div>

                {/* 右侧：实时预览 */}
                <div className="xl:col-span-1">
                  <ThemePreviewPanel
                    hue={form.watch("themeHue")}
                    colorTemp={form.watch("themeColorTemp")}
                    borderRadius={form.watch("themeBorderRadius")}
                    glassOpacity={form.watch("themeGlassOpacity")}
                    animations={form.watch("themeAnimations")}
                  />
                </div>
              </div>
            </TabsContent>

            {/* 验证码设置 */}
            <TabsContent value="captcha" forceMount className="data-[state=inactive]:hidden">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5" />
                    验证码 / 人机验证
                  </CardTitle>
                  <CardDescription>
                    为不同场景配置验证码方式。支持无验证、数学验证码和 Cloudflare Turnstile 人机验证。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* 快速统一设置 */}
                  <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
                    <Copy className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">统一设置所有场景</span>
                    <Select onValueChange={(v) => {
                      const val = v as "none" | "math" | "turnstile";
                      form.setValue("captchaLogin", val, { shouldDirty: true });
                      form.setValue("captchaRegister", val, { shouldDirty: true });
                      form.setValue("captchaComment", val, { shouldDirty: true });
                      form.setValue("captchaForgotPassword", val, { shouldDirty: true });
                    }}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="选择类型..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">全部关闭</SelectItem>
                        <SelectItem value="math">全部数学验证码</SelectItem>
                        <SelectItem value="turnstile">全部 Turnstile</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Turnstile 密钥缺失警告 */}
                  {[form.watch("captchaLogin"), form.watch("captchaRegister"), form.watch("captchaComment"), form.watch("captchaForgotPassword")].includes("turnstile") &&
                    (!form.watch("turnstileSiteKey")?.trim() || !form.watch("turnstileSecretKey")?.trim()) && (
                    <div className="flex items-start gap-2 rounded-lg border border-yellow-500/50 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-200">
                      <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>已选择 Turnstile 验证方式，但密钥尚未配置。未配置密钥时前端将自动跳过验证，请在下方填写 Cloudflare Turnstile 密钥。</span>
                    </div>
                  )}

                  {/* 各场景验证码选择器 */}
                  <div className="space-y-4">
                    {([
                      { name: "captchaLogin" as const, label: "登录", desc: "用户登录时需要完成的验证" },
                      { name: "captchaRegister" as const, label: "注册", desc: "用户注册时需要完成的验证（邮箱验证码独立于此设置）" },
                      { name: "captchaComment" as const, label: "评论", desc: "用户发表评论时需要完成的验证" },
                      { name: "captchaForgotPassword" as const, label: "忘记密码", desc: "用户重置密码时需要完成的验证" },
                    ]).map(({ name, label, desc }) => (
                      <FormField
                        key={name}
                        control={form.control}
                        name={name}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2">
                              {label}
                              <Badge variant={field.value === "none" ? "outline" : "default"} className="text-[10px] px-1.5 py-0 font-normal">
                                {field.value === "none" ? "关闭" : field.value === "math" ? "数学" : "Turnstile"}
                              </Badge>
                            </FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="选择验证码类型" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">无验证</SelectItem>
                                <SelectItem value="math">数学验证码</SelectItem>
                                <SelectItem value="turnstile">Cloudflare Turnstile</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription>{desc}</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>

                  <div className="border-t pt-6 space-y-4">
                    <h4 className="font-medium">Cloudflare Turnstile 配置</h4>
                    <FormDescription className="mt-0">
                      在 <a href="https://dash.cloudflare.com/?to=/:account/turnstile" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Cloudflare Dashboard</a> 创建 Turnstile 站点后获取密钥。选择了 Turnstile 验证方式时才需要填写。
                    </FormDescription>
                    <FormField
                      control={form.control}
                      name="turnstileSiteKey"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Site Key</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} placeholder="0x..." />
                          </FormControl>
                          <FormDescription>前端展示验证组件使用</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="turnstileSecretKey"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Secret Key</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} type="password" placeholder="0x..." />
                          </FormControl>
                          <FormDescription>服务端验证 Token 使用</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="rounded-lg border border-blue-500/50 bg-blue-500/10 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
                    <p className="font-medium mb-1">验证码类型说明</p>
                    <ul className="list-disc list-inside text-xs space-y-0.5">
                      <li><strong>无验证</strong>：不需要任何额外验证</li>
                      <li><strong>数学验证码</strong>：答案通过 HMAC 签名存储，防止自动化绕过</li>
                      <li><strong>Cloudflare Turnstile</strong>：无感人机验证，需要配置 Cloudflare 密钥</li>
                    </ul>
                  </div>

                  <Button type="submit" disabled={updateConfig.isPending}>
                    {updateConfig.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    保存设置
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 视觉效果 */}
            <TabsContent value="effects" forceMount className="data-[state=inactive]:hidden">
              <Card>
                <CardHeader>
                  <CardTitle>视觉效果</CardTitle>
                  <CardDescription>配置全站粒子动画和音效默认设置</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="effectEnabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>启用粒子效果</FormLabel>
                          <FormDescription>全站显示粒子动画背景</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="effectType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>效果类型</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="选择粒子效果" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="sakura">🌸 樱花飘落</SelectItem>
                            <SelectItem value="firefly">✨ 萤火虫</SelectItem>
                            <SelectItem value="snow">❄️ 雪花飘落</SelectItem>
                            <SelectItem value="stars">⭐ 星空闪烁</SelectItem>
                            <SelectItem value="aurora">🌌 极光</SelectItem>
                            <SelectItem value="cyber">💠 赛博雨</SelectItem>
                            <SelectItem value="none">关闭</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="effectDensity"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>粒子密度</FormLabel>
                          <span className="text-sm text-muted-foreground">{field.value}</span>
                        </div>
                        <FormControl>
                          <input
                            type="range"
                            min={1}
                            max={100}
                            value={field.value}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                            className="w-full accent-primary"
                          />
                        </FormControl>
                        <FormDescription>数值越大粒子越多（移动端自动减半）</FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="effectSpeed"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>速度倍率</FormLabel>
                          <span className="text-sm text-muted-foreground">{field.value.toFixed(1)}x</span>
                        </div>
                        <FormControl>
                          <input
                            type="range"
                            min={0.1}
                            max={3.0}
                            step={0.1}
                            value={field.value}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                            className="w-full accent-primary"
                          />
                        </FormControl>
                        <FormDescription>控制粒子运动速度</FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="effectOpacity"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>透明度</FormLabel>
                          <span className="text-sm text-muted-foreground">{Math.round(field.value * 100)}%</span>
                        </div>
                        <FormControl>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={field.value}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                            className="w-full accent-primary"
                          />
                        </FormControl>
                        <FormDescription>粒子的整体透明度</FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="effectColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>自定义颜色</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} placeholder="留空使用预设颜色，如 #ff69b4" />
                        </FormControl>
                        <FormDescription>输入十六进制颜色值覆盖默认配色</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="border-t pt-6">
                    <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                      <Volume2 className="h-4 w-4" />
                      音效设置
                    </h3>
                    <FormField
                      control={form.control}
                      name="soundDefaultEnabled"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>新用户默认开启音效</FormLabel>
                            <FormDescription>首次访问的用户是否自动启用 UI 音效</FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button type="submit" disabled={updateConfig.isPending}>
                    {updateConfig.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    保存设置
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 内容设置 */}
            <TabsContent value="content" forceMount className="data-[state=inactive]:hidden">
              <Card>
                <CardHeader>
                  <CardTitle>内容设置</CardTitle>
                  <CardDescription>配置内容相关的参数</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="videosPerPage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>每页视频数</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={5}
                              max={100}
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 20)}
                            />
                          </FormControl>
                          <FormDescription>首页每页显示的视频数量</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="commentsPerPage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>每页评论数</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={5}
                              max={100}
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 20)}
                            />
                          </FormControl>
                          <FormDescription>每页显示的评论数量</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="maxUploadSize"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>最大上传大小 (MB)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={10}
                              max={10000}
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 500)}
                            />
                          </FormControl>
                          <FormDescription>单个文件最大上传大小</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="allowedVideoFormats"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>允许的视频格式</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="mp4,webm,m3u8" />
                          </FormControl>
                          <FormDescription>逗号分隔</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button type="submit" disabled={updateConfig.isPending}>
                    {updateConfig.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    保存设置
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 邮件配置 */}
            <TabsContent value="email" forceMount className="data-[state=inactive]:hidden">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    邮件配置
                  </CardTitle>
                  <CardDescription>
                    配置 SMTP 邮件服务，用于发送验证码、通知等邮件。所有字段填写完整后邮件功能自动启用。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="smtpHost"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>SMTP 主机</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} placeholder="smtp.example.com" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="smtpPort"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>SMTP 端口</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={65535}
                              value={field.value ?? 465}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 465)}
                            />
                          </FormControl>
                          <FormDescription>通常为 465 (SSL) 或 587 (TLS)</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="smtpUser"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>SMTP 用户名</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} placeholder="user@example.com" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="smtpPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>SMTP 密码</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} type="password" placeholder="••••••••" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="smtpFrom"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>发件人地址</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} placeholder="noreply@example.com" />
                        </FormControl>
                        <FormDescription>发件人邮箱地址</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <FolderOpen className="h-4 w-4" />
                      上传设置
                    </h4>
                    <FormField
                      control={form.control}
                      name="uploadDir"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>上传目录</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || "./uploads"} placeholder="./uploads" />
                          </FormControl>
                          <FormDescription>本地文件上传的存储路径，相对于项目根目录</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button type="submit" disabled={updateConfig.isPending}>
                    {updateConfig.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    保存设置
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 对象存储 */}
            <TabsContent value="storage" forceMount className="data-[state=inactive]:hidden">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HardDrive className="h-5 w-5" />
                    对象存储
                  </CardTitle>
                  <CardDescription>
                    配置 S3 兼容的对象存储服务，用于存放图片、视频封面等静态资源。切换为对象存储后，新上传的文件将保存至远程存储桶。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                    对象存储功能尚在开发中，当前仅支持配置保存，实际上传仍使用本地存储。
                  </div>

                  <FormField
                    control={form.control}
                    name="storageProvider"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>存储提供商</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="选择存储提供商" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="local">本地存储</SelectItem>
                            <SelectItem value="s3">Amazon S3</SelectItem>
                            <SelectItem value="r2">Cloudflare R2</SelectItem>
                            <SelectItem value="minio">MinIO</SelectItem>
                            <SelectItem value="oss">阿里云 OSS</SelectItem>
                            <SelectItem value="cos">腾讯云 COS</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>选择「本地存储」时下方配置无需填写</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch("storageProvider") !== "local" && (
                    <div className="space-y-4 pt-2">
                      <FormField
                        control={form.control}
                        name="storageEndpoint"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Endpoint</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} placeholder="https://s3.amazonaws.com" />
                            </FormControl>
                            <FormDescription>S3 兼容的端点地址，如 https://s3.us-east-1.amazonaws.com</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="storageBucket"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>存储桶名称</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value || ""} placeholder="my-bucket" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="storageRegion"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>区域</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value || ""} placeholder="us-east-1" />
                              </FormControl>
                              <FormDescription>部分服务商可留空</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="storageAccessKey"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Access Key</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value || ""} placeholder="AKIA..." />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="storageSecretKey"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Secret Key</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value || ""} type="password" placeholder="••••••••" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="storageCustomDomain"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>自定义域名</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} placeholder="https://cdn.example.com" />
                            </FormControl>
                            <FormDescription>用于替换默认的存储桶域名，设置后文件公开链接将使用此域名</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="storagePathPrefix"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>路径前缀</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} placeholder="uploads/" />
                            </FormControl>
                            <FormDescription>文件在存储桶中的路径前缀，如 uploads/</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  <Button type="submit" disabled={updateConfig.isPending}>
                    {updateConfig.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    保存设置
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 页脚备案 */}
            <TabsContent value="footer" forceMount className="data-[state=inactive]:hidden">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    页脚与备案
                  </CardTitle>
                  <CardDescription>配置页脚信息和备案号</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="githubUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>GitHub 链接</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} placeholder="https://github.com/your-org/your-repo" />
                        </FormControl>
                        <FormDescription>页脚显示的 GitHub 仓库链接，留空则不显示</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="footerText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>页脚文本</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            value={field.value || ""}
                            placeholder="自定义页脚文本，支持简单 HTML..."
                            rows={3}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="icpBeian"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ICP 备案号</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} placeholder="京ICP备XXXXXXXX号" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="publicSecurityBeian"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>公安备案号</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} placeholder="京公网安备XXXXXXXXXXXXXX号" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" disabled={updateConfig.isPending}>
                    {updateConfig.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    保存设置
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 广告 */}
            <TabsContent value="ads" forceMount className="data-[state=inactive]:hidden">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Megaphone className="h-5 w-5" />
                    广告设置
                  </CardTitle>
                  <CardDescription>
                    统一管理全站广告。广告将随机展示在首页视频列表、侧栏、视频页等广告位中，广告门也使用同一广告列表。可为每条广告设置权重来调整展示概率。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="adsEnabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>启用广告</FormLabel>
                          <FormDescription>开启后，广告将展示在首页、侧栏等位置（可在「用户管理」中单独关闭某用户的广告）</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* 广告列表 */}
                  <div className="space-y-3">
                    <FormLabel>广告列表</FormLabel>
                    <FormDescription>
                      配置多条广告，系统会按权重随机选取展示。每条广告可设置图片、跳转链接、平台名和权重。
                    </FormDescription>
                    <AdsFieldArray
                      control={form.control}
                      fields={adsFields}
                      append={appendAd}
                      remove={removeAd}
                    />
                  </div>

                  {/* 广告门 */}
                  <div className="border-t pt-6 space-y-4">
                    <h4 className="font-medium">广告门</h4>
                    <FormDescription className="mt-0">
                      启用后，用户访问站点时需先点击广告链接并返回本页，满足指定次数后在设定时间内不再显示广告门。广告门使用上方同一广告列表。
                    </FormDescription>
                    <FormField
                      control={form.control}
                      name="adGateEnabled"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>启用广告门</FormLabel>
                            <FormDescription>开启后，未达成次数时访问站点会先看到广告页</FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="adGateViewsRequired"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>需观看/点击次数</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                max={20}
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 3)}
                              />
                            </FormControl>
                            <FormDescription>例如 3 次</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="adGateHours"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>免广告时长（小时）</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                max={168}
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 12)}
                              />
                            </FormControl>
                            <FormDescription>达成后多少小时内不再显示，例如 12</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <Button type="submit" disabled={updateConfig.isPending}>
                    {updateConfig.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    保存设置
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </form>
        </Form>

        {/* OAuth 社交登录 */}
        <TabsContent value="oauth" forceMount className="data-[state=inactive]:hidden">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, onFormError)}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <KeyRound className="h-5 w-5" />
                    社交登录（OAuth）
                  </CardTitle>
                  <CardDescription>
                    配置第三方 OAuth 提供商，允许用户使用社交账号登录。填入 Client ID 和 Client Secret 即可启用，清空则禁用。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {([
                    { key: "Google", label: "Google", callbackId: "google", url: "https://console.cloud.google.com/apis/credentials", urlLabel: "Google Cloud Console" },
                    { key: "Github", label: "GitHub", callbackId: "github", url: "https://github.com/settings/developers", urlLabel: "GitHub Developer Settings" },
                    { key: "Discord", label: "Discord", callbackId: "discord", url: "https://discord.com/developers/applications", urlLabel: "Discord Developer Portal" },
                    { key: "Apple", label: "Apple", callbackId: "apple", url: "https://developer.apple.com/account/resources/identifiers/list/serviceId", urlLabel: "Apple Developer" },
                    { key: "Twitter", label: "X (Twitter)", callbackId: "twitter", url: "https://developer.x.com/en/portal/dashboard", urlLabel: "X Developer Portal" },
                    { key: "Facebook", label: "Facebook", callbackId: "facebook", url: "https://developers.facebook.com/apps", urlLabel: "Meta for Developers" },
                    { key: "Microsoft", label: "Microsoft", callbackId: "microsoft", url: "https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps", urlLabel: "Azure Portal" },
                    { key: "Twitch", label: "Twitch", callbackId: "twitch", url: "https://dev.twitch.tv/console/apps", urlLabel: "Twitch Developer Console" },
                    { key: "Spotify", label: "Spotify", callbackId: "spotify", url: "https://developer.spotify.com/dashboard", urlLabel: "Spotify Developer Dashboard" },
                    { key: "Linkedin", label: "LinkedIn", callbackId: "linkedin", url: "https://www.linkedin.com/developers/apps", urlLabel: "LinkedIn Developer Portal" },
                    { key: "Gitlab", label: "GitLab", callbackId: "gitlab", url: "https://gitlab.com/-/user_settings/applications", urlLabel: "GitLab Applications" },
                    { key: "Reddit", label: "Reddit", callbackId: "reddit", url: "https://www.reddit.com/prefs/apps", urlLabel: "Reddit App Preferences" },
                  ] as const).map(({ key, label, callbackId, url, urlLabel }, idx) => {
                    const idField = `oauth${key}ClientId` as keyof ConfigFormValues;
                    const secretField = `oauth${key}ClientSecret` as keyof ConfigFormValues;
                    const hasId = form.watch(idField);
                    const hasSecret = form.watch(secretField);
                    return (
                      <div key={key}>
                        {idx > 0 && <div className="border-t mb-4" />}
                        <div className="space-y-3">
                          <h4 className="font-medium flex items-center gap-2">
                            {label}
                            {hasId && hasSecret && <Badge variant="default" className="text-xs">已启用</Badge>}
                          </h4>
                          <FormDescription>
                            在 <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{urlLabel}</a> 创建应用。回调 URL：<code className="text-xs bg-muted px-1 py-0.5 rounded">{`{站点URL}/api/auth/callback/${callbackId}`}</code>
                          </FormDescription>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <FormField
                              control={form.control}
                              name={idField}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Client ID</FormLabel>
                                  <FormControl>
                                    <Input {...field} value={(field.value as string) || ""} placeholder="Client ID" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={secretField}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Client Secret</FormLabel>
                                  <FormControl>
                                    <Input {...field} value={(field.value as string) || ""} type="password" placeholder="••••••••" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div className="rounded-lg border border-blue-500/50 bg-blue-500/10 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
                    <p className="font-medium mb-1">账号关联说明</p>
                    <ul className="list-disc list-inside text-xs space-y-0.5">
                      <li>已启用的提供商将在登录和注册页面显示对应按钮</li>
                      <li>如果 OAuth 登录的邮箱与已有账号一致，将自动关联</li>
                      <li>首次使用 OAuth 登录且邮箱无匹配时将自动创建新账号</li>
                      <li>保存后立即生效，无需重启服务</li>
                    </ul>
                  </div>

                  <Button type="submit" disabled={updateConfig.isPending}>
                    {updateConfig.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    保存设置
                  </Button>
                </CardContent>
              </Card>
            </form>
          </Form>
        </TabsContent>

        {/* SEO 搜索引擎 */}
        <TabsContent value="seo" forceMount className="data-[state=inactive]:hidden">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, onFormError)}>
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Search className="h-5 w-5" />
                    SEO 设置
                  </CardTitle>
                  <CardDescription>
                    搜索引擎验证和安全联系配置
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="googleVerification"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Google 验证码</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} placeholder="Google Search Console 验证码" />
                        </FormControl>
                        <FormDescription>Google Search Console 的网站验证码，会自动添加到页面 meta 标签中</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="securityEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>安全联系邮箱</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} type="email" placeholder="security@example.com" />
                        </FormControl>
                        <FormDescription>用于 security.txt 中的安全联系方式，留空则不显示</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-3">搜索引擎推送配置</h4>
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="indexNowKey"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>IndexNow Key</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} placeholder="your-indexnow-key" />
                            </FormControl>
                            <FormDescription>IndexNow 密钥，用于向 Bing/Yandex 等搜索引擎推送更新</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="googleServiceAccountEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Google Service Account Email</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} placeholder="xxx@xxx.iam.gserviceaccount.com" />
                            </FormControl>
                            <FormDescription>Google Search Console 服务账号邮箱</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="googlePrivateKey"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Google Private Key</FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                value={field.value || ""}
                                placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                                rows={4}
                                className="font-mono text-xs"
                              />
                            </FormControl>
                            <FormDescription>Google 服务账号私钥（PEM 格式）</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <Button type="submit" disabled={updateConfig.isPending}>
                    {updateConfig.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    保存设置
                  </Button>
                </CardContent>
              </Card>
            </form>
          </Form>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                搜索引擎推送
              </CardTitle>
              <CardDescription>
                主动通知搜索引擎索引新内容，加快收录速度
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 配置状态 */}
              <div className="space-y-2">
                <p className="text-sm font-medium">配置状态</p>
                {engineStatus === null ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">IndexNow:</span>
                      {engineStatus.indexnow.configured ? (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle className="h-3 w-3" />
                          已配置
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <XCircle className="h-3 w-3" />
                          未配置
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Google:</span>
                      {engineStatus.google.configured ? (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle className="h-3 w-3" />
                          已配置
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <XCircle className="h-3 w-3" />
                          未配置
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                <p className="font-medium mb-1">自动触发场景：</p>
                <ul className="list-disc list-inside space-y-0.5 text-xs">
                  <li>视频发布成功后</li>
                  <li>视频信息更新后</li>
                  <li>管理员审核通过后</li>
                </ul>
              </div>

              {(engineStatus?.indexnow.configured || engineStatus?.google.configured) && (
                <div className="space-y-3 pt-2 border-t">
                  <p className="text-sm font-medium">手动提交</p>
                  
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSubmitIndex("site")}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Globe className="h-4 w-4 mr-1" />}
                      提交站点页面
                    </Button>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSubmitIndex("recent")}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                        最近
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        max={365}
                        value={recentDays}
                        onChange={(e) => setRecentDays(parseInt(e.target.value) || 7)}
                        className="w-16 h-8 text-center"
                      />
                      <span className="text-sm text-muted-foreground">天</span>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSubmitIndex("all")}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                      提交全部视频
                    </Button>

                    {engineStatus?.google.configured && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSubmitIndex("sitemap")}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Globe className="h-4 w-4 mr-1" />}
                        通知 Google 更新 Sitemap
                      </Button>
                    )}
                  </div>

                  {lastResult && (
                    <p className="text-xs text-muted-foreground">
                      上次提交: {lastResult.message} ({lastResult.time.toLocaleTimeString()})
                    </p>
                  )}
                </div>
              )}

              {!engineStatus?.indexnow.configured && !engineStatus?.google.configured && (
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>请在上方「SEO 设置」卡片中配置搜索引擎推送密钥：</p>
                  <ul className="list-disc list-inside text-xs">
                    <li>IndexNow: 填写 IndexNow Key</li>
                    <li>Google: 填写 Service Account Email + Private Key</li>
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
