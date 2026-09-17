import { useEffect, useRef } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import "./SyncDevice.css";

const syncLog = [
  { time: "17:04", tone: "busy", text: "Opening Breakbeat 909 in Ableton…" },
  { time: "17:04", tone: "ok", text: "Opened local project Breakbeat 909" },
  { time: "17:05", tone: "busy", text: "Save detected · packing version 018" },
];

/**
 * The Sync desktop app, drawn rather than screenshotted.
 *
 * Recreated from electron/src/tray-ui/, which is the shipping app and the
 * source of truth for how the product looks. Drawing it means it stays crisp
 * at any size and can be lit and moved like an object; a screenshot could do
 * neither.
 *
 * `float` gives it the ambient drift the rest of the product uses: a slow
 * cycle measured in seconds rather than milliseconds, low-contrast and safe to
 * ignore, paired with a shadow that breathes against it so the movement reads
 * as the object rising rather than the page scrolling.
 *
 * `track` adds a slight lean toward the pointer, on a spring so the object has
 * mass rather than snapping to the cursor like a sticker. It follows the
 * pointer anywhere on the page, not just over the device, because the device
 * is the page's subject and should feel present while you read the copy beside
 * it.
 *
 * The float and the lean live on separate elements on purpose. Both are
 * transforms, and motion writes the whole transform property per element — put
 * them together and whichever renders last silently wins.
 *
 * Both stop entirely under prefers-reduced-motion.
 */
export default function SyncDevice({
  float = false,
  track = false,
  className,
}: {
  float?: boolean;
  track?: boolean;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const drift = float && !reduceMotion;
  const lean = track && !reduceMotion;

  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  // Loose spring, heavy-ish: answers immediately, settles slowly.
  const sx = useSpring(px, { stiffness: 70, damping: 20, mass: 0.9 });
  const sy = useSpring(py, { stiffness: 70, damping: 20, mass: 0.9 });

  const rotateY = useTransform(sx, [-1, 1], [9, -9]);
  const rotateX = useTransform(sy, [-1, 1], [-7, 7]);
  const shiftX = useTransform(sx, [-1, 1], [10, -10]);

  useEffect(() => {
    if (!lean) return;
    const onMove = (e: PointerEvent) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      // Normalised against how far the pointer can actually travel from the
      // device on each axis, rather than against the viewport's longest side.
      // The device sits off-centre — beside the copy, not behind it — so one
      // shared radius saturated well before the pointer reached the far edge,
      // and the object sat pinned at full lean across the headline instead of
      // answering the cursor where the reader's eye actually is.
      const radiusX = Math.max(cx, window.innerWidth - cx, 1);
      const radiusY = Math.max(cy, window.innerHeight - cy, 1);
      px.set(Math.max(-1, Math.min(1, (e.clientX - cx) / radiusX)));
      py.set(Math.max(-1, Math.min(1, (e.clientY - cy) / radiusY)));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [lean, px, py]);

  return (
    <div ref={ref} className={className} style={{ position: "relative", perspective: 1400 }}>
      {/* The ground shadow contracts as the device rises, which is what makes
          the drift read as height instead of as a scrolling page. */}
      <motion.span
        aria-hidden
        className="gcd-float-shadow"
        animate={drift ? { opacity: [0.36, 0.18, 0.36], scaleX: [1, 0.86, 1] } : undefined}
        transition={drift ? { duration: 11, repeat: Infinity, ease: "easeInOut" } : undefined}
      />

      <motion.div
        style={lean ? { rotateX, rotateY, x: shiftX, transformStyle: "preserve-3d" } : undefined}
      >
      <motion.div
        animate={drift ? { y: [0, -14, 0] } : undefined}
        transition={drift ? { duration: 11, repeat: Infinity, ease: "easeInOut" } : undefined}
      >
      <div className="gcd" aria-label="Tunesfork Sync desktop app">
        <i className="gcd-screw gcd-screw-tr" /><i className="gcd-screw gcd-screw-bl" /><i className="gcd-screw gcd-screw-br" />

        <header className="gcd-head">
          <span className="gcd-traffic" aria-hidden="true"><i /><i /><i /></span>
          <div className="gcd-brand">
            <span className="gcd-badge"><img src="/logo.png" alt="" /></span>
            <span className="gcd-id">
              <small>CLOUD VERSION RECORDER</small>
              <strong>TUNESFORK <b>SYNC—01</b></strong>
            </span>
          </div>
          <span className="gcd-link"><i className="gcd-led is-green" />LINKED</span>
        </header>

        <div className="gcd-bezel">
          <div className="gcd-glass">
            <div className="gcd-scan" aria-hidden="true" />
            <div className="gcd-topline"><span>MacIntel</span><span>17:05</span></div>
            <div className="gcd-center">
              <span className="gcd-kicker">SYNC ENGINE ACTIVE</span>
              <strong>WAITING FOR SAVES</strong>
              <span className="gcd-detail">5 FOLDERS ARMED · 15 PROJECTS LINKED</span>
            </div>
            <div className="gcd-meter" aria-hidden="true">
              {Array.from({ length: 16 }).map((_, index) => (
                <span key={index} className={index < 12 ? "is-active" : ""} />
              ))}
            </div>
            <div className="gcd-watch"><i className="gcd-led is-green" /><span>Watching 5 folder(s)…</span></div>
          </div>
        </div>

        <div className="gcd-telemetry">
          <div><span>FOLDERS</span><strong>05</strong></div>
          <div><span>PROJECTS</span><strong>15</strong></div>
          <div><span>LAST SAVE</span><strong>8S AGO</strong></div>
        </div>

        <div className="gcd-deck">
          <div className="gcd-switch"><span className="gcd-cap" /><span className="gcd-switch-label">PAUSE</span></div>
          <div className="gcd-bank">
            <span className="gcd-btn">ADD FOLDER</span>
            <span className="gcd-btn">IMPORT NEW</span>
            <span className="gcd-btn is-wide">FOLDERS</span>
          </div>
        </div>

        <div className="gcd-diag">
          <div className="gcd-diag-head"><span>DIAGNOSTICS / EVENT LOG</span><span className="gcd-min">MINIMIZE −</span></div>
          <div className="gcd-diag-body">
            {syncLog.map((line) => (
              <p key={line.text} className={`is-${line.tone}`}><i>{line.time}</i>{line.text}</p>
            ))}
          </div>
        </div>

        <footer className="gcd-foot"><span>PRECISION SYNC SYSTEMS</span><span>TUNESFORK.COM ↗</span><span>REV. A12</span></footer>
      </div>
      </motion.div>
      </motion.div>
    </div>
  );
}
