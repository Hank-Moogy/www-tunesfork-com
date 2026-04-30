// Streaming zip of an Ableton Project folder.
// Skips Backup/, .DS_Store, Thumbs.db. Streams to disk to avoid loading 2GB into memory.
import archiver from "archiver";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const SKIP_DIRS = new Set(["Backup"]);
const SKIP_FILES = new Set([".DS_Store", "Thumbs.db"]);

export async function zipProjectFolder(projectFolder: string): Promise<{ zipPath: string; size: number }> {
  const tmpZip = path.join(os.tmpdir(), `tfsync-${Date.now()}.zip`);
  const out = fs.createWriteStream(tmpZip);
  const archive = archiver("zip", { zlib: { level: 0 } }); // STORE — already-compressed audio

  return new Promise((resolve, reject) => {
    out.on("close", () => resolve({ zipPath: tmpZip, size: archive.pointer() }));
    archive.on("error", reject);
    archive.pipe(out);

    const folderName = path.basename(projectFolder);
    walk(projectFolder, (filePath, rel) => {
      const parts = rel.split(path.sep);
      if (parts.some((p) => SKIP_DIRS.has(p))) return;
      if (SKIP_FILES.has(path.basename(filePath))) return;
      if (filePath.endsWith(".als~")) return;
      archive.file(filePath, { name: path.posix.join(folderName, ...parts) });
    });

    archive.finalize();
  });
}

function walk(root: string, cb: (filePath: string, rel: string) => void) {
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) cb(full, path.relative(root, full));
    }
  }
}
