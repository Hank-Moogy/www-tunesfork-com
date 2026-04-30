// Tunesfork Sync — main process
// Menu-bar / tray app. Loads the tray UI in a small popover BrowserWindow.
const { app, Tray, Menu, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("node:path");
const { startSync } = require("./src/sync");

const TUNESFORK_URL = process.env.TUNESFORK_URL || "https://tunesfork.com";

let tray = null;
let trayWindow = null;
let stopSync = null;

function createTrayWindow() {
  trayWindow = new BrowserWindow({
    width: 380,
    height: 540,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  trayWindow.loadFile(path.join(__dirname, "dist", "index.html"));
  trayWindow.on("blur", () => trayWindow?.hide());
}

function toggleTrayWindow() {
  if (!trayWindow) return;
  if (trayWindow.isVisible()) {
    trayWindow.hide();
    return;
  }
  const bounds = tray.getBounds();
  const winBounds = trayWindow.getBounds();
  const x = Math.round(bounds.x + bounds.width / 2 - winBounds.width / 2);
  const y = process.platform === "darwin" ? bounds.y + bounds.height : bounds.y - winBounds.height;
  trayWindow.setBounds({ ...winBounds, x, y });
  trayWindow.show();
  trayWindow.focus();
}

app.whenReady().then(() => {
  // Single-instance lock so opening the app twice doesn't spawn two watchers
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  tray = new Tray(path.join(__dirname, "assets", "tray-icon.png"));
  tray.setToolTip("Tunesfork Sync");
  tray.on("click", toggleTrayWindow);

  // Right-click menu (fallback)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Tunesfork Sync", click: toggleTrayWindow },
      { label: "Open tunesfork.com", click: () => shell.openExternal(TUNESFORK_URL) },
      { type: "separator" },
      { label: "Quit", role: "quit" },
    ]),
  );

  createTrayWindow();

  // The watcher boots from inside the tray UI once the user has paired + chosen a folder.
  // See src/watcher.ts.
});

// macOS: keep app alive when all windows close
app.on("window-all-closed", (e) => e.preventDefault());

// IPC: tray UI asks the main process to do filesystem things
ipcMain.handle("open-external", (_e, url) => shell.openExternal(url));
ipcMain.handle("pick-folder", async () => {
  const { dialog } = require("electron");
  const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle("start-sync", async (_e, folders) => {
  if (stopSync) stopSync();
  stopSync = startSync(folders, (msg) => {
    trayWindow?.webContents.send("log", msg);
  });
});
