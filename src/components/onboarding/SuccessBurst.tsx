import { useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";

/**
 * The moment a step lands. One expanding ring, one settling mark, then it
 * clears itself — Ambientic's rule that an expressive sequence is temporary
 * and always restores operational state. No confetti: this should read as a
 * mechanism engaging, not as a prize.
 */
export default function SuccessBurst({
  label,
  onDone,
}: {
  label: string;
  onDone: () => void;
}) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const t = setTimeout(onDone, reduceMotion ? 700 : 1250);
    return () => clearTimeout(t);
  }, [onDone, reduceMotion]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5"
      role="status"
      aria-live="polite"
    >
      <div className="relative grid place-items-center">
        {!reduceMotion && (
          <motion.span
            aria-hidden
            initial={{ scale: 0.4, opacity: 0.75 }}
            animate={{ scale: 2.6, opacity: 0 }}
            transition={{ duration: 1.1, ease: "easeOut" }}
            className="absolute h-24 w-24 rounded-full border border-brand"
          />
        )}
        <motion.span
          initial={reduceMotion ? false : { scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
          className="grid h-24 w-24 place-items-center rounded-full border border-brand/50 bg-brand/15"
          style={{ boxShadow: "0 0 50px -10px hsl(var(--brand) / 0.8)" }}
        >
          <Check className="h-10 w-10 text-brand" strokeWidth={2.5} />
        </motion.span>
      </div>
      <motion.p
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="text-lg font-semibold"
      >
        {label}
      </motion.p>
    </motion.div>
  );
}
