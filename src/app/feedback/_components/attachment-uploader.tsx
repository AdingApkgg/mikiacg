"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { TicketAttachment } from "@/lib/ticket-schema";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"];

interface AttachmentUploaderProps {
  attachments: TicketAttachment[];
  onChange: (attachments: TicketAttachment[]) => void;
  max?: number;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
}

export function AttachmentUploader({
  attachments,
  onChange,
  max = 6,
  disabled = false,
  className,
  size = "md",
}: AttachmentUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("仅支持 JPG / PNG / GIF / WebP / AVIF 图片");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("图片不能超过 10MB");
      return;
    }
    if (attachments.length >= max) {
      toast.error(`最多上传 ${max} 张图片`);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "misc");

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "上传失败" }));
        throw new Error(errData.error || "上传失败");
      }
      const data = (await res.json()) as { url: string };

      onChange([
        ...attachments,
        {
          url: data.url,
          name: file.name.slice(0, 200),
          size: file.size,
          type: file.type,
        },
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void handleFile(file);
  };

  const remove = (idx: number) => {
    onChange(attachments.filter((_, i) => i !== idx));
  };

  const canAddMore = attachments.length < max;
  const thumbSize = size === "sm" ? "h-14 w-14" : "h-20 w-20";

  return (
    <div className={cn("space-y-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        className="hidden"
        onChange={handleChange}
        disabled={disabled || uploading}
      />

      <div className="flex items-center gap-2 flex-wrap">
        {attachments.map((a, i) => (
          <div key={i} className={cn("relative group rounded-md overflow-hidden border", thumbSize)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={disabled}
              className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="移除"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {canAddMore && (
          <Button
            type="button"
            variant="outline"
            size={size === "sm" ? "sm" : "default"}
            className={cn(thumbSize, "flex flex-col items-center justify-center gap-1 text-muted-foreground p-0")}
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <ImagePlus className="h-4 w-4" />
                <span className="text-[10px]">截图</span>
              </>
            )}
          </Button>
        )}
      </div>

      {size !== "sm" && (
        <p className="text-[11px] text-muted-foreground">支持 JPG / PNG / WebP,单张最大 10MB,最多 {max} 张</p>
      )}
    </div>
  );
}

/** 只读展示 — 用于工单详情页 */
export function AttachmentList({ attachments }: { attachments: TicketAttachment[] | null | undefined }) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap">
      {attachments.map((a, i) => (
        <a
          key={i}
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          className="relative h-20 w-20 rounded-md overflow-hidden border hover:opacity-80 transition-opacity"
          title={a.name}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
        </a>
      ))}
    </div>
  );
}
