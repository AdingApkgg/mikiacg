"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
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
} from "lucide-react";
import { toast } from "sonner";

// 配置表单 schema
const configFormSchema = z.object({
  // 基本信息
  siteName: z.string().min(1, "网站名称不能为空").max(100),
  siteDescription: z.string().max(500).optional().nullable(),
  siteLogo: z.string().url("请输入有效的 URL").optional().nullable().or(z.literal("")),
  siteFavicon: z.string().url("请输入有效的 URL").optional().nullable().or(z.literal("")),
  siteKeywords: z.string().max(500).optional().nullable(),
  
  // 公告
  announcement: z.string().max(2000).optional().nullable(),
  announcementEnabled: z.boolean(),
  
  // 功能开关
  allowRegistration: z.boolean(),
  allowUpload: z.boolean(),
  allowComment: z.boolean(),
  allowGuestbook: z.boolean(),
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
});

type ConfigFormValues = z.infer<typeof configFormSchema>;

interface SearchEngineStatus {
  indexnow: { configured: boolean; keyFile: string | null };
  google: { configured: boolean; note: string | null };
}

export default function AdminSettingsPage() {
  const { data: permissions } = trpc.admin.getMyPermissions.useQuery();
  const { data: config, isLoading: configLoading, refetch } = trpc.admin.getSiteConfig.useQuery(
    undefined,
    { enabled: !!permissions?.scopes.includes("settings:manage") }
  );
  const updateConfig = trpc.admin.updateSiteConfig.useMutation({
    onSuccess: () => {
      toast.success("配置已保存");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "保存失败");
    },
  });

  const [engineStatus, setEngineStatus] = useState<SearchEngineStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recentDays, setRecentDays] = useState(7);
  const [lastResult, setLastResult] = useState<{ type: string; message: string; time: Date } | null>(null);

  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configFormSchema),
    defaultValues: {
      siteName: "Mikiacg",
      siteDescription: "",
      siteLogo: "",
      siteFavicon: "",
      siteKeywords: "",
      announcement: "",
      announcementEnabled: false,
      allowRegistration: true,
      allowUpload: true,
      allowComment: true,
      allowGuestbook: true,
      requireEmailVerify: false,
      videosPerPage: 20,
      commentsPerPage: 20,
      maxUploadSize: 500,
      allowedVideoFormats: "mp4,webm,m3u8",
      contactEmail: "",
      footerText: "",
      icpBeian: "",
      publicSecurityBeian: "",
    },
  });

  // 当配置加载完成后，更新表单
  useEffect(() => {
    if (config) {
      form.reset({
        siteName: config.siteName,
        siteDescription: config.siteDescription || "",
        siteLogo: config.siteLogo || "",
        siteFavicon: config.siteFavicon || "",
        siteKeywords: config.siteKeywords || "",
        announcement: config.announcement || "",
        announcementEnabled: config.announcementEnabled,
        allowRegistration: config.allowRegistration,
        allowUpload: config.allowUpload,
        allowComment: config.allowComment,
        allowGuestbook: config.allowGuestbook,
        requireEmailVerify: config.requireEmailVerify,
        videosPerPage: config.videosPerPage,
        commentsPerPage: config.commentsPerPage,
        maxUploadSize: config.maxUploadSize,
        allowedVideoFormats: config.allowedVideoFormats,
        contactEmail: config.contactEmail || "",
        footerText: config.footerText || "",
        icpBeian: config.icpBeian || "",
        publicSecurityBeian: config.publicSecurityBeian || "",
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

  if (!permissions?.scopes.includes("settings:manage")) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        您没有系统设置权限
      </div>
    );
  }

  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
      </div>

      <Tabs defaultValue="basic" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
          <TabsTrigger value="basic" className="gap-2">
            <Info className="h-4 w-4" />
            <span className="hidden sm:inline">基本信息</span>
          </TabsTrigger>
          <TabsTrigger value="features" className="gap-2">
            <ToggleLeft className="h-4 w-4" />
            <span className="hidden sm:inline">功能开关</span>
          </TabsTrigger>
          <TabsTrigger value="content" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">内容设置</span>
          </TabsTrigger>
          <TabsTrigger value="footer" className="gap-2">
            <Link2 className="h-4 w-4" />
            <span className="hidden sm:inline">页脚备案</span>
          </TabsTrigger>
          <TabsTrigger value="seo" className="gap-2">
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">SEO</span>
          </TabsTrigger>
        </TabsList>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            {/* 基本信息 */}
            <TabsContent value="basic">
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
                          <Input {...field} placeholder="Mikiacg" />
                        </FormControl>
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
            <TabsContent value="features">
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
                    name="allowGuestbook"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>允许留言</FormLabel>
                          <FormDescription>关闭后用户将无法在留言板留言</FormDescription>
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

            {/* 内容设置 */}
            <TabsContent value="content">
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

            {/* 页脚备案 */}
            <TabsContent value="footer">
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
          </form>
        </Form>

        {/* SEO 搜索引擎 */}
        <TabsContent value="seo">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
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
                  <p>请在 .env 中配置：</p>
                  <ul className="list-disc list-inside text-xs">
                    <li>IndexNow: INDEXNOW_KEY + 对应密钥文件</li>
                    <li>Google: GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY</li>
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
