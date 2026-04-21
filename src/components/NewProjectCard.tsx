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
        "group rounded-2xl border-2 border-dashed bg-white/40 backdrop-blur-xl",
        "flex flex-col items-center justify-center gap-3 p-6 text-center",
        "aspect-square max-w-[220px] transition-all duration-200",
        over
          ? "border-accent bg-accent/10 -translate-y-0.5"
          : "border-white/70 hover:border-accent/60 hover:bg-white/60 hover:-translate-y-0.5"
      )}
    >
      <div className="rounded-2xl bg-accent/15 p-4 group-hover:bg-accent/25 transition-colors">
        <UploadCloud className="h-8 w-8 text-accent" strokeWidth={1.75} />
      </div>
      <div className="space-y-1">
        <div className="font-semibold text-foreground">New Project</div>
        <div className="text-xs text-muted-foreground font-mono">
          Click or drop .als / .zip
        </div>
      </div>
    </button>
  );
}
