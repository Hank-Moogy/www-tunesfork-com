const path = require("node:path");

const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 5 * 1024 * 1024 * 1024;
const MAX_LEGACY_EXPANDED_BYTES = 500 * 1024 * 1024 * 1024;

function safeRestoreDestination(destRoot, manifestPath) {
  if (typeof manifestPath !== "string" || !manifestPath || manifestPath.includes("\\") || manifestPath.includes("\0")) {
    throw new Error("Downloaded project contained an invalid path");
  }
  const segments = manifestPath.split("/");
  if (manifestPath.startsWith("/") || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Downloaded project contained an invalid path");
  }
  const root = path.resolve(destRoot);
  const destination = path.resolve(root, ...segments);
  if (!destination.startsWith(`${root}${path.sep}`)) {
    throw new Error("Downloaded project contained an invalid path");
  }
  return destination;
}

function validateLegacyZipEntries(entries, destRoot) {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > MAX_FILES) {
    throw new Error("Downloaded ZIP contains an invalid number of files");
  }
  const seenPaths = new Set();
  let totalUncompressedBytes = 0;
  for (const entry of entries) {
    const normalizedPath = String(entry.entryName || "").normalize("NFC");
    const pathToValidate = entry.isDirectory && normalizedPath.endsWith("/")
      ? normalizedPath.slice(0, -1)
      : normalizedPath;
    safeRestoreDestination(destRoot, pathToValidate);
    const collisionKey = pathToValidate.toLocaleLowerCase("en-US");
    if (seenPaths.has(collisionKey)) {
      throw new Error(`Downloaded ZIP contains colliding path ${pathToValidate}`);
    }
    seenPaths.add(collisionKey);
    const size = Number(entry.header?.size ?? 0);
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_FILE_BYTES) {
      throw new Error(`Downloaded ZIP contains an invalid file size for ${pathToValidate}`);
    }
    totalUncompressedBytes += size;
    if (!Number.isSafeInteger(totalUncompressedBytes) || totalUncompressedBytes > MAX_LEGACY_EXPANDED_BYTES) {
      throw new Error("Downloaded ZIP expands beyond the restore safety limit");
    }
  }
  return entries;
}

module.exports = {
  MAX_FILE_BYTES,
  safeRestoreDestination,
  validateLegacyZipEntries,
};
