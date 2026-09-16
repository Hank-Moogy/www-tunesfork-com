import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, FolderTree, Share2, X } from "lucide-react";

export type ReminderId = "share" | "watch";

type Reminder = {
  id: ReminderId;
  label: string;
  body: string;
  cta: string;
  icon: typeof Share2;
  /** Steps shown in place. Used where the answer is an instruction rather
   *  than a destination — there is no page that teaches folder watching. */
  detail?: string[];
};

const REMINDERS: Reminder[] = [
  {
    id: "share",
    label: "Share a project",
    body: "Send a link — anyone can hear it and see every version, no account needed.",
    cta: "Share one",
    icon: Share2,
  },
  {
    id: "watch",
    label: "Back up everything",
    body: "Point Sync at the folder holding all your sessions instead of adding them one by one.",
    cta: "How",
    icon: FolderTree,
    detail: [
      "Open Tunesfork Sync from your menu bar.",
      "Choose Add folder, and pick the folder that contains all your Ableton projects — not one project, the folder holding them.",
      "Every session inside it is versioned from now on, including ones you create later.",
    ],
  },
];

/**
 * What is left to do, once setup is finished.
 *
 * These are improvements on a working setup, not setup — so they must not gate
 * anything and must be removable. Each row dismisses on its own and the panel
 * retires when nothing is left, so a user who does not want them is never
 * nagged twice.
 *
 * It sits beside the activity field at the top of the dashboard: high enough
 * to be seen, inside the page rather than floating over it.
 */
export default function SetupReminders({
  items,
  onAct,
  onDismiss,
}: {
  items: { id: ReminderId; done: boolean }[];
  onAct: (id: ReminderId) => void;
  onDismiss: (id: ReminderId) => void;
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
      className="tf-surface rounded-xl p-4"
      aria-label="Finish setting up"
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="tf-label">Finish setting up</p>
        <span className="font-mono text-[11px] text-subtle-foreground">
          {doneCount}/{items.length}
        </span>
      </div>

      <ul className="space-y-1">
        <AnimatePresence initial={false}>
          {visible.map((r) => {
            const done = items.find((i) => i.id === r.id)?.done ?? false;
            return (
              <motion.li
                key={r.id}
                layout={!reduceMotion}
                exit={reduceMotion ? undefined : { opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.28 }}
                className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-[rgb(var(--film-1))]"
              >
                <span
                  className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border ${
                    done
                      ? "border-brand/50 bg-brand/15 text-brand"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : <r.icon className="h-3.5 w-3.5" />}
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm font-medium ${done ? "text-muted-foreground line-through" : ""}`}
                  >
                    {r.label}
                  </span>
                  {!done && (
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                      {r.body}
                    </span>
                  )}
                  {r.detail && expanded === r.id && (
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

                {!done && (
                  <button
                    onClick={() =>
                      r.detail ? setExpanded((v) => (v === r.id ? null : r.id)) : onAct(r.id)
                    }
                    className="mt-0.5 flex shrink-0 items-center gap-1 rounded-md border border-brand/35 px-2.5 py-1 text-[11px] font-semibold text-brand transition-colors hover:bg-brand/10"
                  >
                    {r.cta}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                )}

                <button
                  onClick={() => onDismiss(r.id)}
                  aria-label={`Dismiss ${r.label}`}
                  className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md text-subtle-foreground opacity-60 transition-all hover:bg-[rgb(var(--film-2))] hover:text-foreground hover:opacity-100 focus-visible:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </motion.section>
  );
}
