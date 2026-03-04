"use client";

import { useState, useCallback, lazy, Suspense } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Smile, Sticker } from "lucide-react";
import { trpc } from "@/lib/trpc";
import Image from "next/image";

const EmojiPicker = lazy(() =>
  import("@emoji-mart/react").then((mod) => ({ default: mod.default }))
);

interface EmojiStickerPickerProps {
  onEmojiSelect: (emoji: string) => void;
  onStickerSelect: (markup: string) => void;
}

export function EmojiStickerPicker({
  onEmojiSelect,
  onStickerSelect,
}: EmojiStickerPickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("emoji");

  const handleEmojiSelect = useCallback(
    (emoji: { native?: string }) => {
      if (emoji.native) {
        onEmojiSelect(emoji.native);
      }
    },
    [onEmojiSelect]
  );

  const handleStickerClick = useCallback(
    (packSlug: string, stickerId: string) => {
      onStickerSelect(`[sticker:${packSlug}:${stickerId}]`);
      setOpen(false);
    },
    [onStickerSelect]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" type="button">
          <Smile className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[352px] p-0"
        side="top"
        align="start"
        sideOffset={8}
      >
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="w-full rounded-none border-b bg-transparent h-9">
            <TabsTrigger value="emoji" className="flex-1 text-xs gap-1">
              <Smile className="h-3.5 w-3.5" />
              Emoji
            </TabsTrigger>
            <TabsTrigger value="sticker" className="flex-1 text-xs gap-1">
              <Sticker className="h-3.5 w-3.5" />
              贴图
            </TabsTrigger>
          </TabsList>

          <TabsContent value="emoji" className="m-0">
            <Suspense
              fallback={
                <div className="h-[350px] flex items-center justify-center">
                  <Skeleton className="h-8 w-32" />
                </div>
              }
            >
              <EmojiTab onSelect={handleEmojiSelect} />
            </Suspense>
          </TabsContent>

          <TabsContent value="sticker" className="m-0">
            <StickerTab onSelect={handleStickerClick} />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

function EmojiTab({ onSelect }: { onSelect: (emoji: { native?: string }) => void }) {
  const [data, setData] = useState<unknown>(null);

  if (!data) {
    import("@emoji-mart/data").then((mod) => setData(mod.default));
    return (
      <div className="h-[350px] flex items-center justify-center">
        <Skeleton className="h-8 w-32" />
      </div>
    );
  }

  return (
    <EmojiPicker
      data={data}
      onEmojiSelect={onSelect}
      locale="zh"
      theme="auto"
      previewPosition="none"
      skinTonePosition="search"
      set="native"
      perLine={9}
      maxFrequentRows={2}
    />
  );
}

function StickerTab({
  onSelect,
}: {
  onSelect: (packSlug: string, stickerId: string) => void;
}) {
  const { data: packs, isLoading } = trpc.sticker.listPacks.useQuery(undefined, {
    staleTime: Infinity,
  });
  const [activePack, setActivePack] = useState<string | null>(null);

  const currentPack = packs?.find((p) => p.id === activePack) ?? packs?.[0];

  if (isLoading) {
    return (
      <div className="h-[350px] flex items-center justify-center">
        <Skeleton className="h-8 w-32" />
      </div>
    );
  }

  if (!packs || packs.length === 0) {
    return (
      <div className="h-[350px] flex flex-col items-center justify-center text-muted-foreground text-sm">
        <Sticker className="h-8 w-8 mb-2" />
        暂无贴图包
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[350px]">
      {/* 贴图包选项卡 */}
      <ScrollArea className="w-full border-b">
        <div className="flex gap-1 p-1.5">
          {packs.map((pack) => (
            <button
              key={pack.id}
              onClick={() => setActivePack(pack.id)}
              className={`shrink-0 px-2.5 py-1 text-xs rounded-md transition-colors ${
                (currentPack?.id === pack.id)
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground"
              }`}
            >
              {pack.name}
            </button>
          ))}
        </div>
      </ScrollArea>

      {/* 贴图网格 */}
      <ScrollArea className="flex-1">
        {currentPack && (
          <div className="grid grid-cols-5 gap-1.5 p-2">
            {currentPack.stickers.map((sticker) => (
              <button
                key={sticker.id}
                onClick={() => onSelect(currentPack.slug, sticker.id)}
                className="aspect-square rounded-md border bg-muted/30 hover:bg-muted transition-colors flex items-center justify-center p-1 group"
                title={sticker.name}
              >
                <Image
                  src={sticker.imageUrl}
                  alt={sticker.name}
                  width={56}
                  height={56}
                  className="object-contain group-hover:scale-110 transition-transform"
                  unoptimized
                />
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
