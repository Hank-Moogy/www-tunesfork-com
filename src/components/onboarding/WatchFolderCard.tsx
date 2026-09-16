import { motion, useReducedMotion } from "motion/react";
import { FolderTree, X } from "lucide-react";

/**
 * The last onboarding step, living on the dashboard rather than in a flow.
 *
 * By this point the user has a working setup, so holding them on a dedicated
 * screen to explain an optional improvement would be a toll gate. It sits with
 * their projects instead, where the thing it describes actually applies, and
 * retires itself once enough projects are being watched.
 */
export default function WatchFolderCard({
  projectCount,
  onDismiss,
}: {
  projectCount: number;
  onDismiss: () => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="tf-surface relative flex flex-col gap-4 rounded-xl p-5 sm:flex-row sm:items-center sm:gap-6"
    >
      <div className="tf-lit tf-breathe grid h-12 w-12 shrink-0 place-items-center rounded-xl">
        <FolderTree className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="tf-label mb-1.5">Last step</p>
        <h2 className="text-[17px] font-semibold tracking-tight">Back up everything at once</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {projectCount === 1
            ? "One project is safe. If the rest of your Ableton sessions live under a single folder, point Sync at that folder instead — every session inside it gets versioned, including the ones you start next year."
            : `${projectCount} projects are safe. Point Sync at the folder holding all of them and you will never have to add one by hand again.`}
        </p>
      </div>

      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-md text-subtle-foreground transition-colors hover:bg-[rgb(var(--film-2))] hover:text-foreground sm:static sm:h-8 sm:w-8"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.section>
  );
}
