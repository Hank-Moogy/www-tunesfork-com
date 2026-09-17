import { motion, useReducedMotion } from "motion/react";
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
 * as the object rising rather than the page scrolling. It stops entirely under
 * prefers-reduced-motion.
 */
export default function SyncDevice({
  float = false,
  className,
}: {
  float?: boolean;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const drift = float && !reduceMotion;

  return (
    <motion.div
      className={className}
      style={{ position: "relative" }}
      animate={drift ? { y: [0, -14, 0] } : undefined}
      transition={drift ? { duration: 11, repeat: Infinity, ease: "easeInOut" } : undefined}
    >
      {/* The ground shadow contracts as the device rises, which is what makes
          the drift read as height instead of as a scrolling page. */}
      <motion.span
        aria-hidden
        className="gcd-float-shadow"
        animate={drift ? { opacity: [0.36, 0.18, 0.36], scaleX: [1, 0.86, 1] } : undefined}
        transition={drift ? { duration: 11, repeat: Infinity, ease: "easeInOut" } : undefined}
      />

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
  );
}
