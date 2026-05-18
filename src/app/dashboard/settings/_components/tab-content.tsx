"use client";

import { useFieldArray } from "react-hook-form";
import type { SiteConfig } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { contentTabSchema, pickContentValues } from "../_lib/schema";
import { useTabForm } from "../_lib/use-tab-form";

export function TabContent({ config }: { config: SiteConfig | undefined }) {
  const { form, onSubmit, onFormError, isPending } = useTabForm({
    schema: contentTabSchema,
    pickValues: pickContentValues,
    config,
  });

  const {
    fields: typeFields,
    append: appendType,
    remove: removeType,
    move: moveType,
  } = useFieldArray({
    control: form.control,
    name: "seriesTypes",
  });

  const selectorMode = form.watch("videoSelectorMode");
  const watchedTypes = form.watch("seriesTypes");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onFormError)}>
        <Card>
          <CardHeader>
            <CardTitle>内容设置</CardTitle>
            <CardDescription>配置内容相关的参数</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="videoSelectorMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>播放页选集器模式</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full md:w-64">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="series">合集</SelectItem>
                      <SelectItem value="author">原作者</SelectItem>
                      <SelectItem value="uploader">上传者</SelectItem>
                      <SelectItem value="disabled">关闭</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    控制播放页右侧选集器按什么维度聚合视频：合集（Series 剧集）、原作者（extraInfo 中的 author
                    字段）、上传者（UP 主）、或关闭
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="videoSelectorMaxCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>选集器视频上限</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={10}
                      max={10000}
                      className="w-full md:w-64"
                      {...field}
                      onChange={(e) => field.onChange(Number.parseInt(e.target.value, 10) || 100)}
                    />
                  </FormControl>
                  <FormDescription>
                    原作者 / 上传者模式下选集器最多拉取的视频数量（合集模式不受此限制，始终全量加载）
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="videoSelectorSeriesType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>选集器默认类型过滤</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || "all"}
                    disabled={selectorMode !== "series"}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full md:w-64">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="all">全部（不过滤）</SelectItem>
                      {watchedTypes
                        ?.filter((t) => t.code)
                        .map((t) => (
                          <SelectItem key={t.code} value={t.code}>
                            {t.label || t.code}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    仅在「合集」模式下生效：选定后选集器只展示对应类型的合集，例如「里番系列合集」。下方维护可选类型。
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 合集类型管理 */}
            <div className="space-y-3 rounded-md border p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-sm font-medium">合集类型管理</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    维护合集的可选类型，参考 hanime1.me 的「影片系列」分类。code 是数据库存储用的稳定标识，label
                    是前台显示文案。color 可填 Tailwind 颜色（如 #e11d48）。
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => appendType({ code: "", label: "", color: "", description: "" })}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  添加类型
                </Button>
              </div>

              {typeFields.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  暂无类型，点击「添加类型」开始（留空保存则回退到内置默认值）
                </p>
              ) : (
                <div className="space-y-2">
                  {typeFields.map((row, index) => (
                    <div key={row.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
                      <FormField
                        control={form.control}
                        name={`seriesTypes.${index}.code`}
                        render={({ field }) => (
                          <FormItem className="md:col-span-3">
                            <FormControl>
                              <Input placeholder="code（如 hentai_series）" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`seriesTypes.${index}.label`}
                        render={({ field }) => (
                          <FormItem className="md:col-span-3">
                            <FormControl>
                              <Input placeholder="显示名称（如 里番系列合集）" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`seriesTypes.${index}.color`}
                        render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormControl>
                              <div className="flex items-center gap-1.5">
                                <Input placeholder="#e11d48" {...field} value={field.value ?? ""} />
                                {field.value ? (
                                  <Badge
                                    variant="outline"
                                    style={{ borderColor: field.value, color: field.value }}
                                    className="shrink-0 text-[10px]"
                                  >
                                    示
                                  </Badge>
                                ) : null}
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`seriesTypes.${index}.description`}
                        render={({ field }) => (
                          <FormItem className="md:col-span-3">
                            <FormControl>
                              <Input placeholder="说明（可选）" {...field} value={field.value ?? ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="md:col-span-1 flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          disabled={index === 0}
                          onClick={() => moveType(index, index - 1)}
                          title="上移"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          disabled={index === typeFields.length - 1}
                          onClick={() => moveType(index, index + 1)}
                          title="下移"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-destructive"
                          onClick={() => removeType(index)}
                          title="删除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                        onChange={(e) => field.onChange(Number.parseInt(e.target.value, 10) || 20)}
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
                        onChange={(e) => field.onChange(Number.parseInt(e.target.value, 10) || 20)}
                      />
                    </FormControl>
                    <FormDescription>每页显示的评论数量</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                        onChange={(e) => field.onChange(Number.parseInt(e.target.value, 10) || 500)}
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

              <FormField
                control={form.control}
                name="adminBatchLimit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>后台批量操作上限</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(Number.parseInt(e.target.value, 10) || 10000)}
                      />
                    </FormControl>
                    <FormDescription>批量转移、删除等操作的最大数量</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              保存设置
            </Button>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
