import { useEffect, useRef, useState } from "react";

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
  return {
    openExternal: async () => {},
    pickFolder: async () => null,
    pickFolders: async () => ["/Users/demo/Music/Ableton Projects"],
    pairInit: async () => ({ code: "TF2026", pair_url: TUNESFORK_URL }),
    cancelPairing: async () => {},
    getState: async () => ({
      paired: true,
      deviceName: "Preview",
      folders: ["/Users/demo/Music/Ableton Projects"],
      syncing: true,
      importing: false,
      importedProjectCount: 3,
      folderAccessIssues: [],
      recent: [
        { name: "Midnight Sketch", version: 4, at: Date.now() - 45_000 },
        { name: "Drum Idea", version: 1, at: Date.now() - 12 * 60_000 },
      ],
    }),
    setFolders: async () => {},
    repairFolderAccess: async (folder) => ({ ok: true, folder }),
    openFolderPrivacySettings: async () => true,
    importWatchedFolders: async () => ({ found: 3, uploaded: 0, skipped: 3, failed: [] }),
    startSync: async () => {},
    stopSync: async () => {},
    signOut: async () => {},
    onLog: () => {},
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
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pairUrl, setPairUrl] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);
  const pairRefreshInterval = useRef<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [lastImport, setLastImport] = useState<ImportSummary | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);

  useEffect(() => {
    tfsync.getState().then(setState);
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
    return () => window.clearInterval(refreshInterval);
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

  return (
    <div className={`app ${navigator.platform.toLowerCase().includes("mac") ? "mac" : ""}`}>
      <div className="header">
        <div>
          <span className={`dot ${importing || state.importing ? "busy" : state.syncing ? "live" : state.paired ? "idle" : "err"}`} />
          <span className="brand">Tunesfork Sync</span>
        </div>
        {state.paired && (
          <button className="btn ghost sm" onClick={signOut}>Sign out</button>
        )}
      </div>

      <div className="body">
        {/* Not paired yet */}
        {!state.paired && !pairCode && (
          <div className="card">
            <h3>Get started</h3>
            <p className="muted" style={{ marginBottom: 12 }}>
              Pair this app with your Tunesfork account. Takes 10 seconds.
            </p>
            <button className="btn" onClick={startPair} disabled={pairing} style={{ width: "100%" }}>
              {pairing ? "Opening browser…" : "Sign in"}
            </button>
          </div>
        )}

        {/* Pairing in progress */}
        {pairCode && (
          <div className="card">
            <h3>Confirm in your browser</h3>
            <div className="code-display">{pairCode}</div>
            <p className="muted" style={{ marginTop: 10, textAlign: "center" }}>
              Waiting for confirmation…
            </p>
            <div className="pair-actions">
              <button className="btn ghost sm" onClick={reopenPairUrl} disabled={!pairUrl}>
                Open browser again
              </button>
              <button className="btn ghost sm" onClick={restartPair}>
                Start over
              </button>
              <button className="btn danger sm" onClick={cancelPair}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Folders */}
        {state.paired && (
          <div className="card">
            <h3>Watched folders</h3>
            {state.folders.length === 0 ? (
              <p className="muted" style={{ marginBottom: 8 }}>
                Pick one or more folders where you keep Ableton projects.
              </p>
            ) : (
              state.folders.map((f) => (
                <div className="row" key={f}>
                  <span className="path">{f}</span>
                  <button className="btn ghost sm" onClick={() => removeFolder(f)}>Remove</button>
                </div>
              ))
            )}
            <button className="btn ghost sm" onClick={addFolder} style={{ marginTop: 10, width: "100%" }}>
              + Add folders
            </button>
          </div>
        )}

        {state.paired && state.folderAccessIssues.length > 0 && (
          <div className="card access-warning">
            <h3>Folder access needed</h3>
            <p className="muted">
              macOS is blocking one or more Ableton folders. Saves cannot sync until access is restored.
            </p>
            {state.folderAccessIssues.map((issue) => (
              <div className="access-issue" key={issue.folder}>
                <div className="path">{issue.folder}</div>
                <div className="pair-actions">
                  <button className="btn sm" onClick={() => repairFolderAccess(issue.folder)}>
                    Choose folder again
                  </button>
                  <button className="btn ghost sm" onClick={() => tfsync.openFolderPrivacySettings()}>
                    Privacy settings
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Initial import */}
        {state.paired && state.folders.length > 0 && (
          <div className="card">
            <h3>Import and watch</h3>
            <p className="muted" style={{ marginBottom: 10 }}>
              Upload current projects once. Tunesfork will keep watching these folders after the import.
            </p>
            <button className="btn" onClick={importAndWatch} disabled={importing || state.importing} style={{ width: "100%" }}>
              {importing || state.importing ? "Importing…" : state.importedProjectCount > 0 ? "Import new folders" : "Import projects"}
            </button>
            {state.importedProjectCount > 0 && (
              <p className="muted" style={{ marginTop: 8 }}>
                {state.importedProjectCount} local project{state.importedProjectCount === 1 ? "" : "s"} linked for future saves.
              </p>
            )}
            {lastImport && (
              <div className="summary">
                <div>{lastImport.found} found</div>
                <div>{lastImport.uploaded} uploaded</div>
                <div>{lastImport.skipped} already linked</div>
                <div className={lastImport.failed.length ? "danger-text" : ""}>{lastImport.failed.length} failed</div>
              </div>
            )}
          </div>
        )}

        {/* Sync control */}
        {state.paired && state.folders.length > 0 && (
          <div className="card">
            <div className="row">
              <div>
                <strong>{state.syncing ? "Syncing" : "Paused"}</strong>
                <div className="muted">
                  {state.syncing ? "Watching for Ableton saves…" : "Click resume to watch for future saves"}
                </div>
              </div>
              <button className={`btn ${state.syncing ? "ghost" : ""}`} onClick={toggleSync}>
                {state.syncing ? "Pause" : "Resume"}
              </button>
            </div>
          </div>
        )}

        {/* Recent uploads */}
        {state.recent.length > 0 && (
          <div className="card">
            <h3>Recent uploads</h3>
            {state.recent.map((r, i) => (
              <div className="row" key={i}>
                <div>
                  <div>{r.name}</div>
                  <div className="muted">v{r.version}</div>
                </div>
                <span className="muted">{relTime(r.at)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Log */}
        {log.length > 0 && (
          <div className="card">
            <h3>Activity</h3>
            <div className="log">
              {log.map((l, i) => (
                <div key={i} className={`log-line ${l.level}`}>
                  {new Date(l.ts).toLocaleTimeString()} {l.msg}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="footer">
        <span>v0.1.0 alpha.7</span>
        <a href="#" onClick={(e) => { e.preventDefault(); tfsync.openExternal(TUNESFORK_URL); }}>
          tunesfork.com →
        </a>
      </div>
    </div>
  );
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
