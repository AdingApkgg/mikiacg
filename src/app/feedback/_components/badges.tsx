"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Bug,
  Library,
  Lightbulb,
  ShieldAlert,
  UserCog,
  HelpCircle,
  Clock,
  Loader,
  AlertCircle,
  CheckCircle2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { TICKET_CATEGORY_LABELS, TICKET_PRIORITY_LABELS, TICKET_STATUS_LABELS } from "@/lib/ticket-schema";

type Category = keyof typeof TICKET_CATEGORY_LABELS;
type Status = keyof typeof TICKET_STATUS_LABELS;
type Priority = keyof typeof TICKET_PRIORITY_LABELS;

const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  BUG: Bug,
  RESOURCE_REQUEST: Library,
  FEATURE_REQUEST: Lightbulb,
  CONTENT_REPORT: ShieldAlert,
  ACCOUNT_ISSUE: UserCog,
  OTHER: HelpCircle,
};

const STATUS_ICONS: Record<Status, LucideIcon> = {
  PENDING: Clock,
  IN_PROGRESS: Loader,
  WAITING_USER: AlertCircle,
  RESOLVED: CheckCircle2,
  CLOSED: XCircle,
};

const STATUS_STYLES: Record<Status, string> = {
  PENDING: "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400",
  IN_PROGRESS: "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400",
  WAITING_USER: "bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400",
  RESOLVED: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400",
  CLOSED: "bg-muted text-muted-foreground border-border",
};

const PRIORITY_STYLES: Record<Priority, string> = {
  LOW: "bg-slate-500/10 text-slate-600 border-slate-500/20 dark:text-slate-400",
  NORMAL: "bg-sky-500/10 text-sky-600 border-sky-500/20 dark:text-sky-400",
  HIGH: "bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400",
  URGENT: "bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400",
};

export function CategoryBadge({ category, className }: { category: Category; className?: string }) {
  const Icon = CATEGORY_ICONS[category];
  return (
    <Badge variant="outline" className={cn("gap-1 font-normal", className)}>
      <Icon className="h-3 w-3" />
      {TICKET_CATEGORY_LABELS[category]}
    </Badge>
  );
}

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const Icon = STATUS_ICONS[status];
  return (
    <Badge variant="outline" className={cn("gap-1 font-normal", STATUS_STYLES[status], className)}>
      <Icon className="h-3 w-3" />
      {TICKET_STATUS_LABELS[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1 font-normal", PRIORITY_STYLES[priority], className)}>
      优先级·{TICKET_PRIORITY_LABELS[priority]}
    </Badge>
  );
}
