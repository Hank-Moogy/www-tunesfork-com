// Validate that every <SampleRef> in the parsed .als has a file actually
// present inside the project folder we're about to zip.
//
// Mirrors src/lib/als-parser.ts:validateFolder so web + desktop produce the
// same verdicts. Returns a compact JSON object suitable for storing on
// project_versions.sample_check.
const fs = require("fs");
const path = require("path");

function normalizePath(p) {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

function walk(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        // Skip Ableton's own backup/cache dirs to keep the index small.
        if (e.name === "Backup" || e.name === "Ableton Project Info") continue;
        stack.push(full);
      } else if (e.isFile()) {
        const rel = normalizePath(path.relative(root, full));
        out.push(rel);
      }
    }
  }
  return out;
}

/**
 * @param {string} projectFolder absolute path to the project folder being zipped
 * @param {Array<{relativePath: string|null, absolutePath: string|null, hasRelativePath: boolean}>} samples
 */
function buildSampleCheck(projectFolder, samples) {
  if (!Array.isArray(samples)) samples = [];
  const files = walk(projectFolder);
  const set = new Set(files);

  const isPresent = (rel) => {
    const target = normalizePath(rel);
    if (set.has(target)) return true;
    return files.some((u) => u === target || u.endsWith("/" + target));
  };

  const missingPaths = [];
  const externalPaths = [];
  let included = 0;

  for (const s of samples) {
    if (!s.relativePath || !s.hasRelativePath) {
      if (s.absolutePath) externalPaths.push(s.absolutePath);
      continue;
    }
    if (isPresent(s.relativePath)) {
      included += 1;
    } else {
      missingPaths.push(s.relativePath);
    }
  }

  return {
    included,
    missing: missingPaths.length,
    external: externalPaths.length,
    missing_paths: missingPaths.slice(0, 10),
    external_paths: externalPaths.slice(0, 10),
  };
}

module.exports = { buildSampleCheck };
