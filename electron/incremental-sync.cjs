const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const MANIFEST_SCHEMA_VERSION = 1;
const READ_BUFFER_SIZE = 4 * 1024 * 1024;

function hashFile(filePath) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.allocUnsafe(READ_BUFFER_SIZE);
    let bytesRead;
    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function logicalAlsHash(filePath, byteHash) {
  try {
    const xml = zlib.gunzipSync(fs.readFileSync(filePath));
    return crypto.createHash("sha256").update(xml).digest("hex");
  } catch {
    return byteHash;
  }
}

function readHashCache(cacheFile) {
  try {
    const parsed = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    if (parsed?.schemaVersion === 1 && parsed.entries && typeof parsed.entries === "object") {
      return parsed.entries;
    }
  } catch {}
  return {};
}

function writeHashCache(cacheFile, entries) {
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  const tmp = `${cacheFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ schemaVersion: 1, entries }), { mode: 0o600 });
  fs.renameSync(tmp, cacheFile);
}

function shouldInclude(entryName) {
  return !entryName.startsWith(".")
    && entryName !== "Thumbs.db"
    && !entryName.endsWith(".als~");
}

function manifestPath(projectFolder, relativePath) {
  return [path.basename(projectFolder), ...relativePath.split(path.sep)]
    .filter(Boolean)
    .join("/")
    .normalize("NFC");
}

function buildProjectManifest(projectFolder, cacheFile) {
  const root = path.resolve(projectFolder);
  const cache = readHashCache(cacheFile);
  const seen = new Set();
  const files = [];
  const normalizedPaths = new Set();
  const stack = [root];
  let bytesHashed = 0;

  while (stack.length) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!shouldInclude(entry.name)) continue;
      const absolutePath = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (entry.name !== "Backup") stack.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;

      const stat = fs.statSync(absolutePath);
      if (stat.size > 5 * 1024 * 1024 * 1024) {
        throw new Error(`${entry.name} is larger than the 5 GB per-file launch limit`);
      }
      const prior = cache[absolutePath];
      const cacheHit = prior
        && prior.size === stat.size
        && prior.mtimeMs === stat.mtimeMs
        && typeof prior.sha256 === "string";
      const sha256 = cacheHit ? prior.sha256 : hashFile(absolutePath);
      const isAls = entry.name.toLowerCase().endsWith(".als");
      const logicalSha256 = cacheHit && prior.logicalSha256
        ? prior.logicalSha256
        : isAls ? logicalAlsHash(absolutePath, sha256) : sha256;
      if (!cacheHit) bytesHashed += stat.size;

      cache[absolutePath] = {
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        sha256,
        logicalSha256,
      };
      seen.add(absolutePath);
      const relativeManifestPath = manifestPath(root, path.relative(root, absolutePath));
      const collisionKey = relativeManifestPath.toLocaleLowerCase("en-US");
      if (normalizedPaths.has(collisionKey)) {
        throw new Error(`Project contains colliding file paths: ${relativeManifestPath}`);
      }
      normalizedPaths.add(collisionKey);
      files.push({
        path: relativeManifestPath,
        sha256,
        logical_sha256: logicalSha256 === sha256 ? undefined : logicalSha256,
        size: stat.size,
        mtime_ms: stat.mtimeMs,
        source_path: absolutePath,
      });
      if (files.length > 20_000) {
        throw new Error("Project contains more than the 20,000-file launch limit");
      }
    }
  }

  for (const cachedPath of Object.keys(cache)) {
    if (cachedPath === root || cachedPath.startsWith(`${root}${path.sep}`)) {
      if (!seen.has(cachedPath)) delete cache[cachedPath];
    }
  }
  writeHashCache(cacheFile, cache);

  files.sort((a, b) => a.path.localeCompare(b.path));
  if (!files.some((file) => file.path.toLowerCase().endsWith(".als"))) {
    throw new Error("Project manifest does not contain an Ableton .als file");
  }
  const aggregate = files.map((file) => `${file.path}\0${file.logical_sha256 || file.sha256}`).join("\n");
  const projectHash = crypto.createHash("sha256").update(aggregate).digest("hex");
  const logicalSize = files.reduce((sum, file) => sum + file.size, 0);
  return {
    projectHash,
    logicalSize,
    bytesHashed,
    manifest: {
      schema_version: MANIFEST_SCHEMA_VERSION,
      files,
    },
  };
}

function manifestForApi(manifest) {
  return {
    schema_version: manifest.schema_version,
    files: manifest.files.map(({ source_path: _sourcePath, ...file }) => file),
  };
}

module.exports = {
  MANIFEST_SCHEMA_VERSION,
  buildProjectManifest,
  hashFile,
  manifestForApi,
  readHashCache,
};
