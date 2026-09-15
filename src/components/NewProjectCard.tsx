import { useState } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackButtonClick } from "@/lib/analytics";

interface NewProjectCardProps {
  onClick: () => void;
  onFilesDropped?: (files: FileList) => void;
}

export default function NewProjectCard({ onClick, onFilesDropped }: NewProjectCardProps) {
  const [over, setOver] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        trackButtonClick("dashboard_new_project_tile", "dashboard");
        onClick();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          trackButtonClick("dashboard_drop_upload", "dashboard");
          onFilesDropped?.(e.dataTransfer.files);
        }
      }}
      className={cn(
        "group rounded-2xl border border-dashed bg-[rgb(var(--film-1))] backdrop-blur-xl",
        "flex flex-col items-center justify-center gap-3 p-6 text-center",
        "aspect-square transition-all duration-200",
        over
          ? "border-brand bg-brand/10 -translate-y-0.5"
          : "border-[rgb(var(--edge-strong))] hover:border-brand/60 hover:bg-[rgb(var(--film-2))] hover:-translate-y-0.5"
      )}
    >
      <div className="rounded-2xl bg-brand/15 p-4 group-hover:bg-brand/25 transition-colors">
        <UploadCloud className="h-8 w-8 text-brand" strokeWidth={1.75} />
      </div>
      <div className="space-y-1">
        <div className="font-semibold text-foreground">New Project</div>
        <div className="text-xs text-muted-foreground font-mono">
          Sync from the desktop app
        </div>
      </div>
    </button>
  );
}
