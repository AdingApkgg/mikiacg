"use client";

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import Image from "next/image";

const STICKER_REGEX = /\[sticker:([a-z0-9-]+):([a-zA-Z0-9_-]+)\]/g;

interface CommentContentProps {
  content: string;
  className?: string;
}

type ContentSegment =
  | { type: "text"; value: string }
  | { type: "sticker"; packSlug: string; stickerId: string };

function parseContent(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(STICKER_REGEX)) {
    if (match.index! > lastIndex) {
      segments.push({ type: "text", value: content.slice(lastIndex, match.index!) });
    }
    segments.push({
      type: "sticker",
      packSlug: match[1],
      stickerId: match[2],
    });
    lastIndex = match.index! + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: "text", value: content.slice(lastIndex) });
  }

  return segments;
}

export function CommentContent({ content, className }: CommentContentProps) {
  const segments = useMemo(() => parseContent(content), [content]);

  const hasSticker = segments.some((s) => s.type === "sticker");

  if (!hasSticker) {
    return <span className={className}>{content}</span>;
  }

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return <span key={i}>{seg.value}</span>;
        }
        return (
          <StickerInline
            key={i}
            packSlug={seg.packSlug}
            stickerId={seg.stickerId}
          />
        );
      })}
    </span>
  );
}

function StickerInline({
  packSlug,
  stickerId,
}: {
  packSlug: string;
  stickerId: string;
}) {
  const { data: packs } = trpc.sticker.listPacks.useQuery(undefined, {
    staleTime: Infinity,
  });

  const sticker = useMemo(() => {
    if (!packs) return null;
    const pack = packs.find((p) => p.slug === packSlug);
    if (!pack) return null;
    return pack.stickers.find((s) => s.id === stickerId) ?? null;
  }, [packs, packSlug, stickerId]);

  if (!sticker) {
    return (
      <span className="text-muted-foreground text-xs">
        [贴图]
      </span>
    );
  }

  return (
    <Image
      src={sticker.imageUrl}
      alt={sticker.name}
      width={120}
      height={120}
      className="inline-block align-bottom my-0.5 rounded"
      style={{ width: "120px", height: "auto" }}
      unoptimized
    />
  );
}
