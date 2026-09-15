import type { CSSProperties } from "react";
import { MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { usePageView } from "@/hooks/usePageView";
import { trackButtonClick } from "@/lib/analytics";
import GcSignalField from "@/components/GcSignalField";
import "./LandingPage.css";
import "./LandingPageGalaxyClassic.css";

// Mirrors the Galaxy landing cursor: a hairline dot that swells over interactive targets.
function useCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cursor = cursorRef.current;
    if (!cursor || !window.matchMedia("(pointer: fine)").matches) return;
    const move = (event: PointerEvent) => {
      cursor.style.setProperty("--cursor-x", `${event.clientX}px`);
      cursor.style.setProperty("--cursor-y", `${event.clientY}px`);
      cursor.dataset.visible = "true";
    };
    const leave = () => { cursor.dataset.visible = "false"; };
    const over = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      cursor.dataset.action = target?.closest("a, button") ? "true" : "false";
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    document.addEventListener("pointerover", over, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      document.removeEventListener("pointerover", over);
    };
  }, []);

  return cursorRef;
}

// The app download now lives later in the onboarding flow, so the landing
// page's job is to get people signed up.
const SIGN_UP_TO = "/auth?tab=signup";

// Without WebGL the page falls back to a static field rather than a blank
// ground, so the hero still reads on machines that cannot run the shader.
function GalaxyClassicField() {
  const [unavailable, setUnavailable] = useState(false);
  const handleUnavailable = useCallback(() => setUnavailable(true), []);

  if (unavailable) return <div className="gc-static-field" aria-hidden="true" />;
  return <GcSignalField onUnavailable={handleUnavailable} />;
}

function StartFreeLink({ location, className = "" }: { location: string; className?: string }) {
  const magnetic = (event: MouseEvent<HTMLAnchorElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--magnetic-x", `${(event.clientX - rect.left - rect.width / 2) * 0.08}px`);
    event.currentTarget.style.setProperty("--magnetic-y", `${(event.clientY - rect.top - rect.height / 2) * 0.14}px`);
  };

  const resetMagnet = (event: MouseEvent<HTMLAnchorElement>) => {
    event.currentTarget.style.setProperty("--magnetic-x", "0px");
    event.currentTarget.style.setProperty("--magnetic-y", "0px");
  };

  return (
    <Link
      className={`tf-download ${className}`}
      to={SIGN_UP_TO}
      onMouseMove={magnetic}
      onMouseLeave={resetMagnet}
      onClick={() => trackButtonClick("landing_variant_start_free", location, { variant: "galaxy_classic" })}
      aria-label="Start free with Tunesfork"
    >
      <span>START FREE</span>
      <span aria-hidden="true">↗</span>
    </Link>
  );
}

// Recreation of the shipping tray app (electron/src/tray-ui): brushed shell,
// CRT readout, pulsing orange level meter, diagnostics log.
const syncLog = [
  { time: "17:04", tone: "busy", text: "Opening Breakbeat 909 in Ableton…" },
  { time: "17:04", tone: "ok", text: "Opened local project Breakbeat 909" },
  { time: "17:05", tone: "busy", text: "Save detected · packing version 018" },
  { time: "17:05", tone: "ok", text: "Uploaded version 018 · cloud copy verified" },
];

function SyncDevice() {
  return (
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
          {syncLog.slice(0, 3).map((line) => (
            <p key={line.text} className={`is-${line.tone}`}><i>{line.time}</i>{line.text}</p>
          ))}
        </div>
      </div>

      <footer className="gcd-foot"><span>PRECISION SYNC SYSTEMS</span><span>TUNESFORK.COM ↗</span><span>REV. A12</span></footer>
    </div>
  );
}

const abletonTracks = [
  { name: "Drum Rack", tone: "amber", left: 4, width: 62 },
  { name: "909 Break", tone: "peach", left: 12, width: 48 },
  { name: "Sub Bass", tone: "green", left: 4, width: 71 },
  { name: "Grain Pad", tone: "blue", left: 26, width: 44 },
  { name: "Vocal Cut", tone: "violet", left: 38, width: 33 },
  { name: "Reverb Bus", tone: "grey", left: 18, width: 55 },
];

// Drop a real session screenshot at public/ableton-session.png and it is used
// automatically; the drawn arrangement below stands in until then.
const ABLETON_SHOT = "/ableton-session.png";

function AbletonArrangement() {
  return (
    <>
      <div className="gcab-transport">
        <span className="gcab-tempo">120.00</span><span>4 / 4</span>
        <span className="gcab-play" aria-hidden="true">▶</span>
        <span className="gcab-pos">33 · 1 · 1</span>
        <span className="gcab-view">Arrangement</span>
      </div>
      <div className="gcab-body">
        <aside className="gcab-browser">
          <b>Places</b>
          <span className="is-open">Breakbeat 909</span>
          <span>Samples</span><span>Audio Effects</span><span>Instruments</span><span>Plug-Ins</span>
        </aside>
        <div className="gcab-arrange">
          <header>{["1", "9", "17", "25", "33", "41", "49"].map((bar) => <span key={bar}>{bar}</span>)}</header>
          <div className="gcab-tracks">
            {abletonTracks.map((track) => (
              <div className="gcab-track" key={track.name}>
                <strong>{track.name}</strong>
                <div className="gcab-lane">
                  <div className={`gcab-clip is-${track.tone}`} style={{ marginLeft: `${track.left}%`, width: `${track.width}%` }}>
                    <span>{track.name}</span>
                    <div className="gcab-audio" aria-hidden="true">
                      {Array.from({ length: 30 }).map((_, index) => (
                        <i key={index} style={{ height: `${20 + ((index * 37) % 66)}%` }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="gcab-playhead" aria-hidden="true" />
        </div>
      </div>
    </>
  );
}

// The Ableton Live session Tunesfork is watching.
function AbletonProject() {
  const [hasShot, setHasShot] = useState(true);

  return (
    <div className="gcab" aria-label="Breakbeat 909 open in Ableton Live">
      <div className="gcab-bar">
        <span className="gcab-traffic" aria-hidden="true"><i /><i /><i /></span>
        <strong>Breakbeat 909.als</strong>
        <span className="gcab-app">Ableton Live 12 Suite</span>
      </div>
      {hasShot ? (
        <img
          className="gcab-shot"
          src={ABLETON_SHOT}
          alt="Breakbeat 909 open in Ableton Live"
          loading="lazy"
          decoding="async"
          onError={() => setHasShot(false)}
        />
      ) : (
        <AbletonArrangement />
      )}
      <div className="gcab-status">
        <span>Breakbeat 909.als</span>
        <span className="gcab-captured"><i />Saved just now</span>
      </div>
    </div>
  );
}

function AutoSaveScene() {
  return (
    <div className="gc-save-scene">
      <AbletonProject />
      <MacNotification
        className="gc-save-alert"
        from="system"
        title="Breakbeat 909 saved to the cloud"
        body="Version 018 · 128.4 MB · restore anytime"
        time="now"
      />
    </div>
  );
}

const projectComments = [
  { from: "maya", who: "Maya", time: "01:24", at: 31, text: "Bring the drums in here?" },
  { from: "jonas", who: "Jonas", time: "01:52", at: 54, text: "Pad is lovely — maybe 2 dB down?" },
  { from: "ana", who: "Ana", time: "02:10", at: 73, text: "Vocal sits perfectly now." },
];

function CollaboratePanel() {
  return (
    <div className="gc-panel">
      <header className="gc-panel-head">
        <div><small>SHARED PROJECT</small><strong>Breakbeat 909</strong></div>
        <span className="gc-ghost-button">COPY PROJECT LINK</span>
      </header>
      <div className="gc-collab">
        <div className="gc-rows">
          {[
            ["VERSION 019", "MAYA · JUST NOW"],
            ["VERSION 018", "YOU · 2 HOURS AGO"],
            ["VERSION 017", "YOU · YESTERDAY"],
          ].map(([version, author], index) => (
            <div key={version} className={index === 0 ? "gc-row is-current" : "gc-row"}>
              <span>{version}</span>
              <small>{author}</small>
            </div>
          ))}
        </div>
        <div className="gc-collab-main">
          <div className="gc-wave" aria-hidden="true">
            {Array.from({ length: 44 }).map((_, index) => (
              <i key={index} style={{ height: `${16 + ((index * 17) % 74)}%` }} />
            ))}
            {projectComments.map((comment, index) => (
              <b
                key={comment.from}
                className="gc-wave-pin gc-avatar"
                data-person={comment.who}
                style={{ left: `${comment.at}%`, "--step": index } as CSSProperties}
              >
                {comment.who.charAt(0)}
              </b>
            ))}
          </div>

          <div className="gc-thread">
            {projectComments.map((comment, index) => (
              <article className="gc-comment" key={comment.from} style={{ "--step": index } as CSSProperties}>
                <b className="gc-avatar" data-person={comment.who} aria-hidden="true">{comment.who.charAt(0)}</b>
                <div>
                  <small>{comment.who.toUpperCase()} · {comment.time}</small>
                  <p>{comment.text}</p>
                </div>
              </article>
            ))}
            <article className="gc-comment is-flat" style={{ "--step": projectComments.length } as CSSProperties}>
              <div><small>NEW CONTRIBUTION</small><p>Maya uploaded Version 019</p></div>
              <span className="gc-ghost-button">REVIEW</span>
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}

const agentChat = [
  { from: "user", text: "Make a new version and bring the drums down 2 dB after bar 33." },
  {
    from: "agent",
    text: "I’ll create Version 020 and update the drum group automation.",
    checks: ["VERSION 020 CREATED", "DRUM GROUP ADJUSTED FROM BAR 33"],
  },
  { from: "user", text: "Mute the vocal cut in the intro too." },
  { from: "agent", text: "Done — vocal cut is muted from bar 1 to 16.", checks: ["VOCAL CUT MUTED · BARS 1–16"] },
  { from: "user", text: "Share the new version with Maya." },
] as const;

function AgentPanel() {
  return (
    <div className="gc-panel gc-agent">
      <header className="gc-panel-head">
        <div><small>CONNECTED TO BREAKBEAT 909</small><strong>Tunesfork Agent</strong></div>
        <span className="gc-soon-tag">COMING SOON</span>
      </header>
      <div className="gc-chat">
        {agentChat.map((message, index) => (
          <div key={message.text} className={`gc-bubble is-${message.from}`} style={{ "--step": index } as CSSProperties}>
            <p>{message.text}</p>
            {"checks" in message && message.checks && (
              <ul>
                {message.checks.map((check) => <li key={check}><i aria-hidden="true">✓</i>{check}</li>)}
              </ul>
            )}
          </div>
        ))}
        <div className="gc-typing" style={{ "--step": agentChat.length } as CSSProperties} aria-label="Tunesfork Agent is replying">
          <i /><i /><i />
        </div>
      </div>
      <footer className="gc-panel-foot is-input">
        <div><small>Ask Tunesfork to work on your project…</small></div>
        <span aria-hidden="true">✦</span>
      </footer>
    </div>
  );
}

const chapters = [
  {
    id: "auto-save",
    title: <>AUTO<br />SAVE.</>,
    copy: "Automatic backup of your Ableton sessions.",
    detail: "Keep producing in Ableton Live. Tunesfork quietly captures every save as a cloud version, ready whenever you need it.",
    meta: "AUTO BACKUP / CONTINUOUS VERSIONING",
    align: "left",
    visual: <AutoSaveScene />,
  },
  {
    id: "collaborate",
    title: <>COLLABORATE.</>,
    copy: "Share your project, comment on versions, and approve other contributions to your projects.",
    detail: "One project link keeps files, feedback, versions, and collaborators in the same place.",
    meta: "ONE PROJECT / MANY HANDS",
    align: "right",
    visual: <CollaboratePanel />,
  },
  {
    id: "agent",
    badge: "COMING SOON",
    title: <>CHAT WITH<br />ABLETON.</>,
    copy: "Your AI agent that can perform actions in your projects.",
    detail: "Ask for project changes in plain language and let Tunesfork handle the repetitive work inside your session.",
    meta: "AGENT / IN DEVELOPMENT",
    align: "left",
    visual: <AgentPanel />,
  },
] as const;

const alerts = [
  { key: "upload", from: "system", title: "Breakbeat 909 uploaded", body: "Version 018 is safe in the cloud", time: "now" },
  { key: "share", from: "Maya", title: "Link sent to Maya", body: "Maya now has access to the project", time: "now" },
  { key: "comment", from: "Maya", title: "Maya commented at 01:24", body: "“Bring the drums in here?”", time: "1m ago" },
  { key: "version", from: "Maya", title: "Maya uploaded Version 019", body: "Ready for your review", time: "2m ago" },
];

function AlertIcon({ from }: { from: string }) {
  if (from === "system") {
    return <span className="gc-alert-icon is-app"><img src="/logo.png" alt="" /></span>;
  }
  return <span className="gc-alert-icon is-person" aria-hidden="true">{from.charAt(0)}</span>;
}

function MacNotification({ from, title, body, time, className = "" }: {
  from: string; title: string; body: string; time: string; className?: string;
}) {
  return (
    <div className={`gc-alert ${className}`}>
      <AlertIcon from={from} />
      <div className="gc-alert-body">
        <div><strong>{title}</strong><small>{time}</small></div>
        <p>{body}</p>
      </div>
    </div>
  );
}

export default function LandingPageGalaxyClassic() {
  usePageView("landing_galaxy_classic");
  const cursorRef = useCursor();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setLoaded(true), 80);
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.target.classList.toggle("is-visible", entry.isIntersecting)),
      { threshold: 0.24 },
    );
    document.querySelectorAll<HTMLElement>(".tf-chapter").forEach((section) => observer.observe(section));
    return () => {
      window.clearTimeout(id);
      observer.disconnect();
    };
  }, []);

  return (
    <div className={`tf-landing gc-root ${loaded ? "is-loaded" : ""}`}>
      <GalaxyClassicField />
      <div className="tf-grain" aria-hidden="true" />
      <div className="tf-cursor" ref={cursorRef} aria-hidden="true" />

      <nav className="tf-nav" aria-label="Primary navigation">
        <Link to="/welcome" className="tf-wordmark gc-wordmark" aria-label="Tunesfork home">
            <img className="gc-mark" src="/logo.png" alt="" />
            <span className="gc-wordmark-text">TUNESFORK<span>®</span></span>
          </Link>
        <div>
          <Link to="/auth">SIGN IN</Link>
          <StartFreeLink location="galaxy_classic_nav" className="tf-nav-download" />
        </div>
      </nav>

      <main>
        <section className="tf-hero gc-hero" data-field-stop aria-labelledby="gc-hero-title">
          <div className="tf-hero-code">TF—01 / CLOUD VERSION RECORDER</div>

          <div className="gc-hero-inner">
            <div className="tf-hero-copy gc-hero-copy">
              <h1 id="gc-hero-title"><span>CLOUD</span><span>COLLABORATION</span><span>FOR ABLETON</span><span>LIVE.</span></h1>
              <p className="gc-lede">Save, share and collaborate on your projects.</p>
              <div className="gc-actions">
                <StartFreeLink location="galaxy_classic_hero" className="gc-download-hero" />
                <a className="gc-secondary" href="#auto-save"><span>SEE HOW IT WORKS</span><i aria-hidden="true">↓</i></a>
              </div>
              <small className="gc-availability">FREE PLAN · UNLIMITED PROJECTS AND VERSIONS</small>
            </div>

            <div className="gc-stage" aria-label="Tunesfork Sync automatically uploading and sharing an Ableton project">
              <SyncDevice />
              {alerts.map((alert) => (
                <div key={alert.key} className={`gc-alert gc-alert-${alert.key}`}>
                  <AlertIcon from={alert.from} />
                  <div className="gc-alert-body">
                    <div><strong>{alert.title}</strong><small>{alert.time}</small></div>
                    <p>{alert.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <a className="tf-scroll-cue" href="#auto-save"><span>SCROLL TO ENTER</span><i /></a>
          <div className="tf-coordinate">48°51′N<br />002°21′E</div>
        </section>

        <div className="tf-chapters">
          {chapters.map((chapter) => (
            <section key={chapter.id} id={chapter.id} data-field-stop className={`tf-chapter is-${chapter.align}`} aria-labelledby={`${chapter.id}-title`}>
              <div className="tf-chapter-copy">
                {"badge" in chapter && chapter.badge && <p className="gc-soon">{chapter.badge}</p>}
                <h2 id={`${chapter.id}-title`}>{chapter.title}</h2>
                <p>{chapter.copy}</p>
                <p className="gc-detail">{chapter.detail}</p>
                <small>{chapter.meta}</small>
              </div>
              <div className="tf-chapter-visual">{chapter.visual}</div>
            </section>
          ))}
        </div>

        <section className="tf-final gc-final" data-field-stop aria-labelledby="gc-final-title">
          <h2 id="gc-final-title"><span>MUSIC BUT</span><span>MULTIPLAYER.</span></h2>
          <div>
            <p className="gc-verbs">Record, save, share and <span>fork</span>.</p>
            <StartFreeLink location="galaxy_classic_final" className="tf-download-large" />
            <small>FREE PLAN · UNLIMITED PROJECTS AND VERSIONS</small>
          </div>
          <footer>
            <span>© {new Date().getFullYear()} TUNESFORK</span>
            <span>MADE FOR PRODUCERS WHO KEEP GOING</span>
            <Link to="/auth">SIGN IN</Link>
          </footer>
        </section>
      </main>
    </div>
  );
}
