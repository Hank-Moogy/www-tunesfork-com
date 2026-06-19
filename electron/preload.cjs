const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tfsync", {
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  pickFolders: () => ipcRenderer.invoke("pick-folders"),
  pairInit: (deviceName) => ipcRenderer.invoke("pair-init", deviceName),
  cancelPairing: () => ipcRenderer.invoke("cancel-pairing"),
  getState: () => ipcRenderer.invoke("get-state"),
  setFolders: (folders) => ipcRenderer.invoke("set-folders", folders),
  repairFolderAccess: (folder) => ipcRenderer.invoke("repair-folder-access", folder),
  openFolderPrivacySettings: () => ipcRenderer.invoke("open-folder-privacy-settings"),
  importWatchedFolders: () => ipcRenderer.invoke("import-watched-folders"),
  startSync: () => ipcRenderer.invoke("start-sync"),
  stopSync: () => ipcRenderer.invoke("stop-sync"),
  signOut: () => ipcRenderer.invoke("sign-out"),
  onLog: (cb) => ipcRenderer.on("log", (_e, line) => cb(line)),
});
