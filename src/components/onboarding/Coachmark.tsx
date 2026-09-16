import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

type Rect = { top: number; left: number; width: number; height: number };

/**
 * A spotlight on a real control in the real app.
 *
 * The last onboarding steps are things you do *in* the product — sharing a
 * project, watching a folder — so teaching them on a separate screen means
 * demonstrating a button that is somewhere else. This dims the page, cuts a
 * hole around the actual control, and points at it.
 *
 * The hole is a box-shadow with a huge spread rather than an SVG mask or four
 * dimming panels: one element, no seams at the corners, and it follows the
 * target's border radius for free.
 */
export default function Coachmark({
  targetSelector,
  title,
  body,
  actionLabel,
  onAction,
  onDismiss,
  placement = "bottom",
}: {
  targetSelector: string;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  placement?: "bottom" | "top";
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let raf = 0;
    let tries = 0;

    const measure = () => {
      const el = document.querySelector(targetSelector);
      if (!el) {
        // The target may not be mounted yet — the page is probably still
        // loading its data. Keep looking briefly rather than failing silently.
        if (tries++ < 120) raf = requestAnimationFrame(measure);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      raf = requestAnimationFrame(measure);
    };
    measure();

    return () => cancelAnimationFrame(raf);
  }, [targetSelector]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  if (!rect) return null;

  const pad = 8;
  const below = placement === "bottom";
  const cardTop = below ? rect.top + rect.height + 18 : rect.top - 18;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-[60]"
        role="dialog"
        aria-label={title}
      >
        {/* Everything except the target is dimmed. Clicking the dim dismisses;
            the hole stays interactive, so the user can actually press the
            button being pointed at. */}
        <div className="absolute inset-0" onClick={onDismiss} />

        <div
          className="pointer-events-none absolute rounded-xl"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px hsl(var(--background) / 0.86)",
          }}
        />
        <motion.div
          className="pointer-events-none absolute rounded-xl border border-brand"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 26px -2px hsl(var(--brand) / 0.7)",
          }}
          animate={reduceMotion ? undefined : { opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: below ? -8 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: 0.12 }}
          className="tf-surface absolute w-[290px] rounded-xl p-4"
          style={{
            top: below ? cardTop : undefined,
            bottom: below ? undefined : `calc(100% - ${cardTop}px)`,
            // Keep the card on screen when the target sits near an edge.
            left: Math.min(
              Math.max(12, rect.left + rect.width / 2 - 145),
              window.innerWidth - 302,
            ),
          }}
        >
          <p className="tf-label mb-2">Last step but one</p>
          <p className="text-[15px] font-semibold leading-snug">{title}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
          <div className="mt-3 flex items-center gap-3">
            {actionLabel && onAction && (
              <button
                onClick={onAction}
                className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground transition-colors hover:bg-brand/90"
              >
                {actionLabel}
              </button>
            )}
            <button
              onClick={onDismiss}
              className="text-xs text-subtle-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Not now
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
