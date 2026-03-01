"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "@/lib/toast-with-sound";
import { trpc } from "@/lib/trpc";
import { imageUploadSchema, type ImageUploadForm } from "../_lib/schemas";
import { TagPicker } from "./tag-picker";
import type { TagItem } from "../_lib/types";
import { Image as ImageIcon, Loader2, Plus, Trash2, Upload } from "lucide-react";

export function ImageSingleUpload() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [selectedTags, setSelectedTags] = useState<TagItem[]>([]);
  const [newTags, setNewTags] = useState<string[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([""]);

  const { data: allTags } = trpc.tag.list.useQuery({ limit: 100 });
  const createMutation = trpc.image.create.useMutation({
    onError: (e) => toast.error("发布失败", { description: e.message }),
  });

  const form = useForm<ImageUploadForm>({
    resolver: zodResolver(imageUploadSchema),
    defaultValues: { title: "", description: "" },
  });

  const toggleTag = (tag: TagItem) => {
    const exists = selectedTags.find((t) => t.id === tag.id);
    if (exists) setSelectedTags(selectedTags.filter((t) => t.id !== tag.id));
    else if (selectedTags.length + newTags.length < 10) setSelectedTags([...selectedTags, tag]);
  };

  const addImageUrl = () => setImageUrls([...imageUrls, ""]);

  const updateImageUrl = (index: number, value: string) => {
    const updated = [...imageUrls];
    updated[index] = value;
    setImageUrls(updated);
  };

  const removeImageUrl = (index: number) => {
    setImageUrls(imageUrls.filter((_, i) => i !== index));
  };

  const validImages = imageUrls.filter((url) => url.trim());

  const onSubmit = async (data: ImageUploadForm) => {
    if (validImages.length === 0) {
      toast.error("请至少添加一张图片链接");
      return;
    }

    setIsLoading(true);
    try {
      const result = await createMutation.mutateAsync({
        title: data.title,
        description: data.description || undefined,
        images: validImages,
        tagIds: selectedTags.map((t) => t.id),
        tagNames: newTags,
      });

      toast.success(result.status === "PUBLISHED" ? "发布成功" : "提交成功，等待审核");
      router.push(`/image/${result.id}`);
    } catch {
      // onError handles this
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left side */}
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
                  <Button type="button" variant="outline" size="sm" onClick={addImageUrl}>
                    <Plus className="h-4 w-4 mr-1" />
                    添加图片
                  </Button>
                </div>
                <CardDescription>添加图片 URL 链接，至少一张</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {imageUrls.map((url, i) => (
                  <div key={i} className="flex gap-2">
                    <div className="relative flex-1">
                      <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="https://example.com/image.jpg"
                        value={url}
                        onChange={(e) => updateImageUrl(i, e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    {imageUrls.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeImageUrl(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}

                <p className="text-xs text-muted-foreground">
                  已添加 {validImages.length} 张有效图片
                </p>

                {/* Preview grid */}
                {validImages.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mt-3">
                    {validImages.map((url, i) => (
                      <div key={i} className="aspect-square rounded-md border overflow-hidden bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`预览 ${i + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tags */}
            <TagPicker
              allTags={allTags}
              selectedTags={selectedTags}
              newTags={newTags}
              onToggleTag={toggleTag}
              onAddNewTag={(name) => setNewTags([...newTags, name])}
              onRemoveNewTag={(name) => setNewTags(newTags.filter((t) => t !== name))}
            />
          </div>

          {/* Right side */}
          <div className="space-y-6">
            <Button type="submit" className="w-full h-12 text-base" disabled={isLoading} size="lg">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  发布中...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-5 w-5" />
                  发布图片
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
