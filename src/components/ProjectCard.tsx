import { motion, useReducedMotion } from "motion/react";
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
  /** Grid position, used to stagger the card's arrival. */
  index?: number;
}

/**
 * Status reads as a lamp plus a label, never as a coloured fill. A green
 * FILL is reserved for actions, so a READY project lights a dot instead --
 * otherwise "done" and "click me" become the same signal.
 */
function statusMeta(p: Project): { label: string; state: string } {
  if (p.archived) return { label: "Archived", state: "idle" };
  if (p.handoff_status === "ready") return { label: "Ready", state: "synced" };
  return { label: "In progress", state: "pending" };
}

/**
 * A project's artwork stands in for a cover the user has not supplied, so it
 * has to be distinctive per project without turning the grid into a paint
 * chart. Hue is therefore drawn from Ambientic's cool arc -- green through
 * cyan, blue and violet -- rather than the full wheel, and kept dark and
 * desaturated enough to sit inside the page as deep coloured glass instead
 * of shouting over it.
 */
const COVER_HUES = [135, 165, 186, 205, 224, 248, 266, 286];

function gradientFor(name: string, archived: boolean) {
  if (archived) {
    return `linear-gradient(140deg, hsl(250 8% 26%), hsl(250 8% 16%))`;
  }
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  const h1 = COVER_HUES[hash % COVER_HUES.length];
  // The second stop steps one place along the arc, so every cover reads as
  // one light passing through a material rather than two colours colliding.
  const h2 = COVER_HUES[(hash % COVER_HUES.length + 2) % COVER_HUES.length];
  return [
    // Top-light, matching how every other surface catches the light.
    `radial-gradient(120% 90% at 50% 0%, hsl(0 0% 100% / 0.10), transparent 62%)`,
    `linear-gradient(140deg, hsl(${h1} 48% 34%), hsl(${h2} 52% 19%))`,
  ].join(", ");
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

export default function ProjectCard({ project, collaborators = [], index = 0 }: ProjectCardProps) {
  const status = statusMeta(project);
  const visible = collaborators.slice(0, 3);
  const extra = Math.max(0, collaborators.length - visible.length);
  const reduceMotion = useReducedMotion();

  return (
    <motion.a
      href={`/project/${project.id}`}
      onClick={() =>
        trackButtonClick("dashboard_open_project", "dashboard_card", { project_id: project.id })
      }
      // Cards arrive as one wave rather than a row of independent pop-ins:
      // the stagger is derived from grid position, so the field settles in
      // the direction the grid is read. Ambientic's interface transitions sit
      // at 180-500ms with a long settle, hence the spring rather than a
      // linear ease.
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.42,
        delay: reduceMotion ? 0 : Math.min(index, 11) * 0.045,
        ease: [0.22, 1, 0.36, 1],
      }}
      // Responsive under the hand: the lift answers immediately and settles
      // soft. On a near-black page a drop shadow reads as mud, so the lift is
      // carried by the edge catching more light instead.
      whileHover={reduceMotion ? undefined : { y: -4 }}
      whileTap={reduceMotion ? undefined : { y: -1, scale: 0.99 }}
      className={cn(
        "group tf-surface flex aspect-square flex-col rounded-xl",
        "transition-colors duration-200 hover:border-[rgb(var(--edge-strong))]",
      )}
    >
      <div
        className="relative w-full aspect-[16/10] shrink-0 overflow-hidden rounded-t-[inherit]"
        style={{ background: gradientFor(project.name, project.archived) }}
      >
        {project.archived && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Archive className="h-10 w-10 text-white/80" strokeWidth={1.5} />
          </div>
        )}
        <div className="absolute top-3 right-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--edge))] bg-[hsl(var(--background))]/65 px-2 py-0.5 font-mono text-[10px] font-medium text-foreground/90 backdrop-blur-md">
            <i className="tf-lamp" data-state={status.state} aria-hidden />
            {status.label}
          </span>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <h3 className="font-semibold text-foreground truncate transition-colors group-hover:text-brand">
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
            {visible.map((c) => {
              const initialsText = initials(c.display_name, c.user_id);
              return (
                <div
                  key={c.user_id}
                  className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[rgb(var(--film-3))] text-xs font-semibold text-foreground ring-2 ring-[hsl(var(--surface-1))]"
                  title={c.display_name ?? "Collaborator"}
                >
                  {c.avatar_url ? (
                    <img src={c.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initialsText
                  )}
                </div>
              );
            })}
            {extra > 0 && (
              <div className="h-7 w-7 rounded-full ring-2 ring-white bg-muted text-[10px] font-semibold flex items-center justify-center text-muted-foreground">
                +{extra}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.a>
  );
}
