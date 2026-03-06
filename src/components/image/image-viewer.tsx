"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Download, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageViewerProps {
  images: string[];
  initialIndex?: number;
  open: boolean;
  onClose: () => void;
}

function getImageProxyUrl(url: string, thumb?: { w: number; q?: number }): string {
  if (!thumb && url.startsWith("/uploads/")) return url;
  const base = `/api/cover/${encodeURIComponent(url)}`;
  if (!thumb) return base;
  return `${base}?w=${thumb.w}&h=${thumb.w}&q=${thumb.q ?? 60}`;
}

export function ImageViewer({ images, initialIndex = 0, open, onClose }: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const resetTransform = useCallback(() => {
    setScale(1);
    setRotation(0);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const goTo = useCallback((index: number) => {
    if (index < 0 || index >= images.length) return;
    setCurrentIndex(index);
    resetTransform();
  }, [images.length, resetTransform]);

  const zoomIn = useCallback(() => setScale((s) => Math.min(s * 1.3, 5)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s / 1.3, 0.3)), []);
  const rotate = useCallback(() => setRotation((r) => (r + 90) % 360), []);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setCurrentIndex(initialIndex);
      setScale(1);
      setRotation(0);
      setTranslate({ x: 0, y: 0 });
    }
  }

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          goTo(currentIndex - 1);
          break;
        case "ArrowRight":
          goTo(currentIndex + 1);
          break;
        case "+":
        case "=":
          zoomIn();
          break;
        case "-":
          zoomOut();
          break;
        case "r":
          rotate();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, currentIndex, onClose, goTo, zoomIn, zoomOut, rotate]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.min(Math.max(s * delta, 0.3), 5));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, tx: translate.x, ty: translate.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [scale, translate]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setTranslate({ x: dragStart.current.tx + dx, y: dragStart.current.ty + dy });
  }, [isDragging]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === containerRef.current) {
      onClose();
    }
  }, [onClose]);

  const handleDownload = useCallback(() => {
    const url = getImageProxyUrl(images[currentIndex]);
    const link = document.createElement("a");
    link.href = url;
    link.download = `image-${currentIndex + 1}`;
    link.target = "_blank";
    link.click();
  }, [images, currentIndex]);

  const handleFitScreen = () => resetTransform();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm animate-in fade-in duration-200 ease-out">
      {/* Toolbar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent">
        <div className="text-white/80 text-sm font-medium">
          {currentIndex + 1} / {images.length}
        </div>
        <div className="flex items-center gap-1">
          <ToolButton onClick={zoomIn} title="放大">
            <ZoomIn className="h-4 w-4" />
          </ToolButton>
          <ToolButton onClick={zoomOut} title="缩小">
            <ZoomOut className="h-4 w-4" />
          </ToolButton>
          <ToolButton onClick={rotate} title="旋转">
            <RotateCw className="h-4 w-4" />
          </ToolButton>
          <ToolButton onClick={handleFitScreen} title="适应屏幕">
            <Maximize2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton onClick={handleDownload} title="下载">
            <Download className="h-4 w-4" />
          </ToolButton>
          <div className="w-px h-5 bg-white/20 mx-1" />
          <ToolButton onClick={onClose} title="关闭 (Esc)">
            <X className="h-5 w-5" />
          </ToolButton>
        </div>
      </div>

      {/* Main image area */}
      <div
        ref={containerRef}
        className="absolute inset-0 flex items-center justify-center overflow-hidden select-none"
        onClick={handleBackdropClick}
        onWheel={handleWheel}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getImageProxyUrl(images[currentIndex])}
          alt={`Image ${currentIndex + 1}`}
            className={cn(
                "max-w-[90vw] max-h-[85vh] object-contain transition-transform will-change-transform",
                isDragging ? "duration-0 cursor-grabbing" : "duration-200 ease-out cursor-grab"
              )}
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale}) rotate(${rotation}deg)`,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          draggable={false}
        />
      </div>

      {/* Navigation arrows */}
      {images.length > 1 && (
        <>
          {currentIndex > 0 && (
            <button
              onClick={() => goTo(currentIndex - 1)}
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 p-2 sm:p-3 rounded-full bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition-[background-color,color,transform] duration-150 ease-out active:scale-90"
            >
              <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          )}
          {currentIndex < images.length - 1 && (
            <button
              onClick={() => goTo(currentIndex + 1)}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 p-2 sm:p-3 rounded-full bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition-[background-color,color,transform] duration-150 ease-out active:scale-90"
            >
              <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          )}
        </>
      )}

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/60 to-transparent pt-8 pb-3 px-4">
          <div className="flex justify-center gap-1.5 overflow-x-auto scrollbar-none py-1">
            {images.map((url, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={cn(
                  "shrink-0 w-12 h-12 sm:w-16 sm:h-16 rounded-md overflow-hidden border-2 transition-[border-color,opacity,transform] duration-200 ease-out",
                  i === currentIndex
                    ? "border-white scale-105 shadow-lg"
                    : "border-transparent opacity-60 hover:opacity-90"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getImageProxyUrl(url, { w: 100, q: 50 })}
                  alt={`Thumbnail ${i + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ToolButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-[background-color,color,transform] duration-150 ease-out active:scale-90"
    >
      {children}
    </button>
  );
}
