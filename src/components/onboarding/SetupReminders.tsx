import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, X } from "lucide-react";

export type ReminderId = "share" | "watch";

type Reminder = {
  id: ReminderId;
  /** Continues the numbering of the setup rail — these are 5 and 6 of six. */
  number: number;
  label: string;
  body: string;
  cta: string;
  /** Steps shown in place. Used where the answer is an instruction rather
   *  than a destination — there is no page that teaches folder watching. */
  detail?: string[];
};

const REMINDERS: Reminder[] = [
  {
    id: "share",
    number: 5,
    label: "Share a project",
    body: "Send a link — anyone can hear it and see every version, no account needed.",
    cta: "Share one",
  },
  {
    id: "watch",
    number: 6,
    label: "Back up everything",
    body: "Point Sync at the folder holding all your sessions instead of adding them one by one.",
    cta: "How",
    detail: [
      "Open Tunesfork Sync from your menu bar.",
      "Choose Add folder, and pick the folder that contains all your Ableton projects — not one project, the folder holding them.",
      "Every session inside it is versioned from now on, including ones you create later.",
    ],
  },
];

/**
 * The last two onboarding steps, continued on the dashboard.
 *
 * It keeps the onboarding rail's shape — a vertical spine with numbered lamps,
 * picking up at five — so it reads as the same journey rather than a new
 * widget. What changes is that it no longer holds anyone: every step exits,
 * individually or all at once, because these are improvements on a working
 * setup rather than setup.
 */
export default function SetupReminders({
  items,
  onAct,
  onDismiss,
  onDismissAll,
}: {
  items: { id: ReminderId; done: boolean }[];
  onAct: (id: ReminderId) => void;
  onDismiss: (id: ReminderId) => void;
  onDismissAll: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState<ReminderId | null>(null);
  const visible = REMINDERS.filter((r) => items.some((i) => i.id === r.id));
  if (visible.length === 0) return null;

  const doneCount = items.filter((i) => i.done).length;

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="tf-surface relative rounded-xl p-4"
      aria-label="Finish setting up"
    >
      <div className="mb-3 flex items-center justify-between gap-3 pr-7">
        <p className="tf-label">Finish setting up</p>
        <span className="font-mono text-[11px] text-subtle-foreground">
          {doneCount}/{items.length}
        </span>
      </div>

      {/* Exits the whole panel. Separate from the per-step dismiss, because
          "I have done enough of this" and "not this one" are different. */}
      <button
        onClick={onDismissAll}
        aria-label="Dismiss all remaining steps"
        className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-md text-subtle-foreground opacity-70 transition-all hover:bg-[rgb(var(--film-2))] hover:text-foreground hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>

      <ol className="relative">
        {/* The spine, as on the onboarding rail. Stops short of the last lamp
            so it reads as a path rather than a border. */}
        {visible.length > 1 && (
          <span aria-hidden className="absolute left-[15px] top-4 bottom-8 w-px bg-border" />
        )}

        <AnimatePresence initial={false}>
          {visible.map((r) => {
            const done = items.find((i) => i.id === r.id)?.done ?? false;
            const open = expanded === r.id;
            return (
              <motion.li
                key={r.id}
                layout={!reduceMotion}
                exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                transition={{ duration: 0.28 }}
                className="group relative flex gap-3 overflow-hidden rounded-lg p-2 transition-colors hover:bg-[rgb(var(--film-1))]"
              >
                <span
                  className={`relative z-10 mt-0.5 grid h-[31px] w-[31px] shrink-0 place-items-center rounded-full border font-mono text-[11px] transition-all ${
                    done
                      ? "border-brand/50 bg-brand/15 text-brand"
                      : "border-border bg-[hsl(var(--surface-1))] text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : r.number}
                </span>

                <span className="min-w-0 flex-1 pt-1">
                  <span className="flex items-start gap-2">
                    <span
                      className={`flex-1 text-sm font-medium ${done ? "text-muted-foreground line-through" : ""}`}
                    >
                      {r.label}
                    </span>

                    {!done && (
                      <button
                        onClick={() =>
                          r.detail ? setExpanded((v) => (v === r.id ? null : r.id)) : onAct(r.id)
                        }
                        className="flex shrink-0 items-center gap-1 rounded-md border border-brand/35 px-2.5 py-1 text-[11px] font-semibold text-brand transition-colors hover:bg-brand/10"
                      >
                        {r.cta}
                        <ArrowRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
                      </button>
                    )}

                    <button
                      onClick={() => onDismiss(r.id)}
                      aria-label={`Dismiss ${r.label}`}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-subtle-foreground opacity-60 transition-all hover:bg-[rgb(var(--film-2))] hover:text-foreground hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>

                  {!done && (
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      {r.body}
                    </span>
                  )}

                  {r.detail && open && (
                    <motion.ol
                      initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="mt-2 space-y-1.5 overflow-hidden border-l border-border pl-3"
                    >
                      {r.detail.map((line, i) => (
                        <li key={i} className="text-xs leading-relaxed text-muted-foreground">
                          <span className="mr-1.5 font-mono text-[10px] text-brand">{i + 1}</span>
                          {line}
                        </li>
                      ))}
                    </motion.ol>
                  )}
                </span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </motion.section>
  );
}
