// Walk upward from an .als file to find the Ableton Project folder
// (the directory that contains an "Ableton Project Info" sibling folder).
import fs from "node:fs";
import path from "node:path";

export function findProjectFolder(alsPath: string): string | null {
  let dir = path.dirname(alsPath);
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "Ableton Project Info"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: the .als's own directory (loose .als files without a project structure)
  return path.dirname(alsPath);
}
