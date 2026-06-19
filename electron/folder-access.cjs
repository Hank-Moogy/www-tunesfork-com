const fs = require("node:fs");
const path = require("node:path");

function isFolderPermissionError(error) {
  return error?.code === "EPERM" || error?.code === "EACCES";
}

function assertFolderReadable(folder) {
  const resolved = path.resolve(folder);
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    const error = new Error(`Not a folder: ${resolved}`);
    error.code = "ENOTDIR";
    error.path = resolved;
    throw error;
  }
  fs.readdirSync(resolved);
  return resolved;
}

function folderAccessMessage(folder, error) {
  const resolved = path.resolve(folder);
  if (isFolderPermissionError(error)) {
    return `macOS blocked access to "${resolved}". Choose the folder again in Tunesfork Sync, or allow Tunesfork Sync under System Settings → Privacy & Security → Files and Folders.`;
  }
  if (error?.code === "ENOENT") {
    return `The watched folder no longer exists: "${resolved}". Remove it or choose its new location.`;
  }
  return `Tunesfork Sync cannot read "${resolved}": ${error?.message || String(error)}`;
}

module.exports = {
  assertFolderReadable,
  folderAccessMessage,
  isFolderPermissionError,
};
