import { cn } from "@/lib/utils";

type Status = "pending" | "active" | "in-progress" | "completed" | "rejected" | "draft";

const statusConfig: Record<Status, { label: string; className: string }> = {
  pending: { label: "Pending", className: "status-badge status-badge-pending" },
  active: { label: "Active", className: "status-badge status-badge-active" },
  "in-progress": { label: "In Progress", className: "status-badge status-badge-active" },
  completed: { label: "Completed", className: "status-badge status-badge-completed" },
  rejected: { label: "Rejected", className: "status-badge status-badge-rejected" },
  draft: { label: "Draft", className: "status-badge status-badge-pending" },
};

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span className={cn(config.className, className)}>
      {config.label}
    </span>
  );
}
