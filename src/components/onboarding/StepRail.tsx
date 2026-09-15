import { motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StepId } from "@/hooks/useOnboardingProgress";

export type RailStep = { id: StepId; label: string; hint: string };

/**
 * Progress as a lit column, the way a setup sequence in a game shows which
 * slots are filled. Steps never move or reorder — only their light changes —
 * so the rail stays a stable map rather than a list that reshuffles under you.
 */
export default function StepRail({
  steps,
  activeId,
  done,
  onJump,
}: {
  steps: RailStep[];
  activeId: StepId;
  done: Record<StepId, boolean>;
  onJump: (id: StepId) => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    // Below lg the rail collapses to a row of lamps. Six labelled rows is a
    // full phone screen of chrome, which pushed the object off the bottom —
    // and the heading already names the current step, so the labels are
    // redundant at that size.
    <ol className="relative flex items-center gap-2 lg:block lg:space-y-1">
      {/* The spine the lamps sit on. Vertical rail only. */}
      <span
        aria-hidden
        className="absolute left-[15px] top-3 bottom-3 hidden w-px bg-border lg:block"
      />
      {steps.map((step, i) => {
        const complete = done[step.id];
        const active = step.id === activeId;
        // Reachable means: already done, or the one you are on. You cannot
        // skip forward into a step whose prerequisite has not happened.
        const reachable = complete || active;
        return (
          <li key={step.id} className="relative flex-1 lg:flex-none">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => reachable && onJump(step.id)}
              className={cn(
                "group flex w-full items-center justify-center rounded-lg text-left transition-colors lg:items-start lg:justify-start lg:gap-3 lg:p-2.5",
                reachable ? "cursor-pointer hover:bg-[rgb(var(--film-1))]" : "cursor-default",
              )}
            >
              <span
                className={cn(
                  "relative z-10 mt-0.5 grid h-[31px] w-[31px] shrink-0 place-items-center rounded-full border font-mono text-[11px] transition-all duration-300",
                  complete
                    ? "border-brand/50 bg-brand/15 text-brand"
                    : active
                      ? "border-brand bg-[hsl(var(--background))] text-brand"
                      : "border-border bg-[hsl(var(--background))] text-subtle-foreground",
                )}
                style={
                  active && !complete
                    ? { boxShadow: "0 0 16px -2px hsl(var(--brand) / 0.65)" }
                    : undefined
                }
              >
                {complete ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>

              <span className="hidden min-w-0 pt-1 lg:block">
                <span
                  className={cn(
                    "block text-sm transition-colors",
                    active ? "font-semibold text-foreground" : complete ? "text-foreground/70" : "text-subtle-foreground",
                  )}
                >
                  {step.label}
                </span>
                {active && (
                  <motion.span
                    initial={reduceMotion ? false : { opacity: 0, y: -2 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-0.5 block text-xs leading-snug text-muted-foreground"
                  >
                    {step.hint}
                  </motion.span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
