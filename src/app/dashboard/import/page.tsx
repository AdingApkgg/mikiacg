"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload,
  Loader2,
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  FileJson,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

interface VideoItem {
  title: string;
  videoUrl: string;
  coverUrl?: string;
  description?: string;
  shortcodeContent?: string;
  tagNames?: string[];
  customId?: string;
}

export default function ImportPage() {
  const { data: permissions } = trpc.admin.getMyPermissions.useQuery();
  const [videos, setVideos] = useState<VideoItem[]>([{
    title: "",
    videoUrl: "",
    coverUrl: "",
    description: "",
    shortcodeContent: "",
    tagNames: [],
    customId: "",
  }]);
  const [jsonInput, setJsonInput] = useState("");
  const [importResults, setImportResults] = useState<{ title: string; id?: string; error?: string }[]>([]);

  const batchImport = trpc.admin.batchImportVideos.useMutation({
    onSuccess: (data) => {
      toast.success(`导入完成: ${data.successCount} 成功, ${data.failCount} 失败`);
      setImportResults(data.results);
    },
    onError: (error) => {
      toast.error(error.message || "导入失败");
    },
  });

  const addVideo = () => {
    setVideos([...videos, {
      title: "",
      videoUrl: "",
      coverUrl: "",
      description: "",
      shortcodeContent: "",
      tagNames: [],
      customId: "",
    }]);
  };

  const removeVideo = (index: number) => {
    setVideos(videos.filter((_, i) => i !== index));
  };

  const updateVideo = (index: number, field: keyof VideoItem, value: string | string[]) => {
    const newVideos = [...videos];
    newVideos[index] = { ...newVideos[index], [field]: value };
    setVideos(newVideos);
  };

  const handleSubmit = () => {
    const validVideos = videos.filter(v => v.title && v.videoUrl);
    if (validVideos.length === 0) {
      toast.error("请至少填写一个视频");
      return;
    }
    batchImport.mutate({ videos: validVideos });
  };

  const handleJsonImport = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      const videoList: VideoItem[] = Array.isArray(parsed) ? parsed : [parsed];
      
      // 验证必要字段
      const validVideos = videoList.filter(v => v.title && v.videoUrl);
      if (validVideos.length === 0) {
        toast.error("JSON 中没有有效的视频数据");
        return;
      }
      
      batchImport.mutate({ videos: validVideos });
    } catch {
      toast.error("JSON 格式错误");
    }
  };

  if (!permissions?.scopes.includes("video:manage")) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        您没有视频管理权限
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Upload className="h-6 w-6" />
          批量导入
        </h1>
        <p className="text-muted-foreground mt-1">
          批量导入视频，支持短代码格式解析
        </p>
      </div>

      <Tabs defaultValue="form" className="space-y-4">
        <TabsList>
          <TabsTrigger value="form" className="gap-2">
            <FileText className="h-4 w-4" />
            表单导入
          </TabsTrigger>
          <TabsTrigger value="json" className="gap-2">
            <FileJson className="h-4 w-4" />
            JSON 导入
          </TabsTrigger>
        </TabsList>

        {/* 表单导入 */}
        <TabsContent value="form">
          <Card>
            <CardHeader>
              <CardTitle>批量添加视频</CardTitle>
              <CardDescription>
                填写视频信息，支持短代码格式的扩展内容
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {videos.map((video, index) => (
                <div key={index} className="p-4 border rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">视频 #{index + 1}</h4>
                    {videos.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeVideo(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>标题 *</Label>
                      <Input
                        value={video.title}
                        onChange={(e) => updateVideo(index, "title", e.target.value)}
                        placeholder="视频标题"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>视频链接 *</Label>
                      <Input
                        value={video.videoUrl}
                        onChange={(e) => updateVideo(index, "videoUrl", e.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>封面链接</Label>
                      <Input
                        value={video.coverUrl || ""}
                        onChange={(e) => updateVideo(index, "coverUrl", e.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>自定义 ID</Label>
                      <Input
                        value={video.customId || ""}
                        onChange={(e) => updateVideo(index, "customId", e.target.value)}
                        placeholder="如 av12345"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>标签（逗号分隔）</Label>
                    <Input
                      value={video.tagNames?.join(", ") || ""}
                      onChange={(e) => updateVideo(index, "tagNames", e.target.value.split(",").map(t => t.trim()).filter(Boolean))}
                      placeholder="标签1, 标签2, 标签3"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>简介</Label>
                    <Textarea
                      value={video.description || ""}
                      onChange={(e) => updateVideo(index, "description", e.target.value)}
                      placeholder="视频简介..."
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>短代码内容（可选）</Label>
                    <Textarea
                      value={video.shortcodeContent || ""}
                      onChange={(e) => updateVideo(index, "shortcodeContent", e.target.value)}
                      placeholder={`支持的格式：
{alert type="info"}公告内容{/alert}
{tabs}{tabs-pane label="介绍"}内容{/tabs-pane}{/tabs}
{cloud title="网盘" url="https://..." password=""/}
{card-list}{card-list-item}相关视频{/card-list-item}{/card-list}`}
                      rows={6}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
              ))}

              <Button variant="outline" onClick={addVideo} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                添加视频
              </Button>

              <Button 
                onClick={handleSubmit} 
                disabled={batchImport.isPending}
                className="w-full"
              >
                {batchImport.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                开始导入 ({videos.filter(v => v.title && v.videoUrl).length} 个视频)
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* JSON 导入 */}
        <TabsContent value="json">
          <Card>
            <CardHeader>
              <CardTitle>JSON 批量导入</CardTitle>
              <CardDescription>
                粘贴 JSON 数据批量导入视频
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>JSON 数据</Label>
                <Textarea
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder={`[
  {
    "title": "视频标题",
    "videoUrl": "https://...",
    "coverUrl": "https://...",
    "description": "简介",
    "tagNames": ["标签1", "标签2"],
    "shortcodeContent": "{alert type=\\"info\\"}内容{/alert}"
  }
]`}
                  rows={15}
                  className="font-mono text-sm"
                />
              </div>

              <Button 
                onClick={handleJsonImport} 
                disabled={batchImport.isPending || !jsonInput.trim()}
                className="w-full"
              >
                {batchImport.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                导入 JSON
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 导入结果 */}
      {importResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>导入结果</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {importResults.map((result, index) => (
                <div 
                  key={index} 
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    {result.id ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="truncate max-w-[300px]">{result.title}</span>
                  </div>
                  {result.id ? (
                    <Badge variant="secondary">{result.id}</Badge>
                  ) : (
                    <Badge variant="destructive">{result.error}</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
