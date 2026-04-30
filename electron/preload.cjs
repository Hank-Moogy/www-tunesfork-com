const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tfsync", {
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
});
