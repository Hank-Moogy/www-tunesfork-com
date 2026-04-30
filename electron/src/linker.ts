// Maps local Project folder paths to Tunesfork project IDs.
// Stored in ~/Library/Application Support/Tunesfork Sync/links.json (or platform equivalent).
//
// On first encounter of a new folder, we surface a UI prompt: "Link to existing project" or
// "Create new". For M2 alpha we default to "create new" silently, then let the user re-map
// from the tray UI.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

type Link = { projectFolder: string; projectId?: string; projectName: string; userId: string };

function storePath() {
  const dir = path.join(
    os.homedir(),
    process.platform === "darwin"
      ? "Library/Application Support/Tunesfork Sync"
      : process.platform === "win32"
      ? "AppData/Roaming/Tunesfork Sync"
      : ".config/tunesfork-sync",
  );
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "links.json");
}

function read(): Link[] {
  try { return JSON.parse(fs.readFileSync(storePath(), "utf8")); } catch { return []; }
}
function write(links: Link[]) { fs.writeFileSync(storePath(), JSON.stringify(links, null, 2)); }

export async function getLink(projectFolder: string): Promise<Link | null> {
  return read().find((l) => l.projectFolder === projectFolder) ?? null;
}

export async function ensureLink(projectFolder: string): Promise<Link> {
  const existing = await getLink(projectFolder);
  if (existing) return existing;
  const newLink: Link = {
    projectFolder,
    projectName: path.basename(projectFolder).replace(/ Project$/i, ""),
    userId: "", // filled from token on first upload
  };
  write([...read(), newLink]);
  return newLink;
}

export async function setProjectId(projectFolder: string, projectId: string) {
  const links = read().map((l) => l.projectFolder === projectFolder ? { ...l, projectId } : l);
  write(links);
}
