import { cn } from "@/lib/utils";

type Status = "running" | "stopped" | "installing" | "error";

interface StatusBadgeProps {
  status: Status | string;
  className?: string;
  animate?: boolean;
}

export function StatusBadge({ status, className, animate = true }: StatusBadgeProps) {
  const getStatusColor = (s: string) => {
    switch (s) {
      case "running": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
      case "stopped": return "bg-slate-500/15 text-slate-400 border-slate-500/20";
      case "installing": return "bg-blue-500/15 text-blue-400 border-blue-500/20";
      case "error": return "bg-red-500/15 text-red-400 border-red-500/20";
      default: return "bg-slate-500/15 text-slate-400";
    }
  };

  const getDotColor = (s: string) => {
    switch (s) {
      case "running": return "bg-emerald-400";
      case "stopped": return "bg-slate-400";
      case "installing": return "bg-blue-400";
      case "error": return "bg-red-400";
      default: return "bg-slate-400";
    }
  };

  return (
    <div className={cn(
      "inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border uppercase tracking-wider",
      getStatusColor(status),
      className
    )}>
      <span className="relative flex h-2 w-2">
        {animate && status === "running" && (
          <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", getDotColor(status))}></span>
        )}
        {animate && status === "installing" && (
          <span className={cn("animate-pulse absolute inline-flex h-full w-full rounded-full opacity-75", getDotColor(status))}></span>
        )}
        <span className={cn("relative inline-flex rounded-full h-2 w-2", getDotColor(status))}></span>
      </span>
      {status}
    </div>
  );
}
