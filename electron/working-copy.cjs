// Where a project lives on this machine, and whether it is safe to write there.
//
// Every restore used to mint a new directory stamped with the version and the
// clock, so opening the same project three times left three folders, all
// watched, two of them stale. Saving in the wrong one uploaded old work over
// new. A project should have one working copy per machine.
//
// Reviewing a fork is deliberately not that. A pending contribution is not the
// project's state, and materialising it over the owner's own copy would destroy
// unshared work to look at someone else's. It gets a separate, obviously
// temporary folder.
const path = require("node:path");

function safeName(projectName) {
  return String(projectName || "Project").replace(/[\\/:*?"<>|]/g, "_").trim() || "Project";
}

function shortId(id) {
  return String(id || "").slice(0, 8);
}

// Stable across restores: no version number, no timestamp.
function workingCopyPath(root, projectName, projectId) {
  return path.join(root, `${safeName(projectName)} [${shortId(projectId)}]`);
}

function reviewCopyPath(root, projectName, projectId, versionId) {
  return path.join(root, `${safeName(projectName)} [${shortId(projectId)}] review ${shortId(versionId)}`);
}

/**
 * Decide where a restore should land and whether writing there is safe.
 *
 * `contentHash` is what the folder holds right now; `baseContentHash` is what
 * Tunesfork last uploaded from it. Equal means nothing has happened locally
 * since, so replacing the contents loses nothing. Different means there is
 * unshared work in there, and overwriting it is not ours to do.
 */
function decideRestoreTarget({
  root,
  projectId,
  projectName,
  versionId,
  isReview = false,
  existingFolder = null,
  folderExists = false,
  contentHash = null,
  baseContentHash = null,
}) {
  if (isReview) {
    return {
      mode: "review",
      folder: reviewCopyPath(root, projectName, projectId, versionId),
      watch: false,
      reason: "A fork is not the project's state, so it opens in its own folder and is not watched.",
    };
  }

  const folder = existingFolder || workingCopyPath(root, projectName, projectId);
  if (!folderExists) {
    return { mode: "create", folder, watch: true, reason: null };
  }
  if (contentHash && baseContentHash && contentHash === baseContentHash) {
    return { mode: "update", folder, watch: true, reason: null };
  }
  if (!contentHash || !baseContentHash) {
    // We cannot prove the folder is untouched, so we do not act as if it is.
    return {
      mode: "blocked",
      folder,
      watch: true,
      reason: "Tunesfork cannot tell whether this folder has unsaved changes, so it opened your existing copy instead of replacing it.",
    };
  }
  return {
    mode: "blocked",
    folder,
    watch: true,
    reason: "Your copy of this project has changes that are not in Tunesfork. It opened your copy rather than overwriting them.",
  };
}

// Watch entries that point at an older restore of a project already watched
// elsewhere. Reported, never removed on the app's own initiative: they may hold
// work nobody has uploaded.
function findDuplicateWatchFolders(folders, projectLinks = {}, normalize = path.resolve) {
  const byProject = new Map();
  for (const folder of folders || []) {
    const link = projectLinks[normalize(folder)];
    if (!link?.projectId) continue;
    const list = byProject.get(link.projectId) || [];
    list.push({ folder: normalize(folder), updatedAt: Number(link.updatedAt) || 0, projectName: link.projectName || null });
    byProject.set(link.projectId, list);
  }
  const duplicates = [];
  for (const [projectId, list] of byProject) {
    if (list.length < 2) continue;
    // Keep the most recently written copy; everything older is a stale twin.
    const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
    for (const stale of sorted.slice(1)) {
      duplicates.push({ ...stale, projectId, keeping: sorted[0].folder });
    }
  }
  return duplicates;
}

module.exports = {
  decideRestoreTarget,
  findDuplicateWatchFolders,
  reviewCopyPath,
  safeName,
  shortId,
  workingCopyPath,
};
