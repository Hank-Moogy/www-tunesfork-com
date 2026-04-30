const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tfsync", {
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  pairInit: (deviceName) => ipcRenderer.invoke("pair-init", deviceName),
  pairPoll: (code) => ipcRenderer.invoke("pair-poll", code),
  getState: () => ipcRenderer.invoke("get-state"),
  setFolders: (folders) => ipcRenderer.invoke("set-folders", folders),
  startSync: () => ipcRenderer.invoke("start-sync"),
  stopSync: () => ipcRenderer.invoke("stop-sync"),
  signOut: () => ipcRenderer.invoke("sign-out"),
  onLog: (cb) => ipcRenderer.on("log", (_e, line) => cb(line)),
});
