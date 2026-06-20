import { useEffect, useRef, useState } from "react";
import tunesforkLogo from "../../build/icon.png";

// Bridge exposed by preload.cjs
declare global {
  interface Window {
    tfsync: {
      openExternal: (url: string) => Promise<void>;
      pickFolder: () => Promise<string | null>;
      pickFolders: () => Promise<string[]>;
      // Wired in step 2 below — see preload.cjs additions
      pairInit: (deviceName: string) => Promise<{ code: string; pair_url: string }>;
      cancelPairing: () => Promise<void>;
      getState: () => Promise<AppState>;
      setFolders: (folders: string[]) => Promise<void>;
      repairFolderAccess: (folder: string) => Promise<{ ok: boolean; cancelled?: boolean; message?: string; folder?: string }>;
      openFolderPrivacySettings: () => Promise<boolean>;
      importWatchedFolders: () => Promise<ImportSummary>;
      startSync: () => Promise<void>;
      stopSync: () => Promise<void>;
      signOut: () => Promise<void>;
      onLog: (cb: (line: LogLine) => void) => void;
    };
  }
}

type LogLine = { ts: number; level: "info" | "ok" | "err" | "busy" | "warn"; msg: string; key?: string | null };
type ImportSummary = { found: number; uploaded: number; skipped: number; failed: { folder: string; error: string }[] };
type AppState = {
  paired: boolean;
  deviceName: string | null;
  folders: string[];
  syncing: boolean;
  importing: boolean;
  importedProjectCount: number;
  recent: { name: string; version: number; at: number }[];
  folderAccessIssues: { folder: string; code: string; message: string }[];
};

const TUNESFORK_URL = "https://tunesfork.com";

function createDevBridge(): Window["tfsync"] {
  const preview = new URLSearchParams(window.location.search).get("preview") || "uploaded";
  const baseState: AppState = {
    paired: preview !== "unpaired",
    deviceName: "Preview",
    folders: preview === "empty" || preview === "unpaired" ? [] : ["/Users/demo/Music/Ableton Projects"],
    syncing: !["paused", "empty", "unpaired", "permission"].includes(preview),
    importing: preview === "importing",
    importedProjectCount: preview === "empty" || preview === "unpaired" ? 0 : 3,
    folderAccessIssues: preview === "permission"
      ? [{ folder: "/Users/demo/Documents/Ableton", code: "EPERM", message: "Folder access blocked" }]
      : [],
    recent: preview === "uploaded"
      ? [{ name: "Midnight Sketch", version: 4, at: Date.now() - 45_000 }]
      : [],
  };
  const previewLogs: Record<string, LogLine[]> = {
    uploading: [
      { ts: Date.now() - 3000, level: "info", msg: "Save detected: Midnight Sketch.als" },
      { ts: Date.now() - 1500, level: "busy", msg: "Uploading archive 60%" },
      { ts: Date.now(), level: "busy", msg: "Uploading project snapshot" },
    ],
    error: [
      { ts: Date.now() - 1000, level: "err", msg: "Upload failed: network unavailable" },
    ],
  };
  return {
    openExternal: async () => {},
    pickFolder: async () => null,
    pickFolders: async () => ["/Users/demo/Music/Ableton Projects"],
    pairInit: async () => ({ code: "TF2026", pair_url: TUNESFORK_URL }),
    cancelPairing: async () => {},
    getState: async () => ({
      ...baseState,
      folders: [...baseState.folders],
      recent: [...baseState.recent],
      folderAccessIssues: [...baseState.folderAccessIssues],
    }),
    setFolders: async (folders) => { baseState.folders = folders; },
    repairFolderAccess: async (folder) => ({ ok: true, folder }),
    openFolderPrivacySettings: async () => true,
    importWatchedFolders: async () => ({ found: 3, uploaded: 0, skipped: 3, failed: [] }),
    startSync: async () => { baseState.syncing = true; },
    stopSync: async () => { baseState.syncing = false; },
    signOut: async () => {},
    onLog: (callback) => {
      for (const [index, line] of (previewLogs[preview] ?? []).entries()) {
        window.setTimeout(() => callback(line), index * 30);
      }
    },
  };
}

let devBridge: Window["tfsync"] | null = null;

function getBridge(): Window["tfsync"] {
  if (window.tfsync) return window.tfsync;
  if (import.meta.env.DEV) {
    devBridge = devBridge ?? createDevBridge();
    return devBridge;
  }
  throw new Error("Tunesfork Sync bridge is unavailable.");
}

export default function App() {
  const tfsync = getBridge();
  const [state, setState] = useState<AppState>({
    paired: false, deviceName: null, folders: [], syncing: false, importing: false, importedProjectCount: 0, recent: [], folderAccessIssues: [],
  });
  const [stateLoaded, setStateLoaded] = useState(false);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pairUrl, setPairUrl] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);
  const pairRefreshInterval = useRef<number | null>(null);
  const readyTimer = useRef<number | null>(null);
  const [showReady, setShowReady] = useState(false);
  const [importing, setImporting] = useState(false);
  const [lastImport, setLastImport] = useState<ImportSummary | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [patchBayOpen, setPatchBayOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  useEffect(() => {
    tfsync.getState().then((next) => {
      setState(next);
      setStateLoaded(true);
    });
    tfsync.onLog((line) => setLog((l) => {
      if (line.key?.startsWith("folder-access:")) {
        tfsync.getState().then(setState);
      }
      if (!line.key) return [...l.slice(-99), line];
      const existingIndex = l.findIndex((item) => item.key === line.key);
      if (existingIndex === -1) return [...l.slice(-99), line];
      const next = [...l];
      next[existingIndex] = line;
      return next;
    }));
    const refreshInterval = window.setInterval(() => {
      tfsync.getState().then(setState);
    }, 5000);
    return () => {
      window.clearInterval(refreshInterval);
      if (readyTimer.current !== null) window.clearTimeout(readyTimer.current);
    };
  }, [tfsync]);

  const refreshState = () => tfsync.getState().then(setState);

  const stopPairRefresh = () => {
    if (pairRefreshInterval.current !== null) {
      window.clearInterval(pairRefreshInterval.current);
      pairRefreshInterval.current = null;
    }
  };

  const startPair = async () => {
    stopPairRefresh();
    setPairing(true);
    try {
      const { code, pair_url } = await tfsync.pairInit(deviceName());
      setPairCode(code);
      setPairUrl(pair_url);
      await tfsync.openExternal(pair_url);
      // Polling happens in main process; we just refresh state every 2s until paired
      pairRefreshInterval.current = window.setInterval(async () => {
        const s = await tfsync.getState();
        if (s.paired) {
          stopPairRefresh();
          setPairCode(null);
          setPairUrl(null);
          setPairing(false);
          setState(s);
        }
      }, 2000);
    } catch (e) {
      setPairing(false);
      alert(`Pairing failed: ${(e as Error).message}`);
    }
  };

  const reopenPairUrl = async () => {
    if (pairUrl) await tfsync.openExternal(pairUrl);
  };

  const cancelPair = async () => {
    stopPairRefresh();
    await tfsync.cancelPairing();
    setPairCode(null);
    setPairUrl(null);
    setPairing(false);
    refreshState();
  };

  const restartPair = async () => {
    await cancelPair();
    await startPair();
  };

  const addFolder = async () => {
    const folders = await tfsync.pickFolders();
    if (!folders.length) return;
    const next = Array.from(new Set([...state.folders, ...folders]));
    try {
      await tfsync.setFolders(next);
    } catch (e) {
      alert(`Could not watch that folder: ${(e as Error).message}`);
    } finally {
      refreshState();
    }
  };

  const completeFolderSetup = async () => {
    const folders = await tfsync.pickFolders();
    if (!folders.length) return;
    try {
      await tfsync.setFolders(Array.from(new Set(folders)));
      await tfsync.startSync();
      setShowReady(true);
      readyTimer.current = window.setTimeout(() => {
        setShowReady(false);
        readyTimer.current = null;
      }, 1400);
    } catch (e) {
      alert(`Could not start watching that folder: ${(e as Error).message}`);
    } finally {
      refreshState();
    }
  };

  const removeFolder = async (f: string) => {
    try {
      await tfsync.setFolders(state.folders.filter((x) => x !== f));
    } catch (e) {
      alert(`Could not update watched folders: ${(e as Error).message}`);
    } finally {
      refreshState();
    }
  };

  const toggleSync = async () => {
    try {
      if (state.syncing) await tfsync.stopSync();
      else await tfsync.startSync();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      refreshState();
    }
  };

  const repairFolderAccess = async (folder: string) => {
    const result = await tfsync.repairFolderAccess(folder);
    if (!result.ok && !result.cancelled && result.message) alert(result.message);
    refreshState();
  };

  const importAndWatch = async () => {
    setImporting(true);
    setLastImport(null);
    try {
      const summary = await tfsync.importWatchedFolders();
      setLastImport(summary);
    } catch (e) {
      alert(`Import failed: ${(e as Error).message}`);
    } finally {
      setImporting(false);
      refreshState();
    }
  };

  const signOut = async () => {
    if (!confirm("Sign out and unlink this device?")) return;
    await tfsync.signOut();
    refreshState();
  };

  const latestLog = log[log.length - 1] ?? null;
  const recentUpload = state.recent[0] ?? null;
  const onboardingStep = !state.paired ? 1 : state.folders.length === 0 ? 2 : 3;
  const visibleOnboardingStep = showReady ? 3 : onboardingStep;
  const onboarding = stateLoaded && (onboardingStep < 3 || showReady);
  const status = !stateLoaded
    ? { kicker: "POWER ON", title: "INITIALIZING", detail: "CHECKING DEVICE STATE", footer: "Starting Tunesfork Sync", tone: "cyan", animated: true }
    : getDisplayStatus({
        state,
        pairing: pairing || !!pairCode,
        importing: importing || state.importing,
        latestLog,
        recentUpload,
      });
  const isMac = navigator.platform.toLowerCase().includes("mac");
  const fallbackLog: LogLine[] = [
    {
      ts: Date.now() - 2000,
      level: state.paired ? "ok" : "info",
      msg: state.paired ? `Link established${state.deviceName ? ` · ${state.deviceName}` : ""}` : "Device is not paired",
    },
    {
      ts: Date.now() - 1000,
      level: state.folderAccessIssues.length ? "err" : state.folders.length ? "ok" : "warn",
      msg: state.folderAccessIssues.length
        ? "Folder access needs attention"
        : state.folders.length
          ? `${state.folders.length} folder${state.folders.length === 1 ? "" : "s"} armed`
          : "No Ableton folder connected",
    },
    {
      ts: Date.now(),
      level: status.tone === "red" ? "err" : state.syncing ? "info" : "warn",
      msg: status.footer,
    },
  ];
  const visibleLog = log.length ? (diagnosticsOpen ? log : log.slice(-3)) : fallbackLog;

  return (
    <div className={`app ${isMac ? "mac" : ""}`}>
      <div className="gear-shell">
        <span className="screw screw-tl" />
        <span className="screw screw-tr" />
        <span className="screw screw-bl" />
        <span className="screw screw-br" />

        <header className="header">
          <div className="brand-cluster">
            <div className="maker-badge">
              <img src={tunesforkLogo} alt="Tunesfork" />
            </div>
            <div className="identity">
              <span className="eyebrow">Cloud version recorder</span>
              <span className="brand">TUNESFORK <b>SYNC—01</b></span>
            </div>
          </div>
          <div className="link-state">
            <span className={`pilot-light ${status.tone}`} />
            <span>{state.paired ? "LINKED" : "UNLINKED"}</span>
          </div>
        </header>

        <main className="device-face">
          <section className={`display-bezel ${status.tone}`}>
            <div className="display-glass">
              <div className="scanlines" />
              <div className="screen-topline">
                <span>{state.deviceName || "TUNESFORK UNIT"}</span>
                <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <div className="screen-center">
                <span className="screen-kicker">{status.kicker}</span>
                <strong>{status.title}</strong>
                <span className="screen-detail">{status.detail}</span>
                {pairCode && <span className="pair-code">{pairCode}</span>}
              </div>
              <div className="screen-meter" aria-hidden="true">
                {Array.from({ length: 18 }).map((_, index) => (
                  <span key={index} className={status.animated && index < 12 ? "active" : ""} />
                ))}
              </div>
              <div className="screen-footerline">
                <span className={`tiny-light ${status.tone}`} />
                <span>{latestLog?.msg || status.footer}</span>
              </div>
            </div>
          </section>

          {onboarding ? (
            <section className="setup-controls onboarding-panel">
              <div className="onboarding-progress" aria-label={`Setup step ${visibleOnboardingStep} of 3`}>
                <div className={visibleOnboardingStep > 1 ? "complete" : "active"}><span>1</span><b>ACCOUNT</b></div>
                <i />
                <div className={visibleOnboardingStep > 2 ? "complete" : visibleOnboardingStep === 2 ? "active" : ""}><span>2</span><b>FOLDER</b></div>
                <i />
                <div className={visibleOnboardingStep === 3 ? "active" : ""}><span>3</span><b>READY</b></div>
              </div>

              {!showReady && onboardingStep === 1 && (
                <div className="onboarding-copy">
                  <span className="panel-label">STEP 1 · CONNECT ACCOUNT</span>
                  <h2>Sign in or create your account</h2>
                  <p>We’ll open Tunesfork in your browser. Both options use the same secure flow.</p>
                  {!pairCode ? (
                    <button className="hardware-button primary wide" onClick={startPair} disabled={pairing}>
                      <span className="button-led" />
                      {pairing ? "OPENING BROWSER" : "CONTINUE IN BROWSER"}
                    </button>
                  ) : (
                    <>
                      <div className="onboarding-wait">
                        <span className="tiny-light amber" />
                        Waiting for browser sign-in · code {pairCode}
                      </div>
                      <div className="pair-grid">
                        <button className="hardware-button primary" onClick={reopenPairUrl} disabled={!pairUrl}>OPEN BROWSER</button>
                        <button className="hardware-button" onClick={restartPair}>NEW CODE</button>
                        <button className="hardware-button danger" onClick={cancelPair}>CANCEL</button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {!showReady && onboardingStep === 2 && (
                <div className="onboarding-copy">
                  <span className="panel-label">STEP 2 · CHOOSE FOLDER</span>
                  <h2>Where are your Ableton projects?</h2>
                  <p>Choose the parent folder that contains your Ableton Project folders. Tunesfork only watches what you select.</p>
                  <button className="hardware-button primary wide" onClick={completeFolderSetup}>
                    <span className="button-led" />
                    CHOOSE ABLETON FOLDER
                  </button>
                </div>
              )}

              {showReady && (
                <div className="onboarding-copy onboarding-ready">
                  <span className="panel-label">SETUP COMPLETE</span>
                  <h2>You’re ready to make music</h2>
                  <p>Tunesfork Sync is watching your folder. Your next Ableton save will become a cloud snapshot.</p>
                  <span className="ready-pulse"><i /> SYNC ENGINE ONLINE</span>
                </div>
              )}
            </section>
          ) : stateLoaded ? (
            <>
              <section className="telemetry-strip">
                <div>
                  <span>FOLDERS</span>
                  <strong>{String(state.folders.length).padStart(2, "0")}</strong>
                </div>
                <div>
                  <span>PROJECTS</span>
                  <strong>{String(state.importedProjectCount).padStart(2, "0")}</strong>
                </div>
                <div>
                  <span>LAST SAVE</span>
                  <strong>{recentUpload ? relTime(recentUpload.at).toUpperCase() : "—"}</strong>
                </div>
              </section>

            <section className="control-deck">
              <button
                className={`footswitch ${state.syncing ? "engaged" : ""}`}
                onClick={toggleSync}
                disabled={state.folders.length === 0}
                aria-label={state.syncing ? "Pause sync" : "Resume sync"}
              >
                <span className="footswitch-cap" />
                <span className="footswitch-label">{state.syncing ? "PAUSE" : "SYNC"}</span>
              </button>

              <div className="button-bank">
                <button className="hardware-button" onClick={addFolder}>ADD FOLDER</button>
                <button
                  className="hardware-button"
                  onClick={importAndWatch}
                  disabled={state.folders.length === 0 || importing || state.importing}
                >
                  {importing || state.importing ? "SCANNING" : state.importedProjectCount ? "IMPORT NEW" : "IMPORT"}
                </button>
                <button
                  className={`hardware-button ${patchBayOpen ? "selected" : ""}`}
                  onClick={() => setPatchBayOpen((open) => !open)}
                >
                  FOLDERS
                </button>
              </div>
            </section>
            </>
          ) : (
            <section className="setup-controls">
              <button className="hardware-button wide" disabled>STARTING SYNC ENGINE…</button>
            </section>
          )}

          {state.folderAccessIssues.length > 0 && (
            <section className="alert-panel">
              <div className="panel-label">INPUT FAULT · FOLDER ACCESS</div>
              {state.folderAccessIssues.map((issue) => (
                <div className="access-issue" key={issue.folder}>
                  <span className="path">{shortPath(issue.folder)}</span>
                  <div className="inline-actions">
                    <button className="mini-button" onClick={() => repairFolderAccess(issue.folder)}>RESELECT</button>
                    <button className="mini-button" onClick={() => tfsync.openFolderPrivacySettings()}>PRIVACY</button>
                  </div>
                </div>
              ))}
            </section>
          )}

          {state.paired && patchBayOpen && (
            <section className="drawer-panel">
              <div className="panel-label">FOLDER INPUTS · WATCHED ABLETON FOLDERS</div>
              {state.folders.length === 0 ? (
                <p className="panel-copy">Connect a folder containing your Ableton projects.</p>
              ) : (
                state.folders.map((folder) => (
                  <div className="folder-row" key={folder}>
                    <div>
                      <span className="jack-light" />
                      <span className="path" title={folder}>{shortPath(folder)}</span>
                    </div>
                    <button className="mini-button danger" onClick={() => removeFolder(folder)}>REMOVE</button>
                  </div>
                ))
              )}
              <div className="drawer-actions">
                <button className="mini-button" onClick={addFolder}>+ CONNECT FOLDER</button>
                <button className="mini-button danger" onClick={signOut}>UNLINK DEVICE</button>
              </div>
              {lastImport && (
                <div className="import-readout">
                  <span>{lastImport.found} FOUND</span>
                  <span>{lastImport.uploaded} UPLOADED</span>
                  <span>{lastImport.skipped} LINKED</span>
                  <span className={lastImport.failed.length ? "danger-text" : ""}>{lastImport.failed.length} FAILED</span>
                </div>
              )}
            </section>
          )}

          {!onboarding && stateLoaded && <section className={`diagnostics ${diagnosticsOpen ? "open" : ""}`}>
            <button className="diagnostics-toggle" onClick={() => setDiagnosticsOpen((open) => !open)}>
              <span>DIAGNOSTICS / EVENT LOG</span>
              <span className="diagnostics-action">{diagnosticsOpen ? "MINIMIZE −" : "EXPAND +"}</span>
            </button>
            <div className={`terminal ${diagnosticsOpen ? "expanded" : "preview"}`}>
              {visibleLog.map((line, index) => (
                <div key={`${line.ts}-${index}`} className={`terminal-line ${line.level}`}>
                  <span>[{new Date(line.ts).toLocaleTimeString([], { hour12: false })}]</span>
                  <span>{line.msg}</span>
                </div>
              ))}
            </div>
          </section>}
        </main>

        <footer className="footer">
          <span>PRECISION SYNC SYSTEMS</span>
          <button onClick={() => tfsync.openExternal(TUNESFORK_URL)}>TUNESFORK.COM ↗</button>
          <span>REV. A7</span>
        </footer>
      </div>
    </div>
  );
}

function getDisplayStatus({
  state,
  pairing,
  importing,
  latestLog,
  recentUpload,
}: {
  state: AppState;
  pairing: boolean;
  importing: boolean;
  latestLog: LogLine | null;
  recentUpload: AppState["recent"][number] | null;
}) {
  if (!state.paired && pairing) {
    return { kicker: "AUTH CHANNEL", title: "CONFIRM PAIRING", detail: "MATCH THIS CODE IN YOUR BROWSER", footer: "Pairing request active", tone: "amber", animated: true };
  }
  if (!state.paired) {
    return { kicker: "OFFLINE", title: "PAIR DEVICE", detail: "CONNECT THIS UNIT TO YOUR TUNESFORK ACCOUNT", footer: "Continue in your browser to begin", tone: "idle", animated: false };
  }
  if (state.folderAccessIssues.length > 0) {
    return { kicker: "INPUT FAULT", title: "ACCESS NEEDED", detail: "RECONNECT THE BLOCKED ABLETON FOLDER", footer: "Folder permission interrupted", tone: "red", animated: false };
  }
  if (importing) {
    return { kicker: "PROJECT SCAN", title: "INDEXING", detail: "READING PROJECTS AND PREPARING SNAPSHOTS", footer: latestLog?.msg || "Scanning connected folders", tone: "cyan", animated: true };
  }
  if (latestLog?.level === "busy") {
    const isUpload = /upload|zip|register|save detected/i.test(latestLog.msg);
    return { kicker: isUpload ? "CLOUD TRANSFER" : "PROCESSING", title: isUpload ? "UPLOADING" : "WORKING", detail: latestLog.msg.toUpperCase(), footer: "Do not disconnect the project folder", tone: "amber", animated: true };
  }
  if (latestLog?.level === "err") {
    return { kicker: "SYSTEM ALERT", title: "CHECK LOG", detail: latestLog.msg.toUpperCase(), footer: "Open diagnostics for details", tone: "red", animated: false };
  }
  if (recentUpload && Date.now() - recentUpload.at < 90_000) {
    return { kicker: "TRANSFER COMPLETE", title: "UPLOADED", detail: `${recentUpload.name} · VERSION ${recentUpload.version}`.toUpperCase(), footer: "Cloud snapshot secured", tone: "green", animated: false };
  }
  if (state.folders.length === 0) {
    return { kicker: "NO INPUT", title: "CONNECT FOLDER", detail: "ADD THE LOCATION OF YOUR ABLETON PROJECTS", footer: "No folders connected", tone: "idle", animated: false };
  }
  if (!state.syncing) {
    return { kicker: "STANDBY", title: "SYNC PAUSED", detail: "PRESS SYNC TO RESUME MONITORING", footer: "Project folders connected", tone: "idle", animated: false };
  }
  return { kicker: "SYNC ENGINE ACTIVE", title: "WAITING FOR SAVES", detail: `${state.folders.length} FOLDER${state.folders.length === 1 ? "" : "S"} ARMED · ${state.importedProjectCount} PROJECTS LINKED`, footer: "Ableton save detection online", tone: "green", animated: true };
}

function deviceName() {
  // Best-effort device name. The user can rename in /desktop-pair.
  return navigator.platform || "Desktop";
}

function relTime(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function shortPath(value: string) {
  const parts = value.split("/").filter(Boolean);
  if (parts.length <= 3) return value;
  return `…/${parts.slice(-3).join("/")}`;
}
