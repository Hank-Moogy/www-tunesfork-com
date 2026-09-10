#!/usr/bin/env node
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

if (process.platform !== "darwin") throw new Error("Packaged launch smoke test must run on macOS");

const releaseDir = path.join(__dirname, "..", "release");
const dmgName = fs.readdirSync(releaseDir).find((name) => name.endsWith(".dmg"));
if (!dmgName) throw new Error("No DMG found in release/");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tunesfork-launch-smoke-"));
const mountPoint = path.join(tempRoot, "mount");
const installDir = path.join(tempRoot, "Applications");
const stateDir = path.join(tempRoot, "state");
fs.mkdirSync(mountPoint);
fs.mkdirSync(installDir);
let mounted = false;
let child = null;
let output = "";
let exit = null;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

(async () => {
  try {
    execFileSync("hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mountPoint, path.join(releaseDir, dmgName)]);
    mounted = true;
    const appName = fs.readdirSync(mountPoint).find((name) => name.endsWith(".app"));
    if (!appName) throw new Error("DMG does not contain an app bundle");
    const installedApp = path.join(installDir, appName);
    execFileSync("ditto", [path.join(mountPoint, appName), installedApp]);
    const executable = path.join(installedApp, "Contents", "MacOS", path.basename(appName, ".app"));
    child = spawn(executable, ["--enable-logging=stderr"], {
      env: {
        ...process.env,
        TUNESFORK_STATE_DIR: stateDir,
        TUNESFORK_SKIP_PROTOCOL_REGISTRATION: "1",
        ELECTRON_ENABLE_LOGGING: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.once("exit", (code, signal) => { exit = { code, signal }; });
    await wait(3000);
    if (exit) {
      throw new Error(`Packaged app exited during startup (${JSON.stringify(exit)}):\n${output.slice(-4000)}`);
    }
    console.log("[smoke-packaged-launch] App copied from the DMG remained healthy through startup.");
  } finally {
    if (child && !exit) {
      child.kill("SIGTERM");
      await Promise.race([new Promise((resolve) => child.once("exit", resolve)), wait(3000)]);
      if (exit === null) child.kill("SIGKILL");
    }
    if (mounted) {
      try { execFileSync("hdiutil", ["detach", mountPoint, "-force"]); } catch {}
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(`[smoke-packaged-launch] ${error.message}`);
  process.exit(1);
});
