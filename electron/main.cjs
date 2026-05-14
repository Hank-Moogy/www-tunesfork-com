// Tunesfork Sync — main process
// Menu-bar / tray app. Loads the tray UI in a small popover BrowserWindow.
const { app, Tray, Menu, BrowserWindow, shell, ipcMain, dialog, nativeImage, Notification } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { parseAlsFile } = require("./als-parser.cjs");

const TUNESFORK_URL = process.env.TUNESFORK_URL || "https://tunesfork.com";
const FUNCTIONS_URL = process.env.TUNESFORK_FUNCTIONS_URL
  || "https://zkzupvjqyltvxrgixrpx.supabase.co/functions/v1";
const DEV_URL = process.env.VITE_DEV_SERVER_URL; // set when running `npm run dev:ui`

let tray = null;
let trayWindow = null;
let pollInterval = null;

// ---------- persistent state ----------
const stateDir = path.join(
  os.homedir(),
  process.platform === "darwin" ? "Library/Application Support/Tunesfork Sync"
  : process.platform === "win32" ? "AppData/Roaming/Tunesfork Sync"
  : ".config/tunesfork-sync",
);
fs.mkdirSync(stateDir, { recursive: true });
const stateFile = path.join(stateDir, "state.json");

const defaultState = {
  paired: false,
  deviceName: null,
  userId: null,
  folders: [],
  syncing: false,
  recent: [],
  // token is intentionally NOT in this file — stored in OS keychain via keytar.
  // For the alpha we keep it in a sidecar file with 600 perms; swap for keytar in v0.2.
};

function readState() {
  try { return { ...defaultState, ...JSON.parse(fs.readFileSync(stateFile, "utf8")) }; }
  catch { return { ...defaultState }; }
}
function writeState(s) { fs.writeFileSync(stateFile, JSON.stringify(s, null, 2), { mode: 0o600 }); }

const tokenFile = path.join(stateDir, "token");
function readToken() { try { return fs.readFileSync(tokenFile, "utf8").trim(); } catch { return null; } }
function writeToken(t) { fs.writeFileSync(tokenFile, t, { mode: 0o600 }); }
function clearToken() { try { fs.unlinkSync(tokenFile); } catch {} }

// ---------- logging ----------
function log(level, msg) {
  const line = { ts: Date.now(), level, msg };
  console.log(`[${level}] ${msg}`);
  trayWindow?.webContents.send("log", line);
}

// ---------- tray window ----------
function createTrayWindow() {
  trayWindow = new BrowserWindow({
    width: 380,
    height: 560,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (DEV_URL) {
    console.log("[tfsync] Loading dev URL:", DEV_URL);
    trayWindow.loadURL(DEV_URL);
    // DevTools disabled by default — open manually with Cmd+Opt+I if needed
  } else {
    trayWindow.loadFile(path.join(__dirname, "dist", "index.html"));
  }
  trayWindow.webContents.on("did-fail-load", (_e, code, desc) => {
    console.error("[tfsync] did-fail-load", code, desc);
  });
  trayWindow.webContents.on("did-finish-load", () => {
    console.log("[tfsync] did-finish-load");
  });
  trayWindow.on("blur", () => { if (!DEV_URL) trayWindow?.hide(); });
}

function toggleTrayWindow() {
  console.log("[tfsync] tray clicked. window?", !!trayWindow);
  if (!trayWindow) return;
  if (trayWindow.isVisible()) {
    console.log("[tfsync] hiding window");
    return trayWindow.hide();
  }
  const bounds = tray.getBounds();
  const wb = trayWindow.getBounds();
  console.log("[tfsync] tray bounds", bounds, "win", wb);

  // Get the display containing the tray; clamp x so the window stays on screen.
  const { screen } = require("electron");
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
  const workArea = display.workArea;

  let x = Math.round(bounds.x + bounds.width / 2 - wb.width / 2);
  // Clamp horizontally
  x = Math.max(workArea.x + 4, Math.min(x, workArea.x + workArea.width - wb.width - 4));

  let y;
  if (process.platform === "darwin") {
    // Tray is in top menubar; place window just below it
    y = Math.round(bounds.y + bounds.height + 4);
  } else {
    y = Math.round(bounds.y - wb.height - 4);
  }
  console.log("[tfsync] showing at", x, y);
  trayWindow.setBounds({ x, y, width: wb.width, height: wb.height });
  trayWindow.show();
  trayWindow.focus();
}

// ---------- pairing ----------
async function pairInit(deviceName) {
  const r = await fetch(`${FUNCTIONS_URL}/pair-device-init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_name: deviceName }),
  });
  if (!r.ok) throw new Error(`pair-init ${r.status}`);
  const data = await r.json();

  // Start polling for confirmation
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    try {
      const pr = await fetch(`${FUNCTIONS_URL}/pair-device-poll?code=${data.code}`);
      const body = await pr.json();
      if (body.status === "confirmed") {
        clearInterval(pollInterval);
        pollInterval = null;
        writeToken(body.token);
        const s = readState();
        s.paired = true;
        s.deviceName = body.device_name;
        s.userId = body.user_id;
        writeState(s);
        log("ok", `Paired as ${body.device_name}`);
      } else if (body.status === "expired" || body.status === "not_found") {
        clearInterval(pollInterval);
        pollInterval = null;
        log("err", `Pairing ${body.status}`);
      }
    } catch (e) {
      log("err", `poll: ${e.message}`);
    }
  }, 2000);

  return data;
}

// ---------- sync engine (lazy-loaded so pre-pair UI is fast) ----------
let stopWatcher = null;
async function startSync() {
  if (stopWatcher) return;
  const s = readState();
  if (!s.paired || s.folders.length === 0) {
    log("err", "Not paired or no folders");
    return;
  }
  // Lazy require so the tree-shaking pulls chokidar only when needed
  let chokidar, archiver;
  try {
    chokidar = require("chokidar");
  } catch (e) {
    log("err", `Failed to load 'chokidar': ${e && e.code ? `[${e.code}] ` : ""}${e && e.message ? e.message : e}`);
    log("err", `Looked in: ${(require.resolve.paths("chokidar") || []).join(" | ")}`);
    log("err", "Packaging bug — please install the latest build from tunesfork.com/desktop-app.");
    return;
  }
  try {
    archiver = require("archiver");
  } catch (e) {
    log("err", `Failed to load 'archiver': ${e && e.code ? `[${e.code}] ` : ""}${e && e.message ? e.message : e}`);
    log("err", `Looked in: ${(require.resolve.paths("archiver") || []).join(" | ")}`);
    log("err", "Packaging bug — please install the latest build from tunesfork.com/desktop-app.");
    return;
  }

  log("info", `Watching ${s.folders.length} folder(s)…`);
  const debouncers = new Map();
  const watcher = chokidar.watch(s.folders, {
    ignored: [/(^|[\/\\])\../, /[\/\\]Backup[\/\\]/, /[\/\\]Samples[\/\\]Processed[\/\\]Crop[\/\\]/],
    persistent: true,
    depth: 8,
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 200 },
  });

  const handleSave = (alsPath) => {
    if (path.extname(alsPath).toLowerCase() !== ".als") return;
    const existing = debouncers.get(alsPath);
    if (existing) clearTimeout(existing);
    debouncers.set(alsPath, setTimeout(() => {
      debouncers.delete(alsPath);
      processAlsSave(alsPath, archiver).catch((e) => log("err", e.message));
    }, 5000));
  };
  watcher.on("change", handleSave);
  watcher.on("add", handleSave);

  stopWatcher = () => { watcher.close(); debouncers.forEach((t) => clearTimeout(t)); };
  const ss = readState(); ss.syncing = true; writeState(ss);
}

function stopSync() {
  if (stopWatcher) { stopWatcher(); stopWatcher = null; }
  const s = readState(); s.syncing = false; writeState(s);
  log("info", "Sync paused");
}

// Find the Ableton Project folder containing this .als
function findProjectFolder(alsPath) {
  let dir = path.dirname(alsPath);
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "Ableton Project Info"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.dirname(alsPath);
}

async function processAlsSave(alsPath, archiver) {
  const projectFolder = findProjectFolder(alsPath);
  log("busy", `Save detected: ${path.basename(alsPath)}`);

  // Zip the project folder
  const tmpZip = path.join(os.tmpdir(), `tfsync-${Date.now()}.zip`);
  const out = fs.createWriteStream(tmpZip);
  const zip = archiver("zip", { zlib: { level: 0 } });
  await new Promise((resolve, reject) => {
    out.on("close", resolve);
    zip.on("error", reject);
    zip.pipe(out);
    zip.glob("**/*", {
      cwd: projectFolder,
      ignore: ["Backup/**", "**/.DS_Store", "**/Thumbs.db", "**/*.als~"],
      dot: false,
    }, { prefix: path.basename(projectFolder) });
    zip.finalize();
  });
  const fileSize = fs.statSync(tmpZip).size;
  log("busy", `Zipped ${(fileSize / 1e6).toFixed(1)} MB`);

  // Upload via a one-time signed URL minted for this paired desktop token.
  const token = readToken();
  if (!token) throw new Error("Not paired — pair this Mac again before uploading");
  const signedUploadRes = await fetch(`${FUNCTIONS_URL}/mint-storage-upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content_type: "application/zip" }),
  });
  if (!signedUploadRes.ok) {
    const t = await signedUploadRes.text();
    throw new Error(`Upload auth failed ${signedUploadRes.status}: ${t}`);
  }
  const { objectPath, signedUrl } = await signedUploadRes.json();

  log("busy", `Uploading to ${objectPath}…`);
  const uploadRes = await fetch(signedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/zip",
      "cache-control": "max-age=3600",
      "x-upsert": "false",
    },
    body: fs.readFileSync(tmpZip),
  });
  if (!uploadRes.ok) {
    const t = await uploadRes.text();
    throw new Error(`Upload failed ${uploadRes.status}: ${t}`);
  }

  // Register version
  const projectName = path.basename(projectFolder).replace(/ Project$/i, "");

  // Parse the .als so we can ship updated bpm/tracks/plugins with this version.
  // Failure is non-fatal — the version still uploads, just without refreshed metadata.
  const meta = parseAlsFile(alsPath);
  if (meta) {
    const clipCount = meta.tracks.reduce((sum, track) => sum + (track.clips?.length || 0), 0);
    log("info", `Parsed ${meta.tracks.length} tracks, ${clipCount} clips, ${meta.plugins.length} plugins${meta.bpm ? `, ${meta.bpm} BPM` : ""}`);
  }

  const cv = await fetch(`${FUNCTIONS_URL}/create-version-from-desktop`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      project_name: projectName,
      zip_storage_path: objectPath,
      file_size_bytes: fileSize,
      change_note: "Auto-saved from Tunesfork Sync",
      bpm: meta?.bpm ?? null,
      plugin_list: meta?.plugins ?? null,
      track_list: meta?.tracks ?? null,
      ableton_version: meta?.abletonVersion ?? null,
    }),
  });
  if (!cv.ok) {
    const t = await cv.text();
    throw new Error(`Register failed ${cv.status}: ${t}`);
  }
  const result = await cv.json();
  log("ok", `✓ Uploaded ${projectName} v${result.version_number}`);

  // Native macOS / Windows toast — uses the system notification center.
  if (Notification.isSupported()) {
    const n = new Notification({
      title: "Project saved to the cloud",
      body: `${projectName} · v${result.version_number}`,
      silent: false,
    });
    n.on("click", () => shell.openExternal(`${TUNESFORK_URL}/project/${result.project_id}`));
    n.show();
  }

  // Update recent
  const ss = readState();
  ss.recent = [{ name: projectName, version: result.version_number, at: Date.now() }, ...ss.recent].slice(0, 10);
  writeState(ss);
  trayWindow?.webContents.send("log", { ts: Date.now(), level: "ok", msg: `Uploaded ${projectName} v${result.version_number}` });

  fs.unlink(tmpZip, () => {});
}

// ---------- app lifecycle ----------
// Ensure native notifications show "Tunesfork Sync" instead of "Electron"
app.setName("Tunesfork Sync");
if (process.platform === "win32") app.setAppUserModelId("com.tunesfork.sync");

// ---------- deep-link protocol (tunesfork://) ----------
// Register so the OS routes `tunesfork://...` URLs to this app.
if (process.defaultApp) {
  // dev: pass the entry script so the protocol works when launched via electron CLI
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("tunesfork", process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient("tunesfork");
}

function parseDeepLink(url) {
  // tunesfork://open-project/<projectId>?version=<versionId>
  try {
    const u = new URL(url);
    if (u.protocol !== "tunesfork:") return null;
    const host = u.hostname; // "open-project"
    const projectId = u.pathname.replace(/^\//, "");
    if (host !== "open-project" || !projectId) return null;
    return { projectId, versionId: u.searchParams.get("version") || null };
  } catch { return null; }
}

async function handleOpenProjectDeepLink(url) {
  const parsed = parseDeepLink(url);
  if (!parsed) { log("err", `Ignoring deep link: ${url}`); return; }
  log("busy", `Opening ${parsed.projectId} in Ableton…`);
  try {
    await openProjectInAbleton(parsed.projectId, parsed.versionId);
  } catch (e) {
    log("err", `Open in Ableton failed: ${e.message}`);
    if (Notification.isSupported()) {
      new Notification({ title: "Could not open project", body: e.message }).show();
    }
  }
}

// macOS delivers protocol URLs via this event.
app.on("open-url", (event, url) => {
  event.preventDefault();
  if (app.isReady()) handleOpenProjectDeepLink(url);
  else app.whenReady().then(() => handleOpenProjectDeepLink(url));
});

// Windows / Linux deliver them as argv on a second-instance launch.
app.on("second-instance", (_e, argv) => {
  const url = argv.find((a) => typeof a === "string" && a.startsWith("tunesfork://"));
  if (url) handleOpenProjectDeepLink(url);
});

// ---------- open in Ableton ----------
async function openProjectInAbleton(projectId, versionId) {
  const token = readToken();
  if (!token) throw new Error("Pair this Mac with TunesFork first");

  const r = await fetch(`${FUNCTIONS_URL}/get-version-download-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ project_id: projectId, version_id: versionId }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Server: ${r.status} ${t.slice(0, 200)}`);
  }
  const { signedUrl, projectName, versionNumber } = await r.json();

  // Download & extract
  const adm = require("adm-zip");
  const zipPath = path.join(os.tmpdir(), `tfopen-${Date.now()}.zip`);
  const buf = Buffer.from(await (await fetch(signedUrl)).arrayBuffer());
  fs.writeFileSync(zipPath, buf);

  const destRoot = path.join(os.homedir(), "TunesFork", "Projects");
  fs.mkdirSync(destRoot, { recursive: true });
  const zip = new adm(zipPath);
  zip.extractAllTo(destRoot, true);

  // Find the .als — prefer the first one in the extracted folder.
  const safeName = (projectName || "Project").replace(/[\\/:*?"<>|]/g, "_");
  let alsPath = null;
  const candidateRoot = path.join(destRoot, safeName + " Project");
  const search = (dir) => {
    if (alsPath || !fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) search(full);
      else if (entry.name.toLowerCase().endsWith(".als")) { alsPath = full; return; }
    }
  };
  search(candidateRoot);
  if (!alsPath) search(destRoot);
  if (!alsPath) throw new Error("No .als file found in downloaded project");

  await shell.openPath(alsPath);
  log("ok", `Opened ${projectName} v${versionNumber} in Ableton`);
  if (Notification.isSupported()) {
    new Notification({ title: "Opening in Ableton", body: `${projectName} · v${versionNumber}` }).show();
  }
  fs.unlink(zipPath, () => {});
}

app.whenReady().then(() => {
  // Build a tray icon from a real PNG file if present, otherwise from an
  // in-memory 22×22 template image so macOS doesn't reject it.
  const iconPath = path.join(__dirname, "assets", "tray-icon.png");
  let trayImage;
  if (fs.existsSync(iconPath)) {
    trayImage = nativeImage.createFromPath(iconPath);
  }
  if (!trayImage || trayImage.isEmpty()) {
    // 22×22 black circle PNG — works as a macOS template image.
    const fallbackB64 =
      "iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAAaklEQVR4Ae3UsQ2AMAxE0e9sgJiAERiBERiBERiBETICIzACI3hCKVKkSJEiufud5HOu7K6qIiL+Q0RsQAesQA/MQAvUwACMwAR0wALMwAq0wAQMwAi0wAxMwAJ0wAS0wAyMwAJ0wAQ0wAyMwAJUAFkfDcjK4M2pAAAAAElFTkSuQmCC";
    trayImage = nativeImage.createFromBuffer(Buffer.from(fallbackB64, "base64"));
    trayImage.setTemplateImage(true);
  }

  tray = new Tray(trayImage);
  tray.setToolTip("Tunesfork Sync");
  if (process.platform === "darwin") {
    // Text makes the menu-bar item easy to find even when macOS hides/dims
    // low-contrast template icons or the menu bar is crowded.
    tray.setTitle("TF");
    tray.setIgnoreDoubleClickEvents(true);
  }
  tray.on("click", toggleTrayWindow);
  tray.on("right-click", () => {
    tray.popUpContextMenu(Menu.buildFromTemplate([
      { label: "Open Tunesfork Sync", click: toggleTrayWindow },
      { label: "Open tunesfork.com", click: () => shell.openExternal(TUNESFORK_URL) },
      { type: "separator" },
      { label: "Quit", role: "quit" },
    ]));
  });

  createTrayWindow();

  // Auto-resume sync on launch if the user is already paired and has folders.
  // Without this the watcher only starts after the user manually toggles
  // Pause → Resume in the tray UI, which made saves silently get missed.
  const s = readState();
  if (s.paired && s.folders.length > 0) {
    startSync().catch((e) => log("err", `Auto-start failed: ${e.message}`));
  }
});

app.on("window-all-closed", (e) => e.preventDefault());

// ---------- IPC ----------
ipcMain.handle("open-external", (_e, url) => shell.openExternal(url));
ipcMain.handle("pick-folder", async () => {
  const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("pair-init", (_e, deviceName) => pairInit(deviceName));
ipcMain.handle("get-state", () => {
  const s = readState();
  // Don't leak token. Recent timestamps are fine.
  return { paired: s.paired, deviceName: s.deviceName, folders: s.folders, syncing: s.syncing, recent: s.recent };
});
ipcMain.handle("set-folders", (_e, folders) => {
  const s = readState(); s.folders = folders; writeState(s);
});
ipcMain.handle("start-sync", () => startSync());
ipcMain.handle("stop-sync", () => stopSync());
ipcMain.handle("sign-out", () => {
  stopSync();
  clearToken();
  writeState({ ...defaultState });
  log("info", "Signed out");
});
