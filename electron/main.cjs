// Tunesfork Sync — main process
// Menu-bar / tray app. Loads the tray UI in a small popover BrowserWindow.
const { app, Tray, Menu, BrowserWindow, shell, ipcMain, dialog, nativeImage, Notification } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { parseAlsFile } = require("./als-parser.cjs");
const { buildSampleCheck } = require("./sample-check.cjs");
const {
  assertFolderReadable,
  folderAccessMessage,
  isFolderPermissionError,
} = require("./folder-access.cjs");

const TUNESFORK_URL = process.env.TUNESFORK_URL || "https://www.tunesfork.com";
const FUNCTIONS_URL = process.env.TUNESFORK_FUNCTIONS_URL
  || "https://urrxrntdkmmmqqwaihfj.supabase.co/functions/v1";
const DEV_URL = process.env.VITE_DEV_SERVER_URL; // set when running `npm run dev:ui`

if (process.env.TUNESFORK_STATE_DIR) {
  app.setPath("userData", path.resolve(process.env.TUNESFORK_STATE_DIR));
}

let tray = null;
let trayWindow = null;
let pollInterval = null;
let pendingDeepLink = null;
let trayWindowPositioned = false;
let appIsQuitting = false;

// ---------- persistent state ----------
const stateDir = process.env.TUNESFORK_STATE_DIR || path.join(
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
  projectLinks: {},
  syncing: false,
  recent: [],
  folderAccessIssues: {},
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

function expireDeviceLink(reason = "Device link expired") {
  clearToken();
  stopSync();
  const s = readState();
  s.paired = false;
  s.deviceName = null;
  s.userId = null;
  writeState(s);
  log("err", `${reason}. Connect your account again from Tunesfork Sync.`);
}

// ---------- logging ----------
function log(level, msg, key = null) {
  const line = { ts: Date.now(), level, msg, key };
  console.log(`[${level}] ${msg}`);
  trayWindow?.webContents.send("log", line);
}

function normalizeFolder(folder) {
  return path.resolve(folder);
}

function getProjectLink(projectFolder) {
  const s = readState();
  return s.projectLinks?.[normalizeFolder(projectFolder)] ?? null;
}

function recordFolderAccessIssue(folder, error) {
  const normalized = normalizeFolder(folder);
  const message = folderAccessMessage(normalized, error);
  const s = readState();
  s.folderAccessIssues = s.folderAccessIssues || {};
  const prior = s.folderAccessIssues[normalized];
  if (prior && prior.code === error?.code && prior.message === message) return;
  s.folderAccessIssues[normalized] = {
    folder: normalized,
    code: error?.code || "UNKNOWN",
    message,
    at: Date.now(),
  };
  writeState(s);
  log("err", message, `folder-access:${normalized}`);
}

function clearFolderAccessIssue(folder) {
  const normalized = normalizeFolder(folder);
  const s = readState();
  if (!s.folderAccessIssues?.[normalized]) return;
  delete s.folderAccessIssues[normalized];
  writeState(s);
}

function checkWatchedFolderAccess() {
  const s = readState();
  const issues = [];
  const candidates = new Set([
    ...s.folders,
    ...Object.keys(s.folderAccessIssues || {}),
  ]);
  for (const folder of candidates) {
    try {
      assertFolderReadable(folder);
      clearFolderAccessIssue(folder);
    } catch (error) {
      recordFolderAccessIssue(folder, error);
      issues.push({
        folder: normalizeFolder(folder),
        code: error?.code || "UNKNOWN",
        message: folderAccessMessage(folder, error),
      });
    }
  }
  return issues;
}

function getLocalProjectById(projectId) {
  const s = readState();
  for (const link of Object.values(s.projectLinks || {})) {
    if (link?.projectId !== projectId || !link.folder) continue;
    const folder = normalizeFolder(link.folder);
    if (!fs.existsSync(folder)) continue;
    try {
      assertFolderReadable(folder);
      clearFolderAccessIssue(folder);
    } catch (error) {
      recordFolderAccessIssue(folder, error);
      return { ...link, folder, alsPath: null, accessError: folderAccessMessage(folder, error) };
    }
    const alsPath = findLatestAls(folder);
    if (!alsPath) {
      return {
        ...link,
        folder,
        alsPath: null,
        accessError: `No Ableton .als file was found in the linked folder "${folder}".`,
      };
    }
    return { ...link, folder, alsPath };
  }
  return null;
}

// Stream-hash a file without loading it whole into memory.
function hashFileSync(filePath) {
  const h = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(4 * 1024 * 1024);
    let bytes;
    while ((bytes = fs.readSync(fd, buf, 0, buf.length)) > 0) {
      h.update(buf.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(fd);
  }
  return h.digest("hex");
}

// Stable content hash of the project folder (same files the zip includes).
// Ableton rewrites the .als on every save even without edits, and the gzip
// wrapper embeds a timestamp — so .als files are hashed on their gunzipped
// XML to detect "nothing actually changed".
function computeProjectContentHash(projectFolder) {
  const entries = [];
  const stack = [projectFolder];
  while (stack.length) {
    const dir = stack.pop();
    let dirents = [];
    try {
      dirents = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      if (isFolderPermissionError(error)) throw error;
      continue;
    }
    for (const entry of dirents) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "Backup") continue;
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name === "Thumbs.db" || entry.name.endsWith(".als~")) continue;
      const rel = path.relative(projectFolder, full);
      let digest;
      if (entry.name.toLowerCase().endsWith(".als")) {
        try {
          digest = crypto.createHash("sha256").update(zlib.gunzipSync(fs.readFileSync(full))).digest("hex");
        } catch {
          digest = hashFileSync(full);
        }
      } else {
        digest = hashFileSync(full);
      }
      entries.push(`${rel}\0${digest}`);
    }
  }
  entries.sort();
  return crypto.createHash("sha256").update(entries.join("\n")).digest("hex");
}

function setProjectLink(projectFolder, link) {
  const s = readState();
  s.projectLinks = s.projectLinks || {};
  s.projectLinks[normalizeFolder(projectFolder)] = {
    ...link,
    folder: normalizeFolder(projectFolder),
    updatedAt: Date.now(),
  };
  writeState(s);
}

function addRecentUpload(projectName, versionNumber) {
  const s = readState();
  s.recent = [{ name: projectName, version: versionNumber, at: Date.now() }, ...s.recent].slice(0, 10);
  writeState(s);
}

function getSupabaseProjectRef() {
  const match = FUNCTIONS_URL.match(/^https:\/\/([^.]+)\.supabase\.co\//);
  return match?.[1] ?? process.env.TUNESFORK_SUPABASE_PROJECT_ID ?? null;
}

// ---------- tray window ----------
function createTrayWindow() {
  trayWindow = new BrowserWindow({
    width: 430,
    height: 620,
    show: false,
    frame: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 14, y: 14 } : undefined,
    minWidth: 400,
    minHeight: 580,
    maxWidth: 560,
    maxHeight: 920,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    movable: true,
    icon: path.join(__dirname, "build", "icon.png"),
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
  trayWindow.on("close", (event) => {
    if (appIsQuitting) return;
    event.preventDefault();
    trayWindow?.hide();
  });
  trayWindow.setAlwaysOnTop(true, "floating");
  if (process.platform === "darwin") {
    trayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
}

function toggleTrayWindow() {
  console.log("[tfsync] tray clicked. window?", !!trayWindow);
  if (!trayWindow) return;
  if (trayWindow.isVisible()) {
    console.log("[tfsync] hiding window");
    return trayWindow.hide();
  }
  if (!trayWindowPositioned) {
    const bounds = tray.getBounds();
    const wb = trayWindow.getBounds();
    console.log("[tfsync] tray bounds", bounds, "win", wb);

    // Get the display containing the tray; clamp x so the window stays on screen.
    const { screen } = require("electron");
    const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
    const workArea = display.workArea;

    let x = Math.round(bounds.x + bounds.width / 2 - wb.width / 2);
    x = Math.max(workArea.x + 4, Math.min(x, workArea.x + workArea.width - wb.width - 4));

    const y = process.platform === "darwin"
      ? Math.round(bounds.y + bounds.height + 4)
      : Math.round(bounds.y - wb.height - 4);
    console.log("[tfsync] showing at", x, y);
    trayWindow.setBounds({ x, y, width: wb.width, height: wb.height });
    trayWindowPositioned = true;
  }
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
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`pair-init ${r.status}: ${body.slice(0, 500)}`);
  }
  const data = await r.json();
  if (TUNESFORK_URL) {
    data.pair_url = `${TUNESFORK_URL.replace(/\/$/, "")}/desktop-pair?code=${encodeURIComponent(data.code)}`;
  }

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

function cancelPairing() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  log("info", "Pairing cancelled");
}

// ---------- sync engine (lazy-loaded so pre-pair UI is fast) ----------
let stopWatcher = null;
const projectUploadChains = new Map();
const recentlyOpenedProjects = new Map();
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

  const accessibleFolders = [];
  for (const folder of s.folders) {
    try {
      accessibleFolders.push(assertFolderReadable(folder));
      clearFolderAccessIssue(folder);
    } catch (error) {
      recordFolderAccessIssue(folder, error);
    }
  }
  if (accessibleFolders.length === 0) {
    const stopped = readState();
    stopped.syncing = false;
    writeState(stopped);
    throw new Error("No watched folders are accessible. Fix folder access in Tunesfork Sync.");
  }

  log("info", `Watching ${accessibleFolders.length} folder(s)…`);
  const debouncers = new Map();
  const watcher = chokidar.watch(accessibleFolders, {
    ignored: [/(^|[\/\\])\../, /[\/\\]Backup[\/\\]/, /[\/\\]Samples[\/\\]Processed[\/\\]Crop[\/\\]/],
    persistent: true,
    depth: 8,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 200 },
  });

  const handleSave = (alsPath) => {
    if (path.extname(alsPath).toLowerCase() !== ".als") return;
    if (importRunning) return;
    const projectFolder = findProjectFolder(alsPath);
    const openedAt = recentlyOpenedProjects.get(normalizeFolder(projectFolder));
    if (openedAt && Date.now() - openedAt < 30_000) {
      log("info", `Ignored Ableton's open event for ${path.basename(alsPath)}`);
      return;
    }
    const existing = debouncers.get(projectFolder);
    if (existing) clearTimeout(existing);
    debouncers.set(projectFolder, setTimeout(() => {
      debouncers.delete(projectFolder);
      enqueueProjectSave(alsPath, archiver).catch((e) => {
        if (isFolderPermissionError(e)) recordFolderAccessIssue(projectFolder, e);
        else log("err", e.message);
      });
    }, 5000));
  };
  watcher.on("change", handleSave);
  watcher.on("add", handleSave);
  watcher.on("error", (error) => {
    const blockedFolder = error?.path ? findProjectFolder(error.path) : accessibleFolders[0];
    if (isFolderPermissionError(error) && blockedFolder) {
      recordFolderAccessIssue(blockedFolder, error);
    } else {
      log("err", `Folder watcher failed: ${error?.message || error}`);
    }
  });

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
  const { projectName, result } = await uploadProjectFolder({
    projectFolder,
    alsPath,
    archiver,
    changeNote: "Auto-saved from Tunesfork Sync",
  });

  if (result.skipped) {
    log("ok", `✓ ${projectName} already up to date`);
    return;
  }

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

  trayWindow?.webContents.send("log", { ts: Date.now(), level: "ok", msg: `Uploaded ${projectName} v${result.version_number}` });
}

function enqueueProjectSave(alsPath, archiver) {
  const projectFolder = normalizeFolder(findProjectFolder(alsPath));
  const prior = projectUploadChains.get(projectFolder) || Promise.resolve();
  const next = prior
    .catch(() => {})
    .then(() => processAlsSave(alsPath, archiver));
  projectUploadChains.set(projectFolder, next);
  next.finally(() => {
    if (projectUploadChains.get(projectFolder) === next) {
      projectUploadChains.delete(projectFolder);
    }
  }).catch(() => {});
  return next;
}

async function uploadProjectFolder({ projectFolder, alsPath, archiver, changeNote }) {
  assertFolderReadable(projectFolder);
  clearFolderAccessIssue(projectFolder);

  // Skip the upload entirely when nothing actually changed since the last
  // successful upload of this folder — saves storage and bandwidth when the
  // user hits save without edits.
  const priorLink = getProjectLink(projectFolder);
  let contentHash = null;
  try {
    contentHash = computeProjectContentHash(projectFolder);
  } catch (e) {
    log("warn", `Content hash failed (uploading anyway): ${e && e.message ? e.message : e}`);
  }
  if (contentHash && priorLink?.projectId && priorLink.lastContentHash === contentHash) {
    log("info", `${path.basename(projectFolder)} unchanged since last upload — skipped`);
    return {
      projectName: priorLink.projectName ?? path.basename(projectFolder).replace(/ Project$/i, ""),
      result: {
        project_id: priorLink.projectId,
        version_number: priorLink.lastVersion ?? null,
        skipped: true,
      },
    };
  }

  const tmpZip = path.join(os.tmpdir(), `tfsync-${Date.now()}.zip`);
  try {
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
      if (signedUploadRes.status === 401 && /Invalid or revoked token|Missing device token/i.test(t)) {
        expireDeviceLink("Device link expired or was revoked");
      }
      throw new Error(`Upload auth failed ${signedUploadRes.status}: ${t}`);
    }
    const { objectPath, signedUrl, token: signedUploadToken } = await signedUploadRes.json();

    log("busy", `Uploading to ${objectPath}…`);
    if (signedUploadToken) {
      await uploadZipResumable({
        filePath: tmpZip,
        fileSize,
        objectPath,
        signedUploadToken,
      });
    } else {
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
    }

    const projectName = path.basename(projectFolder).replace(/ Project$/i, "");
    const existingLink = getProjectLink(projectFolder);

    // Parse the .als so we can ship updated bpm/tracks/plugins with this version.
    // Failure is non-fatal — the version still uploads, just without refreshed metadata.
    let meta = null;
    try {
      meta = parseAlsFile(alsPath);
    } catch (e) {
      log("err", `Could not parse Ableton metadata: ${e && e.message ? e.message : e}`);
    }
    if (meta) {
      const clipCount = meta.tracks.reduce((sum, track) => sum + (track.clips?.length || 0), 0);
      log("info", `Parsed ${meta.tracks.length} tracks, ${clipCount} clips, ${meta.plugins.length} plugins${meta.bpm ? `, ${meta.bpm} BPM` : ""}`);
    }

    // Sample integrity check — see how many referenced samples actually live in
    // the project folder. Stored on the version so the web UI can flag missing
    // samples before a collaborator opens the project.
    let sampleCheck = null;
    try {
      sampleCheck = buildSampleCheck(projectFolder, meta?.samples ?? []);
      if (sampleCheck.missing > 0 || sampleCheck.external > 0) {
        log(
          "warn",
          `${sampleCheck.missing} missing / ${sampleCheck.external} external samples — collaborators may see "Media Files Missing". Run File → Collect All and Save in Ableton.`
        );
      }
    } catch (e) {
      log("warn", `Sample check failed: ${e.message}`);
    }

    const body = {
      project_name: projectName,
      zip_storage_path: objectPath,
      file_size_bytes: fileSize,
      change_note: changeNote,
      bpm: meta?.bpm ?? null,
      plugin_list: meta?.plugins ?? null,
      track_list: meta?.tracks ?? null,
      ableton_version: meta?.abletonVersion ?? null,
      sample_check: sampleCheck,
    };
    const linkMatchesCurrentFolderName = !existingLink?.projectName || existingLink.projectName === projectName;
    if (existingLink?.projectId && linkMatchesCurrentFolderName) {
      body.project_id = existingLink.projectId;
    } else if (existingLink?.projectId) {
      log("warn", `Ignored stale project link for ${projectName}; cached link pointed to ${existingLink.projectName || "another project"}`);
    }

    const cv = await fetch(`${FUNCTIONS_URL}/create-version-from-desktop`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!cv.ok) {
      const t = await cv.text();
      throw new Error(`Register failed ${cv.status}: ${t}`);
    }
    const result = await cv.json();
    setProjectLink(projectFolder, {
      projectId: result.project_id,
      projectName,
      lastVersion: result.version_number,
      lastVersionId: result.version_id,
      lastContentHash: contentHash,
    });
    addRecentUpload(projectName, result.version_number);

    return { projectName, result };
  } finally {
    fs.unlink(tmpZip, () => {});
  }
}

async function uploadZipResumable({ filePath, fileSize, objectPath, signedUploadToken }) {
  let tus;
  try {
    tus = require("tus-js-client");
  } catch (e) {
    throw new Error(`Failed to load 'tus-js-client': ${e && e.message ? e.message : e}`);
  }

  const projectRef = getSupabaseProjectRef();
  if (!projectRef) throw new Error("Could not determine Supabase project ref for resumable upload");

  const endpoint = `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable/sign`;
  let lastLoggedPct = -1;

  await new Promise((resolve, reject) => {
    const upload = new tus.Upload(fs.createReadStream(filePath), {
      endpoint,
      uploadSize: fileSize,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        "x-signature": signedUploadToken,
        "x-upsert": "false",
      },
      uploadDataDuringCreation: false,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName: "project-zips",
        objectName: objectPath,
        contentType: "application/zip",
        cacheControl: "3600",
      },
      onError: (error) => reject(error),
      onProgress: (bytesUploaded, bytesTotal) => {
        if (!bytesTotal) return;
        const pct = Math.floor((bytesUploaded / bytesTotal) * 100);
        if (pct >= lastLoggedPct + 10 || pct === 100) {
          lastLoggedPct = pct;
          log("busy", `Upload ${pct}%`, `upload:${objectPath}`);
        }
      },
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}

function findLatestAls(projectFolder) {
  let latest = null;
  const stack = [projectFolder];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "Backup" || entry.name.startsWith(".")) continue;
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith(".als") || entry.name.endsWith(".als~")) continue;
      const stat = fs.statSync(full);
      if (!latest || stat.mtimeMs > latest.mtimeMs) latest = { path: full, mtimeMs: stat.mtimeMs };
    }
  }
  return latest?.path ?? null;
}

function findLatestDirectAls(projectFolder) {
  let latest = null;
  let entries = [];
  try { entries = fs.readdirSync(projectFolder, { withFileTypes: true }); } catch { return null; }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".als") || entry.name.endsWith(".als~")) continue;
    const full = path.join(projectFolder, entry.name);
    const stat = fs.statSync(full);
    if (!latest || stat.mtimeMs > latest.mtimeMs) latest = { path: full, mtimeMs: stat.mtimeMs };
  }
  return latest?.path ?? null;
}

function findAbletonProjectFolders(roots) {
  const found = new Map();
  for (const root of roots) {
    const start = normalizeFolder(root);
    if (!fs.existsSync(start)) continue;
    const stack = [{ dir: start, depth: 0 }];
    while (stack.length) {
      const { dir, depth } = stack.pop();
      if (found.has(dir)) continue;
      if (fs.existsSync(path.join(dir, "Ableton Project Info"))) {
        const alsPath = findLatestAls(dir);
        if (alsPath) found.set(dir, { folder: dir, alsPath });
        continue;
      }
      if (depth >= 8) continue;
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === "Backup" || entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        stack.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
      }
    }

    if (found.size === 0 && !found.has(start)) {
      const alsPath = findLatestDirectAls(start);
      if (alsPath) found.set(start, { folder: start, alsPath });
    }
  }
  return Array.from(found.values()).sort((a, b) => a.folder.localeCompare(b.folder));
}

let importRunning = false;
async function importWatchedFolders() {
  if (importRunning) throw new Error("Import already running");
  const s = readState();
  if (!s.paired) throw new Error("Pair this Mac before importing projects");
  if (s.folders.length === 0) throw new Error("Choose at least one folder before importing projects");

  importRunning = true;
  const shouldResume = s.syncing;
  if (shouldResume) stopSync();

  const summary = { found: 0, uploaded: 0, skipped: 0, failed: [] };
  try {
    const archiver = require("archiver");
    const accessibleFolders = [];
    for (const folder of s.folders) {
      try {
        accessibleFolders.push(assertFolderReadable(folder));
        clearFolderAccessIssue(folder);
      } catch (error) {
        recordFolderAccessIssue(folder, error);
        summary.failed.push({ folder, error: folderAccessMessage(folder, error) });
      }
    }
    const projects = findAbletonProjectFolders(accessibleFolders);
    summary.found = projects.length;
    log("info", `Found ${projects.length} Ableton project folder(s)`);

    for (const project of projects) {
      const link = getProjectLink(project.folder);
      if (link?.projectId) {
        summary.skipped += 1;
        log("info", `Already imported: ${path.basename(project.folder)}`);
        continue;
      }

      try {
        log("busy", `Importing ${path.basename(project.folder)}…`);
        const { result } = await uploadProjectFolder({
          projectFolder: project.folder,
          alsPath: project.alsPath,
          archiver,
          changeNote: "Imported from Tunesfork Sync",
        });
        summary.uploaded += 1;
        log("ok", `Imported ${path.basename(project.folder)} v${result.version_number}`);
      } catch (e) {
        summary.failed.push({ folder: project.folder, error: e.message });
        log("err", `Import failed for ${path.basename(project.folder)}: ${e.message}`);
      }
    }

    if (Notification.isSupported()) {
      new Notification({
        title: "Tunesfork import complete",
        body: `${summary.uploaded} uploaded, ${summary.skipped} already imported, ${summary.failed.length} failed`,
      }).show();
    }
    return summary;
  } finally {
    importRunning = false;
    if (shouldResume || summary.uploaded > 0 || summary.skipped > 0) {
      startSync().catch((e) => log("err", `Resume after import failed: ${e.message}`));
    }
  }
}

// ---------- app lifecycle ----------
// Ensure native notifications show "Tunesfork Sync" instead of "Electron"
app.setName("Tunesfork Sync");
if (process.platform === "win32") app.setAppUserModelId("com.tunesfork.sync");

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

// ---------- deep-link protocol (tunesfork://) ----------
// Register so the OS routes `tunesfork://...` URLs to this app.
if (process.env.TUNESFORK_SKIP_PROTOCOL_REGISTRATION !== "1") {
  if (process.defaultApp) {
    // dev: pass the entry script so the protocol works when launched via electron CLI
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient("tunesfork", process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient("tunesfork");
  }
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
  else pendingDeepLink = url;
});

// Windows / Linux deliver them as argv on a second-instance launch.
app.on("second-instance", (_e, argv) => {
  const url = argv.find((a) => typeof a === "string" && a.startsWith("tunesfork://"));
  if (url) handleOpenProjectDeepLink(url);
  else if (trayWindow && !trayWindow.isVisible()) toggleTrayWindow();
});

if (process.platform !== "darwin") {
  pendingDeepLink = process.argv.find(
    (arg) => typeof arg === "string" && arg.startsWith("tunesfork://")
  ) || null;
}

// ---------- open in Ableton ----------
async function openProjectInAbleton(projectId, versionId) {
  // A project imported by this tray app is already present locally. Opening
  // that exact .als is immediate and preserves Ableton's project identity.
  // Downloading the cloud ZIP here created a duplicate project and could take
  // a long time for sets with collected samples.
  const localProject = getLocalProjectById(projectId);
  if (localProject) {
    if (localProject.accessError) throw new Error(localProject.accessError);
    recentlyOpenedProjects.set(normalizeFolder(localProject.folder), Date.now());
    const openError = await shell.openPath(localProject.alsPath);
    if (openError) throw new Error(openError);
    log("ok", `Opened local project ${localProject.projectName || path.basename(localProject.folder)} in Ableton`);
    return;
  }

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
  const { signedUrl, projectName, versionId: downloadedVersionId, versionNumber } = await r.json();

  // Download & extract
  const adm = require("adm-zip");
  const zipPath = path.join(os.tmpdir(), `tfopen-${Date.now()}.zip`);
  const buf = Buffer.from(await (await fetch(signedUrl)).arrayBuffer());
  fs.writeFileSync(zipPath, buf);

  const safeName = (projectName || "Project").replace(/[\\/:*?"<>|]/g, "_");
  const destRoot = path.join(
    os.homedir(),
    "TunesFork",
    "Projects",
    `${safeName} [${projectId.slice(0, 8)}]`
  );
  fs.mkdirSync(destRoot, { recursive: true });
  const zip = new adm(zipPath);
  const alsEntry = zip.getEntries().find(
    (entry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith(".als")
  );
  if (!alsEntry) throw new Error("No .als file found in downloaded project");

  // Resolve the exact archive entry instead of scanning all downloaded
  // projects, which could open an unrelated set with a similar name.
  const alsPath = path.resolve(destRoot, alsEntry.entryName);
  if (!alsPath.startsWith(`${path.resolve(destRoot)}${path.sep}`)) {
    throw new Error("Downloaded project contained an invalid Ableton path");
  }
  zip.extractAllTo(destRoot, true);
  if (!fs.existsSync(alsPath)) throw new Error("Downloaded Ableton set could not be extracted");

  const downloadedProjectFolder = findProjectFolder(alsPath);
  setProjectLink(downloadedProjectFolder, {
    projectId,
    projectName,
    lastVersion: versionNumber,
    lastVersionId: downloadedVersionId,
    lastContentHash: null,
  });
  const state = readState();
  if (!state.folders.includes(downloadedProjectFolder)) {
    state.folders.push(downloadedProjectFolder);
    writeState(state);
    if (stopWatcher) {
      stopSync();
      await startSync();
    }
  }

  recentlyOpenedProjects.set(normalizeFolder(downloadedProjectFolder), Date.now());
  const openError = await shell.openPath(alsPath);
  if (openError) throw new Error(openError);
  log("ok", `Opened ${projectName} v${versionNumber} in Ableton`);
  fs.unlink(zipPath, () => {});
}

app.whenReady().then(() => {
  if (process.platform === "darwin") app.dock?.hide();

  // Build a tray icon from a real PNG file if present, otherwise from an
  // in-memory 22×22 template image so macOS doesn't reject it.
  const iconPath = path.join(__dirname, "assets", "tray-icon.png");
  let trayImage;
  if (fs.existsSync(iconPath)) {
    trayImage = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
  }
  if (!trayImage || trayImage.isEmpty()) {
    // 22×22 black circle PNG — works as a macOS template image.
    const fallbackB64 =
      "iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAAaklEQVR4Ae3UsQ2AMAxE0e9sgJiAERiBERiBERiBETICIzACI3hCKVKkSJEiufud5HOu7K6qIiL+Q0RsQAesQA/MQAvUwACMwAR0wALMwAq0wAQMwAi0wAxMwAJ0wAS0wAyMwAJ0wAQ0wAyMwAJUAFkfDcjK4M2pAAAAAElFTkSuQmCC";
    trayImage = nativeImage.createFromBuffer(Buffer.from(fallbackB64, "base64"));
  }
  // macOS menubar: render as a template image so it adapts to light/dark mode.
  if (process.platform === "darwin") {
    trayImage.setTemplateImage(true);
  }

  tray = new Tray(trayImage);
  tray.setToolTip("Tunesfork Sync");
  if (process.platform === "darwin") {
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
  const accessIssues = checkWatchedFolderAccess();
  if (!s.paired || s.folders.length === 0 || accessIssues.length > 0) {
    setTimeout(() => {
      if (trayWindow && !trayWindow.isVisible()) toggleTrayWindow();
    }, 300);
  }

  if (pendingDeepLink) {
    const url = pendingDeepLink;
    pendingDeepLink = null;
    handleOpenProjectDeepLink(url);
  }
});

app.on("activate", () => {
  if (trayWindow && !trayWindow.isVisible()) toggleTrayWindow();
});

// Keep the tray process alive even when its utility window is hidden.
app.on("window-all-closed", () => {});
app.on("before-quit", () => {
  appIsQuitting = true;
});

// ---------- IPC ----------
ipcMain.handle("open-external", (_e, url) => shell.openExternal(url));
ipcMain.handle("pick-folder", async () => {
  const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("pick-folders", async () => {
  const r = await dialog.showOpenDialog({ properties: ["openDirectory", "multiSelections"] });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle("pair-init", (_e, deviceName) => pairInit(deviceName));
ipcMain.handle("cancel-pairing", () => cancelPairing());
ipcMain.handle("get-state", () => {
  const s = readState();
  // Don't leak token. Recent timestamps are fine.
  return {
    paired: s.paired,
    deviceName: s.deviceName,
    folders: s.folders,
    syncing: s.syncing,
    importing: importRunning,
    recent: s.recent,
    importedProjectCount: Object.keys(s.projectLinks || {}).length,
    folderAccessIssues: checkWatchedFolderAccess(),
  };
});
ipcMain.handle("set-folders", async (_e, folders) => {
  const s = readState();
  const wasSyncing = s.syncing;
  s.folders = folders.map(normalizeFolder);
  s.folderAccessIssues = Object.fromEntries(
    Object.entries(s.folderAccessIssues || {}).filter(([folder]) => s.folders.includes(folder))
  );
  writeState(s);
  if (wasSyncing) {
    stopSync();
    if (s.folders.length > 0) await startSync();
  }
});
ipcMain.handle("repair-folder-access", async (_e, folder) => {
  const normalized = normalizeFolder(folder);
  const result = await dialog.showOpenDialog({
    title: "Restore Ableton folder access",
    message: "Choose this Ableton folder again so Tunesfork Sync can read future saves.",
    defaultPath: normalized,
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, cancelled: true };

  const selected = normalizeFolder(result.filePaths[0]);
  try {
    assertFolderReadable(selected);
  } catch (error) {
    recordFolderAccessIssue(selected, error);
    return { ok: false, cancelled: false, message: folderAccessMessage(selected, error) };
  }

  const s = readState();
  const wasSyncing = s.syncing;
  s.folders = Array.from(new Set(s.folders.map((item) => item === normalized ? selected : item)));
  if (s.projectLinks?.[normalized] && normalized !== selected) {
    s.projectLinks[selected] = {
      ...s.projectLinks[normalized],
      folder: selected,
      updatedAt: Date.now(),
    };
    delete s.projectLinks[normalized];
  }
  if (s.folderAccessIssues) {
    delete s.folderAccessIssues[normalized];
    delete s.folderAccessIssues[selected];
  }
  writeState(s);

  if (wasSyncing) {
    stopSync();
    await startSync();
  }
  return { ok: true, folder: selected };
});
ipcMain.handle("open-folder-privacy-settings", async () => {
  if (process.platform !== "darwin") return false;
  await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders");
  return true;
});
ipcMain.handle("import-watched-folders", () => importWatchedFolders());
ipcMain.handle("start-sync", () => startSync());
ipcMain.handle("stop-sync", () => stopSync());
ipcMain.handle("sign-out", () => {
  stopSync();
  clearToken();
  writeState({ ...defaultState });
  log("info", "Signed out");
});
