import { useEffect } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";

/**
 * A price that counts to its new value instead of cutting to it.
 *
 * Switching billing interval changes every number on the page at once. Cutting
 * makes that a repaint you can miss; counting makes it an event, and the
 * direction of travel shows you which way the price moved without reading it.
 *
 * The spring is stiff enough to settle quickly — this is a transition, not an
 * ambient effect, so it has to be over before the eye moves on.
 */
export default function RollingPrice({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const raw = useMotionValue(value);
  const spring = useSpring(raw, { stiffness: 140, damping: 22, mass: 0.7 });

  useEffect(() => {
    if (reduceMotion) {
      raw.jump(value);
      spring.jump(value);
      return;
    }
    raw.set(value);
  }, [value, raw, spring, reduceMotion]);

  // Whole euros lose the decimals, which is how the prices are written.
  const text = useTransform(spring, (v) =>
    Number.isInteger(value) && Math.abs(v - Math.round(v)) < 0.005
      ? `€${Math.round(v)}`
      : `€${v.toFixed(2)}`,
  );

  return <motion.span className={className}>{text}</motion.span>;
}
