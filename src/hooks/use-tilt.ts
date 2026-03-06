"use client";

import { useRef, useEffect } from "react";

interface TiltOptions {
  maxTilt?: number;
  perspective?: number;
  scale?: number;
  glare?: boolean;
  glareMaxOpacity?: number;
  disabled?: boolean;
}

export function useTilt<T extends HTMLElement>(options: TiltOptions = {}) {
  const ref = useRef<T>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const hovering = useRef(false);
  const current = useRef({ rx: 0, ry: 0, s: 1 });
  const target = useRef({ rx: 0, ry: 0, s: 1 });
  const raf = useRef(0);

  const {
    maxTilt = 10,
    perspective = 1000,
    scale = 1.03,
    glare = true,
    glareMaxOpacity = 0.15,
    disabled = false,
  } = options;

  useEffect(() => {
    if (disabled) return;
    if (typeof window !== "undefined" && "ontouchstart" in window) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const el = ref.current;
    if (!el) return;

    el.style.transformStyle = "preserve-3d";
    el.style.willChange = "transform";

    let prevTime = 0;

    const tick = (timestamp: number) => {
      const dt = prevTime ? Math.min((timestamp - prevTime) / 16.67, 2) : 1;
      prevTime = timestamp;

      const c = current.current;
      const t = target.current;

      const lerpFactor = 1 - Math.pow(0.85, dt);
      c.rx += (t.rx - c.rx) * lerpFactor;
      c.ry += (t.ry - c.ry) * lerpFactor;
      c.s += (t.s - c.s) * lerpFactor;

      el.style.transform = `perspective(${perspective}px) rotateX(${c.rx}deg) rotateY(${c.ry}deg) scale3d(${c.s},${c.s},${c.s})`;

      const stillMoving =
        Math.abs(c.rx - t.rx) > 0.01 ||
        Math.abs(c.ry - t.ry) > 0.01 ||
        Math.abs(c.s - t.s) > 0.001;

      if (hovering.current || stillMoving) {
        raf.current = requestAnimationFrame(tick);
      } else {
        prevTime = 0;
      }
    };

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;

      target.current.ry = (nx - 0.5) * maxTilt * 2;
      target.current.rx = (0.5 - ny) * maxTilt * 2;
      target.current.s = scale;

      if (glare && glareRef.current) {
        const angle = Math.atan2(ny - 0.5, nx - 0.5) * (180 / Math.PI) + 90;
        const intensity = Math.min(Math.sqrt((nx - 0.5) ** 2 + (ny - 0.5) ** 2) * 2, 1);
        glareRef.current.style.background = `linear-gradient(${angle}deg, rgba(255,255,255,${intensity * glareMaxOpacity}) 0%, transparent 80%)`;
        glareRef.current.style.opacity = "1";
      }
    };

    const onEnter = () => {
      hovering.current = true;
      prevTime = 0;
      raf.current = requestAnimationFrame(tick);
    };

    const onLeave = () => {
      hovering.current = false;
      target.current = { rx: 0, ry: 0, s: 1 };
      if (glare && glareRef.current) {
        glareRef.current.style.opacity = "0";
      }
    };

    el.addEventListener("mousemove", onMove, { passive: true });
    el.addEventListener("mouseenter", onEnter, { passive: true });
    el.addEventListener("mouseleave", onLeave, { passive: true });

    return () => {
      cancelAnimationFrame(raf.current);
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
      el.style.transform = "";
      el.style.willChange = "";
      el.style.transformStyle = "";
    };
  }, [disabled, maxTilt, perspective, scale, glare, glareMaxOpacity]);

  return { ref, glareRef };
}
