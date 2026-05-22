"use client";

import { type CSSProperties, type ReactNode, Children, isValidElement, cloneElement } from "react";
import { m, LazyMotion, domAnimation, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import ReactCountUp from "react-countup";
import { useAnimationConfig } from "@/hooks/use-animation-config";
import { useIsMounted } from "@/hooks/use-is-mounted";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

// ============================================================================
// 向后兼容：re-export hook
// ============================================================================
export { useIsMounted };

// ============================================================================
// MotionProvider — LazyMotion 容器，启用按需加载动画特性
// ============================================================================

interface MotionProviderProps {
  children: ReactNode;
}

export function MotionProvider({ children }: MotionProviderProps) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}

// ============================================================================
// 缓动曲线：入场用 easeOutExpo（顺滑减速），离场用 easeIn（加速消失）
// ============================================================================

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];
const EASE_IN: [number, number, number, number] = [0.4, 0, 1, 1];

// ============================================================================
// PageTransition — 路由切换入场动画
// 说明：Next.js App Router 的 RSC streaming 与 AnimatePresence 的 exit 不兼容
// （mode="wait" 阻塞 streaming，"popLayout" 导致内容覆盖错位），因此路由层
// 仅做 enter 动画；离场体验由组件层的 AnimatePresence 承担（列表项移除、
// 对话框关闭、上传项删除等）。
//
// 路由层只做 opacity，避免 translateY 在页面切换时临时制造纵向溢出。
// ============================================================================

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const config = useAnimationConfig();
  // 首次进入页面时（SSR 水合 + 第一次客户端渲染）跳过 enter 动画。
  // 否则若任何环节阻塞 framer-motion 接管（chunk 加载慢、hydration 延迟等），
  // 内容会长时间停在 opacity:0 → 用户看到「空白页」直到下次路由切换才恢复。
  const isMounted = useIsMounted();

  // 后台使用 fixed 全屏布局，无需页面过渡；用稳定 key 避免重挂载导致闪烁
  const transitionKey = pathname.startsWith("/dashboard") ? "/dashboard" : pathname;

  if (!config.enabled || !config.pageTransition) {
    return <>{children}</>;
  }

  return (
    <m.div
      key={transitionKey}
      className="w-full min-w-0 max-w-full overflow-x-clip"
      initial={isMounted ? { opacity: 0 } : false}
      animate={{
        opacity: 1,
        transition: { duration: config.duration.normal, ease: "easeOut" },
      }}
    >
      {children}
    </m.div>
  );
}

// ============================================================================
// MotionPage — 页面入场动画
// 改为 framer-motion 实现，使其在父级 AnimatePresence 中也能获得离场动画
// ============================================================================

interface MotionPageProps {
  children: ReactNode;
  className?: string;
  direction?: "up" | "down" | "left" | "right" | "none";
}

const ENTER_OFFSET: Record<NonNullable<MotionPageProps["direction"]>, { x: number; y: number }> = {
  up: { x: 0, y: 16 },
  down: { x: 0, y: -16 },
  left: { x: 16, y: 0 },
  right: { x: -16, y: 0 },
  none: { x: 0, y: 0 },
};

export function MotionPage({ children, className, direction = "up" }: MotionPageProps) {
  const config = useAnimationConfig();
  const isMounted = useIsMounted();

  if (!config.enabled || !config.pageTransition || direction === "none") {
    return <div className={className}>{children}</div>;
  }

  const offset = ENTER_OFFSET[direction];

  return (
    <m.div
      className={className}
      // 首次水合时跳过初始状态：避免 SSR 输出的 opacity:0 在 framer-motion 接管
      // 前长期可见，造成「首次访问空白、切走再回来才出来」。后续路由切换 / 重挂载仍正常入场。
      initial={isMounted ? { opacity: 0, x: offset.x, y: offset.y } : false}
      animate={{
        opacity: 1,
        x: 0,
        y: 0,
        transition: { duration: config.duration.normal, ease: EASE_OUT },
      }}
      exit={{
        opacity: 0,
        // 反向偏移一半距离，营造"被推走"的离场观感
        x: -offset.x * 0.5,
        y: -offset.y * 0.5,
        transition: { duration: config.duration.fast, ease: EASE_IN },
      }}
    >
      {children}
    </m.div>
  );
}

// ============================================================================
// MotionList / MotionItem — 列表交错入场 / 离场
// 通过 AnimatePresence 包裹，实现项目被移除时的离场动画与剩余项的位置回流
// ============================================================================

interface MotionListProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
}

const STAGGER_INDEX_KEY = "--stagger-index";
const STAGGER_DELAY_KEY = "--stagger-delay-sec";
const STAGGER_DURATION_KEY = "--stagger-duration-sec";

export function MotionList({ children, className, staggerDelay }: MotionListProps) {
  const config = useAnimationConfig();

  if (!config.enabled || !config.stagger) {
    return <div className={className}>{children}</div>;
  }

  const delay = staggerDelay ?? config.staggerDelay;

  // 把 stagger 元数据注入子元素，由 MotionItem 读取后计算自己的延迟与时长
  const items = Children.toArray(children).map((child, index) => {
    if (!isValidElement<{ style?: CSSProperties }>(child)) return child;
    const prevStyle = child.props.style ?? {};
    return cloneElement(child, {
      style: {
        ...prevStyle,
        [STAGGER_INDEX_KEY]: index,
        [STAGGER_DELAY_KEY]: delay,
        [STAGGER_DURATION_KEY]: config.duration.normal,
      } as CSSProperties,
    });
  });

  return (
    <div className={className}>
      <AnimatePresence mode="popLayout" initial={true}>
        {items}
      </AnimatePresence>
    </div>
  );
}

interface MotionItemProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

type StaggerStyle = CSSProperties & {
  [STAGGER_INDEX_KEY]?: number;
  [STAGGER_DELAY_KEY]?: number;
  [STAGGER_DURATION_KEY]?: number;
};

export function MotionItem({ children, className, style }: MotionItemProps) {
  const config = useAnimationConfig();

  if (!config.enabled || !config.stagger) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  const meta = style as StaggerStyle | undefined;
  const index = meta?.[STAGGER_INDEX_KEY] ?? 0;
  const delaySec = meta?.[STAGGER_DELAY_KEY] ?? config.staggerDelay;
  const durationSec = meta?.[STAGGER_DURATION_KEY] ?? config.duration.normal;

  // 剥离我们注入的 CSS 自定义属性，避免泄漏到 DOM
  const cleanStyle: CSSProperties | undefined = style
    ? (Object.fromEntries(Object.entries(style).filter(([k]) => !k.startsWith("--stagger-"))) as CSSProperties)
    : undefined;

  return (
    <m.div
      className={className}
      style={cleanStyle}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        transition: {
          duration: durationSec,
          delay: delaySec * index,
          ease: EASE_OUT,
        },
      }}
      exit={{
        opacity: 0,
        y: -8,
        scale: 0.96,
        // 离场不带 stagger 延迟，让所有被移除项几乎同时退出
        transition: { duration: durationSec * 0.6, ease: EASE_IN },
      }}
      layout="position"
    >
      {children}
    </m.div>
  );
}

// ============================================================================
// CountUp — 数字滚动动画（基于 react-countup，非 framer-motion）
// ============================================================================

interface CountUpProps {
  value: number;
  duration?: number;
  className?: string;
  formatter?: (value: number) => string;
}

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
// 导出 framer-motion 基元（供少数需要精细控制的场景，如 file-uploader）
// ============================================================================

export { m, AnimatePresence };
