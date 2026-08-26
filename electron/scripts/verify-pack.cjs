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
const REQUIRED_APP_FILES = [
  "/main.cjs",
  "/preload.cjs",
  "/folder-access.cjs",
  "/als-parser.cjs",
  "/sample-check.cjs",
  "/incremental-sync.cjs",
  "/dist/index.html",
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
let asarApi;
try {
  asarTool = require.resolve("@electron/asar/bin/asar.js");
  asarApi = require("@electron/asar");
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
  for (const appFile of REQUIRED_APP_FILES) {
    if (!listing.includes(appFile)) {
      console.error(`[verify-pack]   MISSING APP FILE: ${appFile}`);
      failed = true;
    } else {
      console.log(`[verify-pack]   ok: ${appFile}`);
    }
  }
  if (listing.split(/\r?\n/).some((entry) => entry.startsWith("/src/"))) {
    console.error("[verify-pack]   DEV SOURCE INCLUDED: /src/");
    failed = true;
  } else {
    console.log("[verify-pack]   ok: no dev source directory");
  }
  if (asarApi) {
    for (const runtimeFile of ["main.cjs", "preload.cjs"]) {
      const runtimeSource = asarApi.extractFile(asar, runtimeFile).toString("utf8");
      if (/https?:\/\/(localhost|127\.0\.0\.1)/i.test(runtimeSource)) {
        console.error(`[verify-pack]   LOCALHOST RUNTIME URL: ${runtimeFile}`);
        failed = true;
      }
      if (/\/Users\/[A-Za-z0-9._-]+\//.test(runtimeSource)) {
        console.error(`[verify-pack]   MACHINE-SPECIFIC RUNTIME PATH: ${runtimeFile}`);
        failed = true;
      }
    }
  }
}

if (process.platform === "darwin") {
  const apps = [];
  const findApps = (dir, depth = 0) => {
    if (depth > 4) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name.endsWith(".app")) apps.push(full);
      else if (entry.isDirectory()) findApps(full, depth + 1);
    }
  };
  findApps(releaseDir);

  for (const app of apps) {
    try {
      execSync(`codesign --verify --deep --strict "${app}"`, { stdio: "pipe" });
      const details = execSync(`codesign -dv --verbose=4 "${app}" 2>&1`, { encoding: "utf8" });
      if (!details.includes("Identifier=com.tunesfork.sync")) {
        console.error(`[verify-pack]   INVALID SIGNING IDENTITY: ${app}`);
        failed = true;
      } else {
        console.log(`[verify-pack]   ok: signature identifier com.tunesfork.sync`);
      }
      if (!/flags=0x[0-9a-f]+\([^)]*runtime[^)]*\)/i.test(details)) {
        console.error(`[verify-pack]   HARDENED RUNTIME MISSING: ${app}`);
        failed = true;
      } else {
        console.log("[verify-pack]   ok: hardened runtime");
      }
      const info = execSync(`plutil -p "${path.join(app, "Contents", "Info.plist")}"`, { encoding: "utf8" });
      for (const key of [
        "NSDocumentsFolderUsageDescription",
        "NSDesktopFolderUsageDescription",
        "NSDownloadsFolderUsageDescription",
      ]) {
        if (!info.includes(key)) {
          console.error(`[verify-pack]   MISSING INFO.PLIST KEY: ${key}`);
          failed = true;
        } else {
          console.log(`[verify-pack]   ok: ${key}`);
        }
      }
      if (!info.includes("CFBundleURLSchemes") || !info.includes('"tunesfork"')) {
        console.error(`[verify-pack]   MISSING URL PROTOCOL: tunesfork`);
        failed = true;
      } else {
        console.log("[verify-pack]   ok: tunesfork:// protocol");
      }
      const electronBinary = path.join(app, "Contents", "MacOS", path.basename(app, ".app"));
      const architectures = execSync(`lipo -archs "${electronBinary}"`, { encoding: "utf8" }).trim();
      if (!architectures.includes("arm64") || !architectures.includes("x86_64")) {
        console.error(`[verify-pack]   NOT UNIVERSAL: ${architectures}`);
        failed = true;
      } else {
        console.log(`[verify-pack]   ok: universal (${architectures})`);
      }
    } catch (error) {
      console.error(`[verify-pack]   macOS bundle verification failed: ${error.message}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error("[verify-pack] FAILED — packaged app is missing runtime deps. DO NOT ship this build.");
  process.exit(1);
}
console.log("[verify-pack] All required runtime deps are present in app.asar.");
