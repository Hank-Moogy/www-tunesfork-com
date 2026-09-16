// Decisions that route an Ableton save to the right cloud project.
//
// A project folder that has been copied, moved or renamed loses its cloud
// identity, because projectLinks is keyed by absolute path. The save is then
// uploaded as a brand-new project owned by whoever saved it — so for a
// collaborator, their work never reaches the project they were invited to.
//
// Timing of save events is a separate concern, owned by save-event-policy.cjs.
const fsDefault = require("node:fs");
const path = require("node:path");

// ---------- folder → cloud project identity ----------

// Written inside the project folder so the mapping survives a copy, a move, a
// rename, or a manual import — none of which the path-keyed projectLinks table
// can follow. The leading dot keeps it out of both the chokidar watch (which
// ignores dotfiles) and the upload manifest (incremental-sync's shouldInclude
// skips names starting with "."), so it never becomes project content.
const MARKER_NAME = ".tunesfork-project.json";

function markerPath(projectFolder) {
  return path.join(path.resolve(projectFolder), MARKER_NAME);
}

function readProjectMarker(projectFolder, fs = fsDefault) {
  try {
    const parsed = JSON.parse(fs.readFileSync(markerPath(projectFolder), "utf8"));
    if (parsed?.schemaVersion !== 1) return null;
    if (typeof parsed.projectId !== "string" || !parsed.projectId) return null;
    return {
      projectId: parsed.projectId,
      projectName: typeof parsed.projectName === "string" ? parsed.projectName : null,
    };
  } catch {
    return null;
  }
}

function writeProjectMarker(projectFolder, { projectId, projectName }, fs = fsDefault) {
  if (!projectId) return;
  const body = JSON.stringify({
    schemaVersion: 1,
    projectId,
    projectName: projectName ?? null,
    updatedAt: Date.now(),
  });
  try {
    fs.writeFileSync(markerPath(projectFolder), body, { mode: 0o600 });
  } catch {
    // A read-only or externally-managed folder must not break the upload; the
    // path-keyed link still covers the common case.
  }
}

// Resolve which cloud project a save belongs to. The in-folder marker wins over
// the path table, because the path table is the thing that goes stale when the
// folder moves.
function resolveProjectLink({ projectFolder, projectLinks = {}, marker = null, normalize = path.resolve }) {
  const key = normalize(projectFolder);
  const link = projectLinks[key] ?? null;

  if (marker?.projectId && link?.projectId && marker.projectId !== link.projectId) {
    return { ...link, projectId: marker.projectId, lastContentHash: null, source: "marker-override" };
  }
  if (link?.projectId) return { ...link, source: "path" };
  if (marker?.projectId) {
    return {
      projectId: marker.projectId,
      projectName: marker.projectName ?? null,
      lastContentHash: null,
      lastVersion: null,
      lastVersionId: null,
      source: "marker",
    };
  }
  return link ? { ...link, source: "path" } : null;
}

// A folder that we handed to the user from the cloud ("Open in Ableton") always
// belongs to a cloud project. If we have lost the mapping for such a folder,
// uploading it creates a duplicate project owned by whoever saved it, and the
// project the user was actually collaborating on never moves. Refuse instead,
// with something the user can act on.
function classifySaveTarget({ resolved, projectFolder, restoreRoot, normalize = path.resolve }) {
  if (resolved?.projectId) {
    return { action: "upload", projectId: resolved.projectId, source: resolved.source };
  }
  if (restoreRoot) {
    const root = normalize(restoreRoot);
    const folder = normalize(projectFolder);
    if (folder === root || folder.startsWith(`${root}${path.sep}`)) {
      return {
        action: "blocked",
        code: "PROJECT_LINK_LOST",
        message:
          `Tunesfork restored "${path.basename(folder)}" from the cloud but has lost track of which project it belongs to, `
          + "so this save was not uploaded as a new, separate project. Open the project from Tunesfork again and save from that copy.",
      };
    }
  }
  return { action: "create", projectId: null, source: "new" };
}

module.exports = {
  MARKER_NAME,
  classifySaveTarget,
  markerPath,
  readProjectMarker,
  resolveProjectLink,
  writeProjectMarker,
};
