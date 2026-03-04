"use client";

import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Trash2,
  Edit,
  Package,
  Image as ImageIcon,
  Upload,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Link2,
  BarChart3,
  Eye,
  Replace,
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "@/lib/toast-with-sound";
import Image from "next/image";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ==================== Types ====================

interface PackData {
  id: string;
  name: string;
  slug: string;
  coverUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  _count: { stickers: number };
}

interface StickerData {
  id: string;
  packId: string;
  name: string;
  imageUrl: string;
  width: number | null;
  height: number | null;
  sortOrder: number;
  createdAt: Date;
}

// ==================== Main Page ====================

export default function StickersPage() {
  const utils = trpc.useUtils();
  const [createOpen, setCreateOpen] = useState(false);
  const [editPack, setEditPack] = useState<PackData | null>(null);
  const [expandedPack, setExpandedPack] = useState<string | null>(null);
  const [presetOpen, setPresetOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");

  const { data: packs, isLoading } = trpc.admin.listStickerPacks.useQuery();
  const { data: stats } = trpc.admin.getStickerUsageStats.useQuery();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const createMut = trpc.admin.createStickerPack.useMutation({
    onSuccess: () => {
      utils.admin.listStickerPacks.invalidate();
      setCreateOpen(false);
      setNewName("");
      setNewSlug("");
      toast.success("贴图包已创建");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.admin.updateStickerPack.useMutation({
    onSuccess: () => {
      utils.admin.listStickerPacks.invalidate();
      setEditPack(null);
      toast.success("已更新");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.admin.deleteStickerPack.useMutation({
    onSuccess: () => {
      utils.admin.listStickerPacks.invalidate();
      toast.success("已删除");
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleActiveMut = trpc.admin.updateStickerPack.useMutation({
    onSuccess: () => utils.admin.listStickerPacks.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const reorderPacksMut = trpc.admin.reorderStickerPacks.useMutation({
    onSuccess: () => utils.admin.listStickerPacks.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const handlePackDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!packs) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = packs.findIndex((p) => p.id === active.id);
      const newIndex = packs.findIndex((p) => p.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(packs, oldIndex, newIndex);
      reorderPacksMut.mutate({ packIds: reordered.map((p) => p.id) });
    },
    [packs, reorderPacksMut],
  );

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "");

  const totalStickers = packs?.reduce((s, p) => s + p._count.stickers, 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">贴图管理</h1>
          <p className="text-muted-foreground text-sm mt-1">管理评论区可用的贴图包和贴图</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPresetOpen(true)}>
            <Download className="h-4 w-4 mr-2" />
            从预设导入
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            新建贴图包
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">贴图包</span>
            </div>
            <p className="text-2xl font-bold mt-1">{packs?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">总贴图</span>
            </div>
            <p className="text-2xl font-bold mt-1">{totalStickers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">总引用次数</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats?.totalUsage ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">已启用</span>
            </div>
            <p className="text-2xl font-bold mt-1">{packs?.filter((p) => p.isActive).length ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Pack List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : !packs || packs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mb-4" />
            <p>还没有贴图包，点击上方按钮创建一个</p>
          </CardContent>
        </Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePackDragEnd}>
          <SortableContext items={packs.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {packs.map((pack) => (
                <SortablePackCard
                  key={pack.id}
                  pack={pack}
                  isExpanded={expandedPack === pack.id}
                  onToggleExpand={() => setExpandedPack(expandedPack === pack.id ? null : pack.id)}
                  onEdit={() => setEditPack(pack)}
                  onDelete={() => deleteMut.mutate({ id: pack.id })}
                  onToggleActive={(checked) => toggleActiveMut.mutate({ id: pack.id, isActive: checked })}
                  usageMap={stats?.usageMap}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建贴图包</DialogTitle>
            <DialogDescription>创建一个新的贴图包，用于评论区表情选择</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input
                placeholder="例: 小黄鸭"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (!newSlug || newSlug === autoSlug(newName)) setNewSlug(autoSlug(e.target.value));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>标识 (slug)</Label>
              <Input
                placeholder="例: xiaoyazi"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              />
              <p className="text-xs text-muted-foreground">仅允许小写字母、数字和连字符</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button
              onClick={() => createMut.mutate({ name: newName, slug: newSlug })}
              disabled={!newName.trim() || !newSlug.trim() || createMut.isPending}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editPack} onOpenChange={(open) => !open && setEditPack(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑贴图包</DialogTitle>
            <DialogDescription>修改贴图包信息和封面</DialogDescription>
          </DialogHeader>
          {editPack && (
            <EditPackForm
              pack={editPack}
              onSave={(data) => updateMut.mutate({ id: editPack.id, ...data })}
              isPending={updateMut.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Preset Import Dialog */}
      <PresetImportDialog
        open={presetOpen}
        onOpenChange={setPresetOpen}
        existingSlugs={packs?.map((p) => p.slug) ?? []}
      />
    </div>
  );
}

// ==================== Sortable Pack Card ====================

function SortablePackCard({
  pack,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onToggleActive,
  usageMap,
}: {
  pack: PackData;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: (checked: boolean) => void;
  usageMap?: Record<string, number>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pack.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card ref={setNodeRef} style={style}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-5 w-5" />
            </button>
            {pack.coverUrl ? (
              <Image src={pack.coverUrl} alt={pack.name} width={40} height={40} className="rounded-md object-cover" unoptimized />
            ) : (
              <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                <Package className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {pack.name}
                <span className="text-xs text-muted-foreground font-normal">({pack.slug})</span>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{pack._count.stickers} 个贴图</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={pack.isActive} onCheckedChange={onToggleActive} />
            <Button variant="ghost" size="icon" onClick={onEdit}><Edit className="h-4 w-4" /></Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>删除贴图包 &quot;{pack.name}&quot;？</AlertDialogTitle>
                  <AlertDialogDescription>包内所有贴图也会被一并删除，此操作不可撤销。</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete}>删除</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="ghost" size="icon" onClick={onToggleExpand}>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="pt-0">
          <StickerGrid packId={pack.id} packSlug={pack.slug} usageMap={usageMap} />
        </CardContent>
      )}
    </Card>
  );
}

// ==================== Edit Pack Form (with cover) ====================

function EditPackForm({
  pack,
  onSave,
  isPending,
}: {
  pack: PackData;
  onSave: (data: { name?: string; slug?: string; coverUrl?: string | null }) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(pack.name);
  const [slug, setSlug] = useState(pack.slug);
  const [coverUrl, setCoverUrl] = useState(pack.coverUrl);
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const { data: stickers } = trpc.admin.listStickers.useQuery({ packId: pack.id });

  const handleCoverUpload = async (file: File) => {
    setUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "sticker");
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "上传失败");
      setCoverUrl(json.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploadingCover(false);
    }
  };

  const useFirstSticker = () => {
    if (stickers && stickers.length > 0) {
      setCoverUrl(stickers[0].imageUrl);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>封面</Label>
          <div className="flex items-center gap-3">
            {coverUrl ? (
              <Image src={coverUrl} alt="封面" width={64} height={64} className="rounded-md object-cover border" unoptimized />
            ) : (
              <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center border">
                <Package className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleCoverUpload(e.target.files[0])} />
              <Button size="sm" variant="outline" onClick={() => coverInputRef.current?.click()} disabled={uploadingCover}>
                <Upload className="h-3.5 w-3.5 mr-1" />
                {uploadingCover ? "上传中..." : "上传封面"}
              </Button>
              {stickers && stickers.length > 0 && (
                <Button size="sm" variant="ghost" onClick={useFirstSticker}>
                  <ImageIcon className="h-3.5 w-3.5 mr-1" />
                  使用第一个贴图
                </Button>
              )}
              {coverUrl && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCoverUrl(null)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  移除封面
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label>名称</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>标识 (slug)</Label>
          <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() => onSave({ name, slug, coverUrl })}
          disabled={!name.trim() || !slug.trim() || isPending}
        >
          保存
        </Button>
      </DialogFooter>
    </>
  );
}

// ==================== Sortable Sticker Item ====================

function SortableStickerItem({
  sticker,
  usageCount,
  onDelete,
  onEdit,
  onPreview,
}: {
  sticker: StickerData;
  usageCount: number;
  onDelete: () => void;
  onEdit: () => void;
  onPreview: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sticker.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative aspect-square rounded-md border bg-muted/30 flex items-center justify-center overflow-hidden"
    >
      <button className="cursor-pointer w-full h-full flex items-center justify-center p-1" onClick={onPreview}>
        <Image src={sticker.imageUrl} alt={sticker.name} width={80} height={80} className="object-contain" unoptimized />
      </button>

      {usageCount > 0 && (
        <Badge variant="secondary" className="absolute top-0.5 right-0.5 text-[9px] px-1 py-0 h-4 min-w-0">
          {usageCount}
        </Badge>
      )}

      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
        <button
          className="cursor-grab active:cursor-grabbing touch-none p-1 text-white hover:text-primary"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-white hover:text-primary" onClick={onEdit}>
          <Edit className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-white hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <span className="absolute bottom-0 left-0 right-0 text-[10px] text-center bg-black/40 text-white truncate px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {sticker.name}
      </span>
    </div>
  );
}

// ==================== Sticker Grid ====================

function StickerGrid({
  packId,
  packSlug,
  usageMap,
}: {
  packId: string;
  packSlug: string;
  usageMap?: Record<string, number>;
}) {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<{ total: number; done: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [urlImportOpen, setUrlImportOpen] = useState(false);
  const [editSticker, setEditSticker] = useState<StickerData | null>(null);
  const [previewSticker, setPreviewSticker] = useState<StickerData | null>(null);

  const { data: stickers, isLoading } = trpc.admin.listStickers.useQuery({ packId });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const invalidateAll = () => {
    utils.admin.listStickers.invalidate({ packId });
    utils.admin.listStickerPacks.invalidate();
  };

  const addMut = trpc.admin.addSticker.useMutation({
    onSuccess: invalidateAll,
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.admin.deleteSticker.useMutation({
    onSuccess: () => {
      invalidateAll();
      toast.success("贴图已删除");
    },
    onError: (e) => toast.error(e.message),
  });

  const reorderMut = trpc.admin.reorderStickers.useMutation({
    onSuccess: () => utils.admin.listStickers.invalidate({ packId }),
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.admin.updateSticker.useMutation({
    onSuccess: () => {
      invalidateAll();
      setEditSticker(null);
      toast.success("贴图已更新");
    },
    onError: (e) => toast.error(e.message),
  });

  const importMut = trpc.admin.importStickersFromUrl.useMutation({
    onSuccess: (result) => {
      invalidateAll();
      setUrlImportOpen(false);
      toast.success(`导入完成: ${result.success} 成功, ${result.failed} 失败`);
      if (result.errors.length > 0) {
        console.warn("Import errors:", result.errors);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const uploadSingleFile = async (file: File): Promise<void> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", "sticker");
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "上传失败");

    await new Promise<void>((resolve, reject) => {
      addMut.mutate(
        {
          packId,
          name: file.name.replace(/\.[^.]+$/, ""),
          imageUrl: json.url,
          width: json.dimensions?.width,
          height: json.dimensions?.height,
        },
        { onSuccess: () => resolve(), onError: (e) => reject(e) },
      );
    });
  };

  const handleBatchUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploadQueue({ total: files.length, done: 0 });
      let done = 0;
      for (const file of files) {
        try {
          await uploadSingleFile(file);
        } catch (e) {
          toast.error(`${file.name}: ${e instanceof Error ? e.message : "上传失败"}`);
        }
        done++;
        setUploadQueue({ total: files.length, done });
      }
      setUploadQueue(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [packId],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    handleBatchUpload(Array.from(files));
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
      if (files.length > 0) handleBatchUpload(files);
    },
    [handleBatchUpload],
  );

  const handleStickerDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!stickers) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = stickers.findIndex((s) => s.id === active.id);
      const newIndex = stickers.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(stickers, oldIndex, newIndex);
      reorderMut.mutate({ packId, stickerIds: reordered.map((s) => s.id) });
    },
    [stickers, reorderMut, packId],
  );

  return (
    <div className="space-y-4">
      {/* Upload Area (Dropzone) */}
      <div
        className={`border-2 border-dashed rounded-lg p-4 transition-colors ${
          isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 text-center text-sm text-muted-foreground">
            {isDragOver ? (
              <span className="text-primary font-medium">释放文件以上传</span>
            ) : (
              <span>拖拽图片到此处，或点击按钮上传</span>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={!!uploadQueue}
            >
              <Upload className="h-4 w-4 mr-1" />
              上传贴图
            </Button>
            <Button size="sm" variant="outline" onClick={() => setUrlImportOpen(true)} disabled={!!uploadQueue}>
              <Link2 className="h-4 w-4 mr-1" />
              URL 导入
            </Button>
          </div>
        </div>

        {uploadQueue && (
          <div className="mt-3 space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>上传进度</span>
              <span>{uploadQueue.done}/{uploadQueue.total}</span>
            </div>
            <Progress value={(uploadQueue.done / uploadQueue.total) * 100} className="h-2" />
          </div>
        )}
      </div>

      {/* Sticker Grid with DnD */}
      {isLoading ? (
        <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="aspect-square rounded-md" />)}
        </div>
      ) : !stickers || stickers.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          <ImageIcon className="h-8 w-8 mx-auto mb-2" />
          暂无贴图，拖拽图片到上方或点击上传
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleStickerDragEnd}>
          <SortableContext items={stickers.map((s) => s.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
              {stickers.map((sticker) => (
                <SortableStickerItem
                  key={sticker.id}
                  sticker={sticker}
                  usageCount={usageMap?.[sticker.id] ?? 0}
                  onDelete={() => deleteMut.mutate({ id: sticker.id })}
                  onEdit={() => setEditSticker(sticker)}
                  onPreview={() => setPreviewSticker(sticker)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* URL Import Dialog */}
      <UrlImportDialog
        open={urlImportOpen}
        onOpenChange={setUrlImportOpen}
        onImport={(items) => importMut.mutate({ packId, items })}
        isPending={importMut.isPending}
      />

      {/* Edit Sticker Dialog */}
      <EditStickerDialog
        sticker={editSticker}
        onClose={() => setEditSticker(null)}
        onSave={(data) => editSticker && updateMut.mutate({ id: editSticker.id, ...data })}
        isPending={updateMut.isPending}
      />

      {/* Preview Dialog */}
      <PreviewStickerDialog
        sticker={previewSticker}
        onClose={() => setPreviewSticker(null)}
        usageCount={previewSticker ? (usageMap?.[previewSticker.id] ?? 0) : 0}
      />
    </div>
  );
}

// ==================== URL Import Dialog ====================

function UrlImportDialog({
  open,
  onOpenChange,
  onImport,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (items: { url: string; name?: string }[]) => void;
  isPending: boolean;
}) {
  const [text, setText] = useState("");

  const handleImport = () => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const items = lines.map((line) => {
      const pipeIdx = line.indexOf("|");
      if (pipeIdx > 0) {
        return { name: line.slice(0, pipeIdx).trim(), url: line.slice(pipeIdx + 1).trim() };
      }
      return { url: line };
    }).filter((item) => {
      try { new URL(item.url); return true; } catch { return false; }
    });

    if (items.length === 0) {
      toast.error("没有检测到有效的 URL");
      return;
    }
    onImport(items);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>从 URL 批量导入</DialogTitle>
          <DialogDescription>每行一个 URL，可选格式：名称|URL</DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder={"https://example.com/sticker1.png\n开心|https://example.com/happy.png"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="font-mono text-xs"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleImport} disabled={!text.trim() || isPending}>
            {isPending ? "导入中..." : "导入"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== Edit Sticker Dialog ====================

function EditStickerDialogInner({
  sticker,
  onClose,
  onSave,
  isPending,
}: {
  sticker: StickerData;
  onClose: () => void;
  onSave: (data: { name?: string; imageUrl?: string }) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(sticker.name);
  const [imageUrl, setImageUrl] = useState(sticker.imageUrl);
  const [uploading, setUploading] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const handleReplace = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "sticker");
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "上传失败");
      setImageUrl(json.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Image src={imageUrl} alt={name} width={96} height={96} className="rounded-md border object-contain bg-muted/30 p-1" unoptimized />
          <div className="space-y-2">
            <input ref={replaceInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleReplace(e.target.files[0])} />
            <Button size="sm" variant="outline" onClick={() => replaceInputRef.current?.click()} disabled={uploading}>
              <Replace className="h-3.5 w-3.5 mr-1" />
              {uploading ? "上传中..." : "替换图片"}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label>名称</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>取消</Button>
        <Button
          onClick={() => {
            const data: { name?: string; imageUrl?: string } = {};
            if (name !== sticker.name) data.name = name;
            if (imageUrl !== sticker.imageUrl) data.imageUrl = imageUrl;
            onSave(data);
          }}
          disabled={!name.trim() || isPending}
        >
          保存
        </Button>
      </DialogFooter>
    </>
  );
}

function EditStickerDialog({
  sticker,
  onClose,
  onSave,
  isPending,
}: {
  sticker: StickerData | null;
  onClose: () => void;
  onSave: (data: { name?: string; imageUrl?: string }) => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={!!sticker} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑贴图</DialogTitle>
          <DialogDescription>修改贴图名称或替换图片</DialogDescription>
        </DialogHeader>
        {sticker && (
          <EditStickerDialogInner
            key={sticker.id}
            sticker={sticker}
            onClose={onClose}
            onSave={onSave}
            isPending={isPending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ==================== Preview Sticker Dialog ====================

function PreviewStickerDialog({
  sticker,
  onClose,
  usageCount,
}: {
  sticker: StickerData | null;
  onClose: () => void;
  usageCount: number;
}) {
  return (
    <Dialog open={!!sticker} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{sticker?.name ?? "贴图预览"}</DialogTitle>
          <DialogDescription>贴图详细信息</DialogDescription>
        </DialogHeader>
        {sticker && (
          <div className="space-y-4">
            <div className="flex justify-center bg-muted/30 rounded-lg p-4 border">
              <Image
                src={sticker.imageUrl}
                alt={sticker.name}
                width={256}
                height={256}
                className="object-contain"
                style={{ maxWidth: "256px", maxHeight: "256px" }}
                unoptimized
              />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">名称</span>
                <p className="font-medium">{sticker.name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">尺寸</span>
                <p className="font-medium">
                  {sticker.width && sticker.height ? `${sticker.width} x ${sticker.height}` : "未知"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">引用次数</span>
                <p className="font-medium">{usageCount}</p>
              </div>
              <div>
                <span className="text-muted-foreground">创建时间</span>
                <p className="font-medium">{new Date(sticker.createdAt).toLocaleDateString("zh-CN")}</p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">路径</span>
                <p className="font-mono text-xs break-all mt-0.5">{sticker.imageUrl}</p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ==================== Preset Import Dialog ====================

interface PresetItem {
  id: string;
  name: string;
  slug: string;
  source: string;
  description: string;
  preview?: string;
}

function PresetImportDialog({
  open,
  onOpenChange,
  existingSlugs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingSlugs: string[];
}) {
  const utils = trpc.useUtils();
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    presetId: string;
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);

  const { data: presets, isLoading } = trpc.admin.listStickerPresets.useQuery(undefined, {
    enabled: open,
  });

  const importMut = trpc.admin.importPresetPack.useMutation({
    onSuccess: (result) => {
      utils.admin.listStickerPacks.invalidate();
      setImportResult({
        presetId: importingId!,
        success: result.success,
        failed: result.failed,
        errors: result.errors,
      });
      setImportingId(null);
      toast.success(`${result.packName}: 导入了 ${result.success} 个贴图`);
    },
    onError: (e) => {
      setImportingId(null);
      toast.error(e.message);
    },
  });

  const sources = presets ? [...new Set(presets.map((p) => p.source))] : [];
  const filtered = presets?.filter((p) => !sourceFilter || p.source === sourceFilter) ?? [];

  const handleImport = (preset: PresetItem) => {
    setImportingId(preset.id);
    setImportResult(null);
    importMut.mutate({ presetId: preset.id });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>从预设导入表情包</DialogTitle>
          <DialogDescription>
            一键导入 Waline、Twikoo、Artalk 等评论系统的表情包
          </DialogDescription>
        </DialogHeader>

        {/* Source Filter */}
        {sources.length > 1 && (
          <div className="flex gap-1.5 flex-wrap">
            <Button
              size="sm"
              variant={sourceFilter === null ? "default" : "outline"}
              onClick={() => setSourceFilter(null)}
              className="h-7 text-xs"
            >
              全部
            </Button>
            {sources.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={sourceFilter === s ? "default" : "outline"}
                onClick={() => setSourceFilter(s)}
                className="h-7 text-xs"
              >
                {s}
              </Button>
            ))}
          </div>
        )}

        {/* Preset Grid */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Package className="h-8 w-8 mx-auto mb-2" />
              暂无可用预设
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((preset) => {
                const alreadyImported = existingSlugs.includes(preset.slug);
                const isImporting = importingId === preset.id;
                const result = importResult?.presetId === preset.id ? importResult : null;

                return (
                  <div
                    key={preset.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                  >
                    {/* Preview */}
                    {preset.preview ? (
                      <Image
                        src={preset.preview}
                        alt={preset.name}
                        width={40}
                        height={40}
                        className="rounded-md object-contain shrink-0"
                        unoptimized
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{preset.name}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                          {preset.source}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {preset.description}
                      </p>
                      {result && (
                        <div className="flex items-center gap-1.5 mt-1">
                          {result.failed === 0 ? (
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                          ) : (
                            <XCircle className="h-3 w-3 text-amber-500" />
                          )}
                          <span className="text-[11px] text-muted-foreground">
                            成功 {result.success}{result.failed > 0 ? `，失败 ${result.failed}` : ""}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Action */}
                    <div className="shrink-0">
                      {alreadyImported && !result ? (
                        <Badge variant="secondary" className="text-xs">已导入</Badge>
                      ) : isImporting ? (
                        <Button size="sm" disabled className="h-8">
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          导入中...
                        </Button>
                      ) : result ? (
                        <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600">
                          已完成
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleImport(preset)}
                          disabled={!!importingId}
                          className="h-8"
                        >
                          <Download className="h-3.5 w-3.5 mr-1" />
                          导入
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
