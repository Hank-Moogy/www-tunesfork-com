#!/usr/bin/env node
// Post-build sanity check: ensures the packaged app actually contains the
// runtime dependencies the sync engine needs. Fails loudly if any are missing
// so a broken DMG never reaches a tester again.

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const REQUIRED = [
  "chokidar",
  "archiver",
  "archiver-utils",
  "zip-stream",
  "compress-commons",
  "readable-stream",
  "adm-zip",
  "fast-xml-parser",
  "tus-js-client",
];
const releaseDir = path.join(__dirname, "..", "release");

if (!fs.existsSync(releaseDir)) {
  console.error("[verify-pack] No release/ directory found. Did electron-builder run?");
  process.exit(1);
}

function findAsars(dir) {
  const out = [];
  const walk = (d, depth = 0) => {
    if (depth > 6) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.isFile() && e.name === "app.asar") out.push(p);
    }
  };
  walk(dir);
  return out;
}

const asars = findAsars(releaseDir);
if (asars.length === 0) {
  console.error("[verify-pack] No app.asar files found inside release/.");
  process.exit(1);
}

let asarTool;
try {
  asarTool = require.resolve("@electron/asar/bin/asar.js");
} catch {
  try { asarTool = require.resolve("asar/bin/asar.js"); } catch {}
}

let failed = false;
for (const asar of asars) {
  console.log(`[verify-pack] Checking ${path.relative(releaseDir, asar)}`);
  let listing = "";
  if (asarTool) {
    try {
      listing = execSync(`node "${asarTool}" list "${asar}"`, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    } catch (e) {
      console.error(`[verify-pack]   Could not list asar: ${e.message}`);
      failed = true;
      continue;
    }
  } else {
    console.error("[verify-pack]   @electron/asar not installed — cannot inspect asar contents.");
    failed = true;
    continue;
  }
  for (const dep of REQUIRED) {
    const needle = `/node_modules/${dep}/package.json`;
    if (!listing.includes(needle)) {
      console.error(`[verify-pack]   MISSING: ${dep}`);
      failed = true;
    } else {
      console.log(`[verify-pack]   ok: ${dep}`);
    }
  }
}

if (failed) {
  console.error("[verify-pack] FAILED — packaged app is missing runtime deps. DO NOT ship this build.");
  process.exit(1);
}
console.log("[verify-pack] All required runtime deps are present in app.asar.");
