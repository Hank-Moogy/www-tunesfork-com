// Tunesfork Sync — main process
// Menu-bar / tray app. Loads the tray UI in a small popover BrowserWindow.
const { app, Tray, Menu, BrowserWindow, shell, ipcMain, dialog, nativeImage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

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
    alwaysOnTop: true,
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
    trayWindow.webContents.openDevTools({ mode: "detach" });
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
    archiver = require("archiver");
  } catch (e) {
    log("err", "Missing deps. Run `npm install` in /electron");
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

  // Upload to project-zips bucket using TUS (via fetch — keep it dep-light for alpha)
  // Simpler: use the resumable HTTP API directly. For alpha we use a single PUT
  // since most projects are <50MB. Swap to tus-js-client in v0.2 for big projects.
  const state = readState();
  const objectPath = `${state.userId}/${Date.now()}.zip`;
  const SUPABASE_PROJECT_ID = "zkzupvjqyltvxrgixrpx";
  const STORAGE_PUBLIC_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprenVwdmpxeWx0dnhyZ2l4cnB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMzE2MzYsImV4cCI6MjA5MDcwNzYzNn0.FmwkI4ludX6GtR_ViQpa4hFXe5jOpka3w94Y9aIYwK0";

  log("busy", `Uploading to ${objectPath}…`);
  const uploadRes = await fetch(
    `https://${SUPABASE_PROJECT_ID}.supabase.co/storage/v1/object/project-zips/${objectPath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STORAGE_PUBLIC_KEY}`,
        "Content-Type": "application/zip",
        "x-upsert": "false",
      },
      body: fs.readFileSync(tmpZip),
    },
  );
  if (!uploadRes.ok) {
    const t = await uploadRes.text();
    throw new Error(`Upload failed ${uploadRes.status}: ${t}`);
  }

  // Register version
  const token = readToken();
  const projectName = path.basename(projectFolder).replace(/ Project$/i, "");
  const cv = await fetch(`${FUNCTIONS_URL}/create-version-from-desktop`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      project_name: projectName,
      zip_storage_path: objectPath,
      file_size_bytes: fileSize,
      change_note: "Auto-saved from Tunesfork Sync",
    }),
  });
  if (!cv.ok) {
    const t = await cv.text();
    throw new Error(`Register failed ${cv.status}: ${t}`);
  }
  const result = await cv.json();
  log("ok", `✓ Uploaded ${projectName} v${result.version_number}`);

  // Update recent
  const ss = readState();
  ss.recent = [{ name: projectName, version: result.version_number, at: Date.now() }, ...ss.recent].slice(0, 10);
  writeState(ss);
  trayWindow?.webContents.send("log", { ts: Date.now(), level: "ok", msg: `Uploaded ${projectName} v${result.version_number}` });

  fs.unlink(tmpZip, () => {});
}

// ---------- app lifecycle ----------
app.whenReady().then(() => {
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }

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
  tray.on("click", toggleTrayWindow);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Tunesfork Sync", click: toggleTrayWindow },
    { label: "Open tunesfork.com", click: () => shell.openExternal(TUNESFORK_URL) },
    { type: "separator" },
    { label: "Quit", role: "quit" },
  ]));

  createTrayWindow();
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
