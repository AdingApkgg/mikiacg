"use client";

import { type ReactNode } from "react";
import {
  motion,
  LazyMotion,
  domAnimation,
  AnimatePresence,
  type Variants,
  type HTMLMotionProps,
  useReducedMotion,
} from "framer-motion";
import { useIsMounted as useIsMountedFn } from "usehooks-ts";
import ReactCountUp from "react-countup";
import { cn } from "@/lib/utils";

/**
 * 客户端挂载检测 Hook
 * 包装 usehooks-ts 的 useIsMounted，直接返回布尔值
 */
export function useIsMounted(): boolean {
  const isMountedFn = useIsMountedFn();
  return isMountedFn();
}

// ============================================================================
// 缓动曲线
// ============================================================================

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];
const EASE_OUT: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];
const EASE_IN_OUT: [number, number, number, number] = [0.4, 0, 0.2, 1];

// ============================================================================
// 预定义动画变体（供需要 Framer Motion 的场景使用）
// ============================================================================

/** 渐入动画 */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.25, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

/** 从下方滑入 */
export const slideUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE_OUT_EXPO } },
  exit: { opacity: 0, y: 8, transition: { duration: 0.15, ease: EASE_IN_OUT } },
};

/** 从上方滑入 */
export const slideDown: Variants = {
  hidden: { opacity: 0, y: -16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE_OUT_EXPO } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15, ease: EASE_IN_OUT } },
};

/** 缩放渐入 */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.25, ease: EASE_OUT_EXPO } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.15 } },
};

/** 弹性缩放 */
export const springScale: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring", stiffness: 350, damping: 25, mass: 0.8 },
  },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.12 } },
};

/** 交错容器 - 用于列表/网格动画 */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.06,
    },
  },
};

/** 交错子项 */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: EASE_OUT_EXPO },
  },
};

/** 卡片悬停动画 */
export const cardHover: Variants = {
  rest: { scale: 1, y: 0 },
  hover: {
    scale: 1.02,
    y: -3,
    transition: { type: "spring", stiffness: 400, damping: 25 },
  },
  tap: {
    scale: 0.98,
    transition: { type: "spring", stiffness: 500, damping: 30 },
  },
};

/** 按钮点击动画 */
export const buttonTap = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.97 },
  transition: { type: "spring", stiffness: 500, damping: 25, mass: 0.5 },
};

// ============================================================================
// 工具组件
// ============================================================================

interface MotionProviderProps {
  children: ReactNode;
}

/**
 * 动画提供器 - 使用 LazyMotion 延迟加载动画功能
 */
export function MotionProvider({ children }: MotionProviderProps) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}

// ============================================================================
// 客户端安全的动画组件
// ============================================================================

interface ClientOnlyMotionProps extends HTMLMotionProps<"div"> {
  children: ReactNode;
  className?: string;
}

/**
 * 客户端安全的动画 div - 服务端渲染时返回静态 div
 */
export function MotionDiv({ children, className, ...props }: ClientOnlyMotionProps) {
  const mounted = useIsMounted();
  const shouldReduce = useReducedMotion();

  if (!mounted || shouldReduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div className={className} {...props}>
      {children}
    </motion.div>
  );
}

// ============================================================================
// 纯 CSS 入场动画组件（SSR 安全，不会闪烁）
// ============================================================================

const SLIDE_CLASSES: Record<string, string> = {
  up: "slide-in-from-bottom-4",
  down: "slide-in-from-top-4",
  left: "slide-in-from-right-4",
  right: "slide-in-from-left-4",
  none: "",
};

interface FadeInProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
  distance?: number;
}

/**
 * 渐入动画组件（纯 CSS，SSR 安全）
 *
 * 使用 tw-animate-css 的 CSS @keyframes，
 * 浏览器首次绘制时直接从 opacity:0 开始动画，
 * 不会出现「内容可见→消失→淡入」的闪烁。
 */
export function FadeIn({
  children,
  className,
  delay = 0,
  duration = 0.4,
  direction = "up",
}: FadeInProps) {
  const slideClass = SLIDE_CLASSES[direction] || "";

  return (
    <div
      className={cn("animate-in fade-in", slideClass, className)}
      style={{
        animationDuration: `${Math.round(duration * 1000)}ms`,
        animationDelay: delay > 0 ? `${Math.round(delay * 1000)}ms` : undefined,
        animationFillMode: "both",
        animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {children}
    </div>
  );
}

interface PageWrapperProps {
  children: ReactNode;
  className?: string;
}

/**
 * 页面过渡包装器（纯 CSS，SSR 安全）
 */
export function PageWrapper({ children, className }: PageWrapperProps) {
  return (
    <div
      className={cn("animate-in fade-in", className)}
      style={{
        animationDuration: "300ms",
        animationFillMode: "both",
        animationTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      }}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Framer Motion 高级动画组件（仅客户端交互使用）
// ============================================================================

interface StaggerListProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
}

/**
 * 交错列表动画容器
 */
export function StaggerList({ children, className, staggerDelay = 0.04 }: StaggerListProps) {
  const mounted = useIsMounted();
  const shouldReduce = useReducedMotion();

  if (!mounted) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: shouldReduce ? 0 : staggerDelay,
            delayChildren: shouldReduce ? 0 : 0.06,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

interface StaggerItemProps {
  children: ReactNode;
  className?: string;
}

/**
 * 交错列表子项
 */
export function StaggerItem({ children, className }: StaggerItemProps) {
  const shouldReduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={shouldReduce ? fadeIn : staggerItem}
    >
      {children}
    </motion.div>
  );
}

interface ScaleOnHoverProps {
  children: ReactNode;
  className?: string;
  scale?: number;
}

/**
 * 悬停缩放效果
 */
export function ScaleOnHover({ children, className, scale = 1.03 }: ScaleOnHoverProps) {
  const shouldReduce = useReducedMotion();

  if (shouldReduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      whileHover={{ scale }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 500, damping: 25, mass: 0.5 }}
    >
      {children}
    </motion.div>
  );
}

interface CountUpProps {
  value: number;
  duration?: number;
  className?: string;
  formatter?: (value: number) => string;
}

/**
 * 数字递增动画 - 使用 react-countup
 */
export function CountUp({
  value,
  duration = 0.8,
  className,
  formatter = (v) => Math.round(v).toString(),
}: CountUpProps) {
  const mounted = useIsMounted();
  const shouldReduce = useReducedMotion();

  if (!mounted || shouldReduce) {
    return <span className={className}>{formatter(value)}</span>;
  }

  return (
    <ReactCountUp
      end={value}
      duration={duration}
      formattingFn={(v) => formatter(v)}
      className={className}
      preserveValue
    />
  );
}

// ============================================================================
// 导出
// ============================================================================

export { motion, AnimatePresence, useReducedMotion };
