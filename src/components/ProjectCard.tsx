import { Calendar, Music2, Archive } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { trackButtonClick } from "@/lib/analytics";

type Project = Tables<"projects">;

export interface ProjectCardCollaborator {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface ProjectCardProps {
  project: Project;
  collaborators?: ProjectCardCollaborator[];
}

function statusMeta(p: Project) {
  if (p.archived) return { label: "ARCHIVED", className: "bg-[hsl(var(--status-archived))]/15 text-[hsl(var(--status-archived))] border border-[hsl(var(--status-archived))]/30" };
  if (p.handoff_status === "ready")
    return { label: "READY", className: "bg-[hsl(var(--status-ready))]/15 text-[hsl(var(--status-ready))] border border-[hsl(var(--status-ready))]/30" };
  return { label: "IN PROGRESS", className: "bg-[hsl(var(--status-progress))]/15 text-[hsl(var(--status-progress))] border border-[hsl(var(--status-progress))]/30" };
}

function gradientFor(name: string, archived: boolean) {
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const h1 = hash % 360;
  const h2 = (hash * 7) % 360;
  if (archived) {
    return `linear-gradient(135deg, hsl(220 8% 65%), hsl(220 8% 45%))`;
  }
  return `linear-gradient(135deg, hsl(${h1} 75% 62%), hsl(${h2} 70% 48%))`;
}

function initials(name: string | null, fallback: string) {
  const src = (name && name.trim()) || fallback;
  return src
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function ProjectCard({ project, collaborators = [] }: ProjectCardProps) {
  const status = statusMeta(project);
  const visible = collaborators.slice(0, 3);
  const extra = Math.max(0, collaborators.length - visible.length);

  return (
    <a
      href={`/project/${project.id}`}
      onClick={() =>
        trackButtonClick("dashboard_open_project", "dashboard_card", { project_id: project.id })
      }
      className={cn(
        "group glass-card overflow-hidden flex flex-col transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-12px_hsl(222_25%_20%_/_0.18)]"
      )}
    >
      <div
        className="relative h-36 w-full"
        style={{ background: gradientFor(project.name, project.archived) }}
      >
        {project.archived && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Archive className="h-10 w-10 text-white/80" strokeWidth={1.5} />
          </div>
        )}
        <div className="absolute top-3 right-3">
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full backdrop-blur-md bg-white/70",
              status.className
            )}
          >
            {status.label}
          </span>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
          {project.name}
        </h3>

        <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
          {project.bpm != null && (
            <span className="inline-flex items-center gap-1">
              <Music2 className="h-3 w-3" />
              {project.bpm} BPM
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(project.updated_at).toLocaleDateString()}
          </span>
        </div>

        {(visible.length > 0 || extra > 0) && (
          <div className="flex items-center -space-x-2 mt-auto">
            {visible.map((c, i) => (
              <div
                key={c.user_id}
                className="h-7 w-7 rounded-full ring-2 ring-white/80 bg-secondary text-secondary-foreground text-[10px] font-semibold flex items-center justify-center overflow-hidden"
                style={{
                  background: c.avatar_url
                    ? undefined
                    : `linear-gradient(135deg, hsl(${(i * 80) % 360} 70% 60%), hsl(${(i * 80 + 60) % 360} 70% 50%))`,
                  color: c.avatar_url ? undefined : "white",
                }}
                title={c.display_name ?? "Collaborator"}
              >
                {c.avatar_url ? (
                  <img src={c.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials(c.display_name, "?")
                )}
              </div>
            ))}
            {extra > 0 && (
              <div className="h-7 w-7 rounded-full ring-2 ring-white/80 bg-white/80 text-[10px] font-semibold flex items-center justify-center text-muted-foreground">
                +{extra}
              </div>
            )}
          </div>
        )}
      </div>
    </a>
  );
}
