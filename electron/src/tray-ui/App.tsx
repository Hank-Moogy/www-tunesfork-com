import { useEffect, useState } from "react";

// Bridge exposed by preload.cjs
declare global {
  interface Window {
    tfsync: {
      openExternal: (url: string) => Promise<void>;
      pickFolder: () => Promise<string | null>;
      // Wired in step 2 below — see preload.cjs additions
      pairInit: (deviceName: string) => Promise<{ code: string; pair_url: string }>;
      pairPoll: (code: string) => Promise<unknown>;
      getState: () => Promise<AppState>;
      setFolders: (folders: string[]) => Promise<void>;
      startSync: () => Promise<void>;
      stopSync: () => Promise<void>;
      signOut: () => Promise<void>;
      onLog: (cb: (line: LogLine) => void) => void;
    };
  }
}

type LogLine = { ts: number; level: "info" | "ok" | "err" | "busy"; msg: string };
type AppState = {
  paired: boolean;
  deviceName: string | null;
  folders: string[];
  syncing: boolean;
  recent: { name: string; version: number; at: number }[];
};

const TUNESFORK_URL = "https://tunesfork.com";

export default function App() {
  const [state, setState] = useState<AppState>({
    paired: false, deviceName: null, folders: [], syncing: false, recent: [],
  });
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);

  useEffect(() => {
    window.tfsync.getState().then(setState);
    window.tfsync.onLog((line) => setLog((l) => [...l.slice(-99), line]));
  }, []);

  const refreshState = () => window.tfsync.getState().then(setState);

  const startPair = async () => {
    setPairing(true);
    try {
      const { code, pair_url } = await window.tfsync.pairInit(deviceName());
      setPairCode(code);
      await window.tfsync.openExternal(pair_url);
      // Polling happens in main process; we just refresh state every 2s until paired
      const interval = setInterval(async () => {
        const s = await window.tfsync.getState();
        if (s.paired) {
          clearInterval(interval);
          setPairCode(null);
          setPairing(false);
          setState(s);
        }
      }, 2000);
    } catch (e) {
      setPairing(false);
      alert(`Pairing failed: ${(e as Error).message}`);
    }
  };

  const addFolder = async () => {
    const folder = await window.tfsync.pickFolder();
    if (!folder) return;
    const next = Array.from(new Set([...state.folders, folder]));
    await window.tfsync.setFolders(next);
    refreshState();
  };

  const removeFolder = async (f: string) => {
    await window.tfsync.setFolders(state.folders.filter((x) => x !== f));
    refreshState();
  };

  const toggleSync = async () => {
    if (state.syncing) await window.tfsync.stopSync();
    else await window.tfsync.startSync();
    refreshState();
  };

  const signOut = async () => {
    if (!confirm("Sign out and unlink this device?")) return;
    await window.tfsync.signOut();
    refreshState();
  };

  return (
    <div className="app">
      <div className="header">
        <div>
          <span className={`dot ${state.syncing ? "live" : state.paired ? "idle" : "err"}`} />
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
          </div>
        )}

        {/* Folders */}
        {state.paired && (
          <div className="card">
            <h3>Watched folders</h3>
            {state.folders.length === 0 ? (
              <p className="muted" style={{ marginBottom: 8 }}>
                Pick the folder where you keep Ableton projects.
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
              + Add folder
            </button>
          </div>
        )}

        {/* Sync control */}
        {state.paired && state.folders.length > 0 && (
          <div className="card">
            <div className="row">
              <div>
                <strong>{state.syncing ? "Syncing" : "Paused"}</strong>
                <div className="muted">
                  {state.syncing ? "Watching for Ableton saves…" : "Click resume to watch for saves"}
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
        <span>v0.1.0 alpha</span>
        <a href="#" onClick={(e) => { e.preventDefault(); window.tfsync.openExternal(TUNESFORK_URL); }}>
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
