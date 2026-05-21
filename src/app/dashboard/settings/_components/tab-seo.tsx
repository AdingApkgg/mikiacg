"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SiteConfig } from "@/generated/prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast-with-sound";
import { CheckCircle, Globe, Loader2, Save, Search, Send, XCircle } from "lucide-react";
import { pickSeoValues, seoTabSchema } from "../_lib/schema";
import { useTabForm } from "../_lib/use-tab-form";

export interface SearchEngineStatus {
  indexnow: { configured: boolean; keyFile: string | null };
  google: { configured: boolean; note: string | null };
}

export function TabSeo({ config }: { config: SiteConfig | undefined }) {
  const { form, onSubmit, onFormError, isPending } = useTabForm({
    schema: seoTabSchema,
    pickValues: pickSeoValues,
    config,
  });

  const { data: engineStatus = null } = useQuery<SearchEngineStatus>({
    queryKey: ["indexnow-status"],
    queryFn: () =>
      fetch("/api/indexnow")
        .then((res) => res.json() as Promise<SearchEngineStatus>)
        .catch(() => ({
          indexnow: { configured: false, keyFile: null },
          google: { configured: false, note: null },
        })),
    staleTime: 60 * 1000,
  });

  const [submittingType, setSubmittingType] = useState<"recent" | "all" | "site" | "sitemap" | null>(null);
  const [recentDays, setRecentDays] = useState(7);
  const [lastResult, setLastResult] = useState<{ type: string; message: string; time: Date } | null>(null);

  const handleSubmitIndex = async (type: "recent" | "all" | "site" | "sitemap") => {
    setSubmittingType(type);
    try {
      const res = await fetch("/api/indexnow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, days: recentDays }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (res.ok) {
        toast.success(data.message ?? "已提交");
        setLastResult({ type, message: data.message ?? "", time: new Date() });
      } else {
        toast.error(data.error || "提交失败");
      }
    } catch {
      toast.error("请求失败");
    } finally {
      setSubmittingType(null);
    }
  };

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onFormError)}>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                SEO 设置
              </CardTitle>
              <CardDescription>搜索引擎验证和安全联系配置</CardDescription>
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

              <div className="border-t pt-4">
                <h4 className="mb-3 font-medium">搜索引擎推送配置</h4>
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

              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
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
          <CardDescription>主动通知搜索引擎索引新内容（视频、游戏、图片帖、合集），加快收录速度</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

          <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            <p className="mb-1 font-medium">自动触发场景：</p>
            <ul className="list-inside list-disc space-y-0.5 text-xs">
              <li>视频 / 游戏 / 图片帖 发布或更新后</li>
              <li>管理员审核通过（视频 / 游戏 / 图片帖）</li>
              <li>合集创建或编辑后</li>
            </ul>
          </div>

          {(engineStatus?.indexnow.configured || engineStatus?.google.configured) && (
            <div className="space-y-3 border-t pt-2">
              <p className="text-sm font-medium">手动提交</p>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSubmitIndex("site")}
                  disabled={submittingType !== null}
                >
                  {submittingType === "site" ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Globe className="mr-1 h-4 w-4" />
                  )}
                  提交站点页面
                </Button>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSubmitIndex("recent")}
                    disabled={submittingType !== null}
                  >
                    {submittingType === "recent" ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-1 h-4 w-4" />
                    )}
                    最近
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={recentDays}
                    onChange={(e) => setRecentDays(parseInt(e.target.value, 10) || 7)}
                    className="h-8 w-16 text-center"
                  />
                  <span className="text-sm text-muted-foreground">天</span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSubmitIndex("all")}
                  disabled={submittingType !== null}
                >
                  {submittingType === "all" ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-1 h-4 w-4" />
                  )}
                  提交全部内容
                </Button>

                {engineStatus?.google.configured && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSubmitIndex("sitemap")}
                    disabled={submittingType !== null}
                  >
                    {submittingType === "sitemap" ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Globe className="mr-1 h-4 w-4" />
                    )}
                    通知 Google 更新 Sitemap
                  </Button>
                )}
              </div>

              <p className="text-xs text-muted-foreground">「最近」「全部内容」覆盖：视频 + 游戏 + 图片帖 + 合集</p>

              {lastResult && (
                <p className="text-xs text-muted-foreground">
                  上次提交: {lastResult.message} ({lastResult.time.toLocaleTimeString()})
                </p>
              )}
            </div>
          )}

          {!engineStatus?.indexnow.configured && !engineStatus?.google.configured && engineStatus !== null && (
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>请在上方「SEO 设置」卡片中配置搜索引擎推送密钥：</p>
              <ul className="list-inside list-disc text-xs">
                <li>IndexNow: 填写 IndexNow Key</li>
                <li>Google: 填写 Service Account Email + Private Key</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
