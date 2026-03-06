"use client";

import { type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center animate-in fade-in slide-in-from-bottom-3 duration-400 ease-out fill-mode-both",
        className
      )}
    >
      <div className="rounded-full bg-muted p-6 mb-6 animate-in zoom-in-80 fade-in duration-350 delay-75 ease-out fill-mode-both">
        <Icon className="h-12 w-12 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-150 ease-out fill-mode-both">
        {title}
      </h3>
      {description && (
        <p className="text-muted-foreground max-w-sm animate-in fade-in slide-in-from-bottom-1 duration-300 delay-200 ease-out fill-mode-both">
          {description}
        </p>
      )}
      {action && (
        <div className="animate-in fade-in slide-in-from-bottom-1 duration-300 delay-300 ease-out fill-mode-both">
          <Button className="mt-6" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
