"use client";

import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact";
        }
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

interface TurnstileWidgetProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "compact";
}

let scriptLoaded = false;
let scriptLoading = false;
const loadCallbacks: (() => void)[] = [];

function loadTurnstileScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve();
  
  return new Promise((resolve) => {
    if (scriptLoading) {
      loadCallbacks.push(resolve);
      return;
    }

    scriptLoading = true;
    loadCallbacks.push(resolve);

    window.onTurnstileLoad = () => {
      scriptLoaded = true;
      scriptLoading = false;
      loadCallbacks.forEach((cb) => cb());
      loadCallbacks.length = 0;
    };

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  });
}

export function TurnstileWidget({
  siteKey,
  onVerify,
  onExpire,
  onError,
  theme = "auto",
  size = "normal",
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    let cancelled = false;

    loadTurnstileScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return;

      if (widgetIdRef.current) {
        window.turnstile!.remove(widgetIdRef.current);
      }

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => onVerifyRef.current(token),
        "expired-callback": () => onExpireRef.current?.(),
        "error-callback": () => onErrorRef.current?.(),
        theme,
        size,
      });
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, theme, size]);

  return (
    <div className="space-y-2">
      {isLoading && <Skeleton className="h-[65px] w-[300px] rounded" />}
      <div ref={containerRef} />
    </div>
  );
}
