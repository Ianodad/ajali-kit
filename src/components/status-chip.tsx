import { cn } from "@/lib/utils";
import type { IncidentStatus } from "@/lib/types";

const STATUS_LABEL: Record<IncidentStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  exported: "Exported",
};

const STATUS_CLASS: Record<IncidentStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  ready: "bg-amber/15 text-amber-900",
  exported: "bg-emerald-100 text-emerald-800",
};

export function StatusChip({
  status,
  className,
}: {
  status: IncidentStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        STATUS_CLASS[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
