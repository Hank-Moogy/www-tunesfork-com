#!/usr/bin/env node
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

if (process.platform !== "darwin") throw new Error("macOS install smoke test must run on macOS");
const releaseDir = path.join(__dirname, "..", "release");
const dmg = fs.readdirSync(releaseDir).find((name) => name.endsWith(".dmg"));
if (!dmg) throw new Error("No DMG found in release/");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tunesfork-dmg-smoke-"));
const mountPoint = path.join(tempRoot, "mount");
const installDir = path.join(tempRoot, "Applications");
fs.mkdirSync(mountPoint);
fs.mkdirSync(installDir);

try {
  execFileSync("hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mountPoint, path.join(releaseDir, dmg)], { stdio: "inherit" });
  const appName = fs.readdirSync(mountPoint).find((name) => name.endsWith(".app"));
  if (!appName) throw new Error("DMG does not contain an app bundle");
  const sourceApp = path.join(mountPoint, appName);
  const installedApp = path.join(installDir, appName);
  execFileSync("ditto", [sourceApp, installedApp]);
  execFileSync("xattr", ["-w", "com.apple.quarantine", `0081;${Math.floor(Date.now() / 1000).toString(16)};TunesforkReleaseCI;`, installedApp]);
  execFileSync("codesign", ["--verify", "--deep", "--strict", "--verbose=4", installedApp], { stdio: "inherit" });
  execFileSync("xcrun", ["stapler", "validate", installedApp], { stdio: "inherit" });
  execFileSync("spctl", ["--assess", "--type", "execute", "--verbose=4", installedApp], { stdio: "inherit" });
  console.log(`[smoke-mac-install] Gatekeeper accepted quarantined ${appName}`);
} finally {
  try { execFileSync("hdiutil", ["detach", mountPoint, "-force"], { stdio: "ignore" }); } catch {}
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
