import { MonitorDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackButtonClick } from "@/lib/analytics";

interface NewProjectCardProps {
  onClick: () => void;
}

export default function NewProjectCard({ onClick }: NewProjectCardProps) {

  return (
    <button
      type="button"
      onClick={() => {
        trackButtonClick("dashboard_new_project_tile", "dashboard");
        onClick();
      }}
      className={cn(
        "group rounded-2xl border border-dashed bg-[rgb(var(--film-1))] backdrop-blur-xl",
        "flex flex-col items-center justify-center gap-3 p-6 text-center",
        "aspect-square transition-all duration-200",
        "border-[rgb(var(--edge-strong))] hover:border-brand/60 hover:bg-[rgb(var(--film-2))] hover:-translate-y-0.5"
      )}
    >
      <div className="rounded-2xl bg-brand/15 p-4 group-hover:bg-brand/25 transition-colors">
        <MonitorDown className="h-8 w-8 text-brand" strokeWidth={1.75} />
      </div>
      <div className="space-y-1">
        <div className="font-semibold text-foreground">Add a project</div>
        <div className="text-xs font-mono text-muted-foreground">
          Sync captures it from Ableton
        </div>
      </div>
    </button>
  );
}
