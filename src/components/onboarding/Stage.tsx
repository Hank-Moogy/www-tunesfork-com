import { useRef, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from "motion/react";

/**
 * The object at the centre of an onboarding screen.
 *
 * Character-select screens work because the thing you are configuring is a
 * physical object sitting in space, lit, that answers when you move. So the
 * stage tilts toward the pointer on a spring, sits on a lit plinth, and throws
 * its colour into the air behind it. Everything else on the screen is chrome
 * around this object.
 *
 * The tilt is a spring rather than a direct mapping so the object has mass; a
 * 1:1 tilt feels like a sticker on glass.
 */
export default function Stage({
  children,
  glow = "hsl(var(--brand))",
  className,
}: {
  children: ReactNode;
  glow?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 120, damping: 18, mass: 0.6 });
  const sy = useSpring(py, { stiffness: 120, damping: 18, mass: 0.6 });

  const rotateY = useTransform(sx, [-1, 1], [14, -14]);
  const rotateX = useTransform(sy, [-1, 1], [-12, 12]);
  const shift = useTransform(sx, [-1, 1], [10, -10]);

  const onMove = (e: ReactPointerEvent) => {
    if (reduceMotion) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    px.set(((e.clientX - r.left) / r.width - 0.5) * 2);
    py.set(((e.clientY - r.top) / r.height - 0.5) * 2);
  };

  const reset = () => {
    px.set(0);
    py.set(0);
  };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={reset}
      className={className}
      style={{ perspective: 1100 }}
    >
      <motion.div
        style={reduceMotion ? undefined : { rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="relative flex h-full w-full items-center justify-center"
      >
        <motion.div
          aria-hidden
          style={{ x: reduceMotion ? 0 : shift, background: glow }}
          className="pointer-events-none absolute h-56 w-56 rounded-full opacity-[0.16] blur-[70px]"
        />
        {children}
        {/* The plinth. Grounds the object so it reads as standing, not floating. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 h-10 w-64 rounded-[100%] opacity-30 blur-2xl"
          style={{ background: glow }}
        />
      </motion.div>
    </div>
  );
}
