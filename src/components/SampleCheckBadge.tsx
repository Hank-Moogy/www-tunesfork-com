import { Check, AlertTriangle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface SampleCheck {
  included: number;
  missing: number;
  external: number;
  missing_paths?: string[];
  external_paths?: string[];
}

interface Props {
  check: SampleCheck | null | undefined;
  size?: "sm" | "md";
}

export function SampleCheckBadge({ check, size = "sm" }: Props) {
  if (!check) return null;
  const total = check.included + check.missing + check.external;
  if (total === 0) return null;

  const issues = check.missing + check.external;
  const ok = issues === 0;

  const sizeClasses =
    size === "sm"
      ? "text-[10px] px-1.5 py-0.5 gap-1"
      : "text-xs px-2 py-1 gap-1.5";
  const iconClass = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  if (ok) {
    return (
      <span
        title={`All ${check.included} samples included`}
        className={`inline-flex items-center rounded-full bg-accent/15 text-accent font-medium ${sizeClasses}`}
      >
        <Check className={iconClass} />
        Samples
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex items-center rounded-full bg-amber-500/15 text-amber-500 font-medium hover:bg-amber-500/25 transition-colors ${sizeClasses}`}
        >
          <AlertTriangle className={iconClass} />
          {issues} {issues === 1 ? "sample" : "samples"} missing
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 text-xs space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-semibold text-sm">Missing samples</div>
        {check.missing > 0 && (
          <div>
            <div className="text-muted-foreground mb-1">
              {check.missing} referenced file{check.missing === 1 ? "" : "s"}{" "}
              not in the project folder:
            </div>
            <ul className="font-mono text-[11px] space-y-0.5 max-h-32 overflow-y-auto">
              {check.missing_paths?.slice(0, 10).map((p) => (
                <li key={p} className="truncate" title={p}>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}
        {check.external > 0 && (
          <div>
            <div className="text-muted-foreground mb-1">
              {check.external} sample{check.external === 1 ? "" : "s"} live
              outside the project folder and weren't included:
            </div>
            <ul className="font-mono text-[11px] space-y-0.5 max-h-24 overflow-y-auto">
              {check.external_paths?.slice(0, 5).map((p) => (
                <li key={p} className="truncate" title={p}>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="pt-1 border-t border-border/40 text-muted-foreground">
          Fix in Ableton: <span className="text-foreground">File → Collect All and Save</span>{" "}
          (tick every category), then re-save.
        </div>
      </PopoverContent>
    </Popover>
  );
}
