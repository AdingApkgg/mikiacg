"use client";

import { useState, lazy, Suspense } from "react";
import { trpc } from "@/lib/trpc";
import { useTabParam } from "@/hooks/use-tab-param";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Settings,
  Search,
  Loader2,
  Info,
  ToggleLeft,
  FileText,
  Link2,
  HardDrive,
  Download,
  Upload,
  Sparkles,
  KeyRound,
  Mail,
  Palette,
  ShieldCheck,
  ScrollText,
  BarChart3,
  MessageSquare,
  Eye,
  ExternalLink,
  ImageIcon,
  Smartphone,
} from "lucide-react";
import { toast } from "@/lib/toast-with-sound";

const TabBasic = lazy(() => import("./_components/tab-basic").then((m) => ({ default: m.TabBasic })));
const TabFeatures = lazy(() => import("./_components/tab-features").then((m) => ({ default: m.TabFeatures })));
const TabContent = lazy(() => import("./_components/tab-content").then((m) => ({ default: m.TabContent })));
const TabTheme = lazy(() => import("./_components/tab-theme").then((m) => ({ default: m.TabTheme })));
const TabEffects = lazy(() => import("./_components/tab-effects").then((m) => ({ default: m.TabEffects })));
const TabPages = lazy(() => import("./_components/tab-pages").then((m) => ({ default: m.TabPages })));
const TabFooter = lazy(() => import("./_components/tab-footer").then((m) => ({ default: m.TabFooter })));
const TabCaptcha = lazy(() => import("./_components/tab-captcha").then((m) => ({ default: m.TabCaptcha })));
const TabOAuth = lazy(() => import("./_components/tab-oauth").then((m) => ({ default: m.TabOauth })));
const TabEmail = lazy(() => import("./_components/tab-email").then((m) => ({ default: m.TabEmail })));
const TabStorage = lazy(() => import("./_components/tab-storage").then((m) => ({ default: m.TabStorage })));
const TabSeo = lazy(() => import("./_components/tab-seo").then((m) => ({ default: m.TabSeo })));
const TabMessaging = lazy(() => import("./_components/tab-messaging").then((m) => ({ default: m.TabMessaging })));
const TabPrivacy = lazy(() => import("./_components/tab-privacy").then((m) => ({ default: m.TabPrivacy })));
const TabAnalytics = lazy(() => import("./_components/tab-analytics").then((m) => ({ default: m.TabAnalytics })));
const TabRedirect = lazy(() => import("./_components/tab-redirect").then((m) => ({ default: m.TabRedirect })));
const TabMedia = lazy(() => import("./_components/tab-media").then((m) => ({ default: m.TabMedia })));
const TabAppDownload = lazy(() =>
  import("./_components/tab-app-download").then((m) => ({ default: m.TabAppDownload })),
);

function TabLoading() {
  return (
    <div className="flex items-center justify-center h-[200px]">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function AdminSettingsPage() {
  const utils = trpc.useUtils();
  const { data: permissions } = trpc.admin.getMyPermissions.useQuery();
  const {
    data: config,
    isError: configError,
    refetch,
  } = trpc.admin.getSiteConfig.useQuery(undefined, {
    enabled: !!permissions?.scopes.includes("settings:manage"),
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const [activeTab, setActiveTab] = useTabParam("basic");
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [pendingImport, setPendingImport] = useState<Record<string, unknown> | null>(null);

  const exportConfig = trpc.admin.exportSiteConfig.useQuery(undefined, { enabled: false });

  const importConfig = trpc.admin.importSiteConfig.useMutation({
    onSuccess: async (result) => {
      toast.success(`已还原 ${result.imported} 项配置`);
      await refetch();
      utils.admin.getSiteConfig.invalidate();
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

  if (permissions && !permissions.scopes.includes("settings:manage")) {
    return <div className="flex items-center justify-center h-[400px] text-muted-foreground">您没有系统设置权限</div>;
  }

  if (!config && !configError) {
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
          <p className="text-muted-foreground mt-1">配置网站的系统参数</p>
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
                  <p className="mt-2 text-xs">配置备份时间：{new Date(pendingImport._exportedAt).toLocaleString()}</p>
                )}
                {Array.isArray(pendingImport?._friendLinks) && (
                  <p className="mt-1 text-xs">包含 {(pendingImport._friendLinks as unknown[]).length} 条友情链接</p>
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

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        orientation="vertical"
        className="flex-col md:flex-row md:gap-6 gap-4"
      >
        {/* Desktop sidebar */}
        <aside className="hidden md:block w-48 shrink-0">
          <TabsList
            variant="line"
            className="flex flex-col h-auto w-full items-stretch bg-transparent p-0 gap-0.5 sticky top-20"
          >
            <span className="text-xs font-medium text-muted-foreground/70 px-3 py-1.5 select-none">通用</span>
            <TabsTrigger value="basic" className="justify-start gap-2 px-3 h-8 text-[13px]">
              <Info className="h-3.5 w-3.5" /> 基本信息
            </TabsTrigger>
            <TabsTrigger value="features" className="justify-start gap-2 px-3 h-8 text-[13px]">
              <ToggleLeft className="h-3.5 w-3.5" /> 功能开关
            </TabsTrigger>
            <TabsTrigger value="content" className="justify-start gap-2 px-3 h-8 text-[13px]">
              <FileText className="h-3.5 w-3.5" /> 内容设置
            </TabsTrigger>
            <TabsTrigger value="media" className="justify-start gap-2 px-3 h-8 text-[13px]">
              <ImageIcon className="h-3.5 w-3.5" /> 媒体处理
            </TabsTrigger>
            <TabsTrigger value="messaging" className="justify-start gap-2 px-3 h-8 text-[13px]">
              <MessageSquare className="h-3.5 w-3.5" /> 通讯
            </TabsTrigger>
            <TabsTrigger value="app-download" className="justify-start gap-2 px-3 h-8 text-[13px]">
              <Smartphone className="h-3.5 w-3.5" /> 下载弹窗
            </TabsTrigger>

            <span className="text-xs font-medium text-muted-foreground/70 px-3 py-1.5 mt-3 select-none">外观</span>
            <TabsTrigger value="theme" className="justify-start gap-2 px-3 h-8 text-[13px]">
              <Palette className="h-3.5 w-3.5" /> 样式
            </TabsTrigger>
            <TabsTrigger value="effects" className="justify-start gap-2 px-3 h-8 text-[13px]">
              <Sparkles className="h-3.5 w-3.5" /> 视觉效果
            </TabsTrigger>

            <span className="text-xs font-medium text-muted-foreground/70 px-3 py-1.5 mt-3 select-none">页面</span>
            <TabsTrigger value="pages" className="justify-start gap-2 px-3 h-8 text-[13px]">
              <ScrollText className="h-3.5 w-3.5" /> 页面管理
            </TabsTrigger>
            <TabsTrigger value="footer" className="justify-start gap-2 px-3 h-8 text-[13px]">
              <Link2 className="h-3.5 w-3.5" /> 页脚
            </TabsTrigger>

            <span className="text-xs font-medium text-muted-foreground/70 px-3 py-1.5 mt-3 select-none">
              安全与隐私
            </span>
            <TabsTrigger value="privacy" className="justify-start gap-2 px-3 h-8 text-[13px]">
              <Eye className="h-3.5 w-3.5" /> 信息展示
            </TabsTrigger>
            <TabsTrigger value="redirect" className="justify-start gap-2 px-3 h-8 text-[13px]">
              <ExternalLink className="h-3.5 w-3.5" /> 外链中转
            </TabsTrigger>
            <TabsTrigger value="captcha" className="justify-start gap-2 px-3 h-8 text-[13px]">
              <ShieldCheck className="h-3.5 w-3.5" /> 验证码
            </TabsTrigger>
            <TabsTrigger value="oauth" className="justify-start gap-2 px-3 h-8 text-[13px]">
              <KeyRound className="h-3.5 w-3.5" /> 登录
            </TabsTrigger>
            <TabsTrigger value="email" className="justify-start gap-2 px-3 h-8 text-[13px]">
              <Mail className="h-3.5 w-3.5" /> 邮件
            </TabsTrigger>

            <span className="text-xs font-medium text-muted-foreground/70 px-3 py-1.5 mt-3 select-none">集成</span>
            <TabsTrigger value="storage" className="justify-start gap-2 px-3 h-8 text-[13px]">
              <HardDrive className="h-3.5 w-3.5" /> 存储
            </TabsTrigger>
            <TabsTrigger value="seo" className="justify-start gap-2 px-3 h-8 text-[13px]">
              <Search className="h-3.5 w-3.5" /> SEO
            </TabsTrigger>
            <TabsTrigger value="analytics" className="justify-start gap-2 px-3 h-8 text-[13px]">
              <BarChart3 className="h-3.5 w-3.5" /> 统计
            </TabsTrigger>
          </TabsList>
        </aside>

        {/* Mobile select */}
        <div className="md:hidden">
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>通用</SelectLabel>
                <SelectItem value="basic">基本信息</SelectItem>
                <SelectItem value="features">功能开关</SelectItem>
                <SelectItem value="content">内容设置</SelectItem>
                <SelectItem value="media">媒体处理</SelectItem>
                <SelectItem value="messaging">通讯</SelectItem>
                <SelectItem value="app-download">下载弹窗</SelectItem>
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>外观</SelectLabel>
                <SelectItem value="theme">样式</SelectItem>
                <SelectItem value="effects">视觉效果</SelectItem>
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>页面</SelectLabel>
                <SelectItem value="pages">页面管理</SelectItem>
                <SelectItem value="footer">页脚</SelectItem>
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>安全与隐私</SelectLabel>
                <SelectItem value="privacy">信息展示</SelectItem>
                <SelectItem value="redirect">外链中转</SelectItem>
                <SelectItem value="captcha">验证码</SelectItem>
                <SelectItem value="oauth">登录</SelectItem>
                <SelectItem value="email">邮件</SelectItem>
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>集成</SelectLabel>
                <SelectItem value="storage">存储</SelectItem>
                <SelectItem value="seo">SEO</SelectItem>
                <SelectItem value="analytics">统计</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 min-w-0">
          <Suspense fallback={<TabLoading />}>
            <TabsContent value="basic">
              <TabBasic config={config} />
            </TabsContent>

            <TabsContent value="features">
              <TabFeatures config={config} />
            </TabsContent>

            <TabsContent value="content">
              <TabContent config={config} />
            </TabsContent>

            <TabsContent value="media">
              <TabMedia config={config} />
            </TabsContent>

            <TabsContent value="messaging">
              <TabMessaging config={config} />
            </TabsContent>

            <TabsContent value="app-download">
              <TabAppDownload config={config} />
            </TabsContent>

            <TabsContent value="theme">
              <TabTheme config={config} />
            </TabsContent>

            <TabsContent value="effects">
              <TabEffects config={config} />
            </TabsContent>

            <TabsContent value="pages">
              <TabPages config={config} />
            </TabsContent>

            <TabsContent value="footer">
              <TabFooter config={config} />
            </TabsContent>

            <TabsContent value="privacy">
              <TabPrivacy config={config} />
            </TabsContent>

            <TabsContent value="redirect">
              <TabRedirect config={config} />
            </TabsContent>

            <TabsContent value="captcha">
              <TabCaptcha config={config} />
            </TabsContent>

            <TabsContent value="oauth">
              <TabOAuth config={config} />
            </TabsContent>

            <TabsContent value="email">
              <TabEmail config={config} />
            </TabsContent>

            <TabsContent value="storage">
              <TabStorage config={config} />
            </TabsContent>

            <TabsContent value="seo">
              <TabSeo config={config} />
            </TabsContent>

            <TabsContent value="analytics">
              <TabAnalytics config={config} />
            </TabsContent>
          </Suspense>
        </div>
      </Tabs>
    </div>
  );
}
