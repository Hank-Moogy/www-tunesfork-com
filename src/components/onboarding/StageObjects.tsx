import { motion, useReducedMotion } from "motion/react";
import { Folder, Link2, Music4, Radio } from "lucide-react";

/**
 * One physical object per step. They share a construction so the sequence
 * reads as one instrument seen from six angles: a bevelled face, a top-light,
 * a hairline edge, and light thrown from whatever the step is about.
 *
 * `translateZ` on inner layers is deliberate — the parent Stage sets
 * `preserve-3d`, so these separate in depth as the object tilts, which is what
 * sells the object as physical rather than as a picture of one.
 */

const FACE =
  "relative grid place-items-center rounded-[22px] border border-[rgb(var(--edge-strong))] " +
  "bg-[linear-gradient(150deg,hsl(250_10%_17%),hsl(250_12%_9%))] " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_28px_60px_-24px_rgba(0,0,0,0.9)]";

/** Step 1 — a nameplate that lights as it is filled in. */
export function NameplateObject({ value }: { value: string }) {
  const filled = value.trim().length > 0;
  return (
    <div className={`${FACE} h-[190px] w-[330px]`}>
      <div
        className="absolute inset-x-6 top-5 h-px"
        style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,.18),transparent)" }}
      />
      <div style={{ transform: "translateZ(40px)" }} className="px-8 text-center">
        <p className="tf-label mb-3">Producer</p>
        <p
          className={`truncate font-semibold tracking-tight transition-all duration-300 ${
            filled ? "text-[26px] text-brand" : "text-[22px] text-subtle-foreground"
          }`}
          style={filled ? { textShadow: "0 0 26px hsl(var(--brand) / 0.55)" } : undefined}
        >
          {filled ? value : "—"}
        </p>
      </div>
      <span
        aria-hidden
        className={`absolute bottom-5 h-[3px] rounded-full transition-all duration-500 ${
          filled ? "w-24 bg-brand" : "w-10 bg-border"
        }`}
        style={filled ? { boxShadow: "0 0 14px hsl(var(--brand) / 0.8)" } : undefined}
      />
    </div>
  );
}

/** Step 2 — the app itself, as a device you could pick up. */
export function AppObject() {
  const reduceMotion = useReducedMotion();
  return (
    <div className={`${FACE} h-[230px] w-[290px] overflow-hidden`}>
      <div className="absolute inset-x-0 top-0 flex h-9 items-center gap-1.5 border-b border-[rgb(var(--edge))] px-3">
        <i className="h-2 w-2 rounded-full bg-status-error/70" />
        <i className="h-2 w-2 rounded-full bg-status-pending/70" />
        <i className="h-2 w-2 rounded-full bg-status-synced/70" />
        <span className="tf-label ml-1 text-[8px]">Tunesfork Sync</span>
      </div>
      <div style={{ transform: "translateZ(45px)" }} className="mt-6 grid place-items-center gap-3">
        <img src="/logo.png" alt="" className="tf-mark h-14 w-auto" />
        <div className="flex items-center gap-2">
          <i className="tf-lamp" data-state="synced" />
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Watching
          </span>
        </div>
      </div>
      {/* The level meter from the real tray app, same stagger. */}
      <div className="absolute inset-x-6 bottom-5 flex h-8 items-end gap-[3px]">
        {Array.from({ length: 22 }).map((_, i) => (
          <motion.span
            key={i}
            className="flex-1 rounded-sm bg-brand/70"
            initial={{ height: "18%" }}
            animate={reduceMotion ? { height: "38%" } : { height: ["18%", `${35 + (i % 4) * 16}%`, "18%"] }}
            transition={{ duration: 1.6 + (i % 3) * 0.25, repeat: Infinity, ease: "easeInOut", delay: i * 0.04 }}
          />
        ))}
      </div>
    </div>
  );
}

/** Step 3 — two halves of one link, finding each other. */
export function PairObject({ paired }: { paired: boolean }) {
  const reduceMotion = useReducedMotion();
  const glow = paired ? "hsl(var(--status-synced))" : "hsl(var(--status-syncing))";
  return (
    <div className="relative flex items-center gap-5" style={{ transform: "translateZ(30px)" }}>
      <div className={`${FACE} h-[120px] w-[120px]`}>
        <Radio className="h-9 w-9" style={{ color: glow }} />
      </div>

      <div className="relative flex w-20 items-center justify-center">
        {Array.from({ length: 3 }).map((_, i) => (
          <motion.span
            key={i}
            className="absolute h-1.5 w-1.5 rounded-full"
            style={{ background: glow, boxShadow: `0 0 10px ${glow}` }}
            initial={{ x: -34, opacity: 0 }}
            animate={reduceMotion ? { x: 0, opacity: 1 } : { x: [-34, 34], opacity: [0, 1, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.5, ease: "easeInOut" }}
          />
        ))}
        <span className="h-px w-full" style={{ background: `linear-gradient(90deg,transparent,${glow},transparent)`, opacity: 0.4 }} />
      </div>

      <div className={`${FACE} h-[120px] w-[120px]`}>
        <img src="/logo.png" alt="" className="tf-mark h-9 w-auto" />
      </div>
    </div>
  );
}

/** Step 4 — a project, as a cartridge you slot in. */
export function ProjectObject({ name }: { name?: string }) {
  return (
    <div className={`${FACE} h-[210px] w-[280px] overflow-hidden`}>
      <div
        className="absolute inset-x-0 top-0 h-[96px]"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, hsl(0 0% 100% / 0.10), transparent 62%), linear-gradient(140deg, hsl(205 48% 34%), hsl(266 52% 19%))",
        }}
      />
      <div style={{ transform: "translateZ(42px)" }} className="absolute inset-x-0 bottom-0 p-5">
        <div className="mb-2 flex items-center gap-2">
          <Music4 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="tf-label text-[8px]">Ableton project</span>
        </div>
        <p className="truncate text-[17px] font-semibold">{name || "Your first project"}</p>
        <div className="mt-2 flex items-center gap-2">
          <i className="tf-lamp" data-state={name ? "synced" : "idle"} />
          <span className="font-mono text-[10px] text-muted-foreground">
            {name ? "Version 1 saved" : "Waiting for a save"}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Step 5 — the project, leaving. */
export function ShareObject() {
  const reduceMotion = useReducedMotion();
  return (
    <div className="relative" style={{ transform: "translateZ(30px)" }}>
      <div className={`${FACE} h-[170px] w-[250px]`}>
        <Link2 className="h-9 w-9 text-brand" />
      </div>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          aria-hidden
          className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand/45"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={reduceMotion ? { scale: 1.6, opacity: 0.2 } : { scale: [0.6, 2.4], opacity: [0.55, 0] }}
          transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.85, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

/** Step 6 — the whole library, held at once. */
export function LibraryObject({ count }: { count: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="relative h-[210px] w-[300px]" style={{ transform: "translateZ(24px)" }}>
      {[2, 1, 0].map((depth) => (
        <motion.div
          key={depth}
          className={`${FACE} absolute inset-x-0 h-[150px]`}
          style={{ top: depth * 16, scale: 1 - depth * 0.06, zIndex: 3 - depth, opacity: 1 - depth * 0.22 }}
          animate={reduceMotion ? undefined : { y: [0, -4, 0] }}
          transition={{ duration: 7 + depth, repeat: Infinity, ease: "easeInOut", delay: depth * 0.6 }}
        >
          {depth === 0 && (
            <div className="grid place-items-center gap-2">
              <Folder className="h-8 w-8 text-brand" />
              <p className="font-mono text-[11px] text-muted-foreground">
                {count} project{count === 1 ? "" : "s"} watched
              </p>
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}
