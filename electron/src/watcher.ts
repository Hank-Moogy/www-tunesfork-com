// chokidar watcher — watches *.als files, debounces Ableton's multi-write save behavior,
// emits one event per logical save with the .als path.
import chokidar from "chokidar";
import path from "node:path";
import { Debouncer } from "./debouncer";

export type SaveHandler = (alsPath: string) => Promise<void> | void;

export function watchFolders(folders: string[], onSave: SaveHandler) {
  const debouncer = new Debouncer<string>(5000); // 5s quiet period

  const watcher = chokidar.watch(folders, {
    ignored: [
      /(^|[\/\\])\../,           // dotfiles
      /[\/\\]Backup[\/\\]/,      // Ableton's auto-saves
      /[\/\\]Samples[\/\\]Processed[\/\\]Crop[\/\\]/,
    ],
    persistent: true,
    depth: 8,
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 200 },
  });

  watcher.on("change", (filePath) => {
    if (path.extname(filePath).toLowerCase() !== ".als") return;
    debouncer.fire(filePath, () => onSave(filePath));
  });

  watcher.on("add", (filePath) => {
    if (path.extname(filePath).toLowerCase() !== ".als") return;
    debouncer.fire(filePath, () => onSave(filePath));
  });

  return () => watcher.close();
}
