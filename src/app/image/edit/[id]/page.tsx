"use client";

import { use, useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast-with-sound";
import {
  Loader2, ArrowLeft, Plus, X, Image as ImageIcon,
  Tag, Search, AlertCircle, Trash2, Save,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const editSchema = z.object({
  title: z.string().min(1, "标题不能为空").max(200, "标题最多200个字符"),
  description: z.string().max(5000, "简介最多5000个字符").optional().or(z.literal("")),
});

type EditForm = z.infer<typeof editSchema>;

interface EditImagePageProps {
  params: Promise<{ id: string }>;
}

export default function EditImagePage({ params }: EditImagePageProps) {
  const { id } = use(params);
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTags, setSelectedTags] = useState<{ id: string; name: string }[]>([]);
  const [newTags, setNewTags] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [newTagInput, setNewTagInput] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([""]);

  const { data: post, isLoading: postLoading } = trpc.image.getForEdit.useQuery(
    { id },
    { enabled: !!session }
  );

  const { data: allTags } = trpc.tag.list.useQuery({ limit: 100 });

  const updateMutation = trpc.image.update.useMutation({
    onSuccess: () => {
      toast.success("更新成功");
      router.push(`/image/${id}`);
    },
    onError: (error) => {
      toast.error("更新失败", { description: error.message });
    },
  });

  const form = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: { title: "", description: "" },
  });

  const filteredTags = allTags?.filter((tag) => {
    if (!tagSearch.trim()) return true;
    return tag.name.toLowerCase().includes(tagSearch.toLowerCase());
  }) || [];

  const toggleTag = (tag: { id: string; name: string }) => {
    const exists = selectedTags.find((t) => t.id === tag.id);
    if (exists) {
      setSelectedTags(selectedTags.filter((t) => t.id !== tag.id));
    } else if (selectedTags.length + newTags.length < 10) {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleAddNewTag = () => {
    const tag = newTagInput.trim();
    if (!tag || newTags.length + selectedTags.length >= 10) return;
    if (newTags.includes(tag)) return;
    if (selectedTags.some((t) => t.name.toLowerCase() === tag.toLowerCase())) return;

    const existingTag = allTags?.find((t) => t.name.toLowerCase() === tag.toLowerCase());
    if (existingTag) {
      toggleTag(existingTag);
    } else {
      setNewTags([...newTags, tag]);
    }
    setNewTagInput("");
  };

  const validImages = imageUrls.filter((url) => url.trim());

  useEffect(() => {
    if (post) {
      form.reset({
        title: post.title,
        description: post.description || "",
      });
      setSelectedTags(post.tags.map((t) => ({ id: t.tag.id, name: t.tag.name })));
      const imgs = (post.images as string[]) ?? [];
      setImageUrls(imgs.length > 0 ? imgs : [""]);
    }
  }, [post, form]);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/login?callbackUrl=/image/edit/" + id);
    }
  }, [authStatus, router, id]);

  async function onSubmit(data: EditForm) {
    if (validImages.length === 0) {
      toast.error("请至少保留一张图片链接");
      return;
    }

    setIsSubmitting(true);
    try {
      await updateMutation.mutateAsync({
        id,
        title: data.title,
        description: data.description || undefined,
        images: validImages,
        tagIds: selectedTags.map((t) => t.id),
        tagNames: newTags,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (authStatus === "loading" || postLoading) {
    return (
      <div className="container py-6 max-w-5xl">
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-[300px] w-full rounded-lg" />
            <Skeleton className="h-[200px] w-full rounded-lg" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-[250px] w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!session || !post) return null;

  if (!session.user.canUpload) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="p-4 rounded-full bg-destructive/10">
          <AlertCircle className="h-12 w-12 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold">暂无编辑权限</h1>
        <p className="text-muted-foreground text-center max-w-md">
          您的账号暂未开通投稿功能，无法编辑图片帖
        </p>
        <Button asChild variant="outline">
          <Link href="/image">返回图片列表</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container py-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/image/${id}`}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">编辑图片帖</h1>
          <p className="text-sm text-muted-foreground">ID: {id}</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: main content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Basic info */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ImageIcon className="h-5 w-5" />
                    基本信息
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>标题 *</FormLabel>
                        <FormControl>
                          <Input placeholder="输入图片标题" {...field} className="text-base" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>描述</FormLabel>
                        <FormControl>
                          <Textarea placeholder="图片描述（可选）" className="min-h-[100px] resize-none" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Image URLs */}
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ImageIcon className="h-5 w-5" />
                      图片链接
                    </CardTitle>
                    <Button type="button" variant="outline" size="sm" onClick={() => setImageUrls([...imageUrls, ""])}>
                      <Plus className="h-4 w-4 mr-1" />
                      添加图片
                    </Button>
                  </div>
                  <CardDescription>管理图片 URL 链接，至少保留一张</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {imageUrls.map((url, i) => (
                    <div key={i} className="flex gap-2">
                      <div className="relative flex-1">
                        <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="https://example.com/image.jpg"
                          value={url}
                          onChange={(e) => {
                            const updated = [...imageUrls];
                            updated[i] = e.target.value;
                            setImageUrls(updated);
                          }}
                          className="pl-9"
                        />
                      </div>
                      {imageUrls.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => setImageUrls(imageUrls.filter((_, j) => j !== i))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}

                  <p className="text-xs text-muted-foreground">
                    已添加 {validImages.length} 张有效图片
                  </p>

                  {validImages.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 mt-3">
                      {validImages.map((url, i) => (
                        <div key={i} className="aspect-square rounded-md border overflow-hidden bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={`预览 ${i + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tags */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Tag className="h-5 w-5" />
                    标签
                  </CardTitle>
                  <CardDescription>选择或创建标签，最多 10 个</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(selectedTags.length > 0 || newTags.length > 0) && (
                    <div className="flex flex-wrap gap-2">
                      {selectedTags.map((tag) => (
                        <Badge
                          key={tag.id}
                          variant="default"
                          className="cursor-pointer hover:bg-primary/80 transition-colors gap-1 px-3 py-1"
                          onClick={() => toggleTag(tag)}
                        >
                          {tag.name}
                          <X className="h-3 w-3" />
                        </Badge>
                      ))}
                      {newTags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="cursor-pointer hover:bg-secondary/80 transition-colors gap-1 px-3 py-1"
                          onClick={() => setNewTags(newTags.filter((t) => t !== tag))}
                        >
                          <Plus className="h-3 w-3" />
                          {tag}
                          <X className="h-3 w-3" />
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="输入新标签名称..."
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddNewTag(); } }}
                        disabled={selectedTags.length + newTags.length >= 10}
                        className="pl-9"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAddNewTag}
                      disabled={selectedTags.length + newTags.length >= 10 || !newTagInput.trim()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    已选择 {selectedTags.length + newTags.length} / 10 个标签
                  </p>

                  <Separator />

                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="搜索已有标签..."
                        value={tagSearch}
                        onChange={(e) => setTagSearch(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>

                    <ScrollArea className="h-40 rounded-md border p-3 bg-muted/30">
                      <div className="flex flex-wrap gap-1.5">
                        {filteredTags.length > 0 ? (
                          filteredTags.map((tag) => {
                            const isSelected = selectedTags.some((t) => t.id === tag.id);
                            return (
                              <Badge
                                key={tag.id}
                                variant={isSelected ? "default" : "outline"}
                                className={cn(
                                  "cursor-pointer text-xs transition-all",
                                  isSelected ? "hover:bg-primary/80" : "hover:bg-accent hover:text-accent-foreground"
                                )}
                                onClick={() => toggleTag(tag)}
                              >
                                {tag.name}
                              </Badge>
                            );
                          })
                        ) : (
                          <p className="text-xs text-muted-foreground py-2">
                            {tagSearch ? "未找到匹配的标签" : "暂无标签"}
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right: actions */}
            <div className="space-y-6">
              <div className="space-y-3">
                <Button type="submit" className="w-full h-12 text-base" disabled={isSubmitting} size="lg">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      保存中...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-5 w-5" />
                      保存更改
                    </>
                  )}
                </Button>
                <Button type="button" variant="outline" className="w-full" asChild>
                  <Link href={`/image/${id}`}>取消</Link>
                </Button>
              </div>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
