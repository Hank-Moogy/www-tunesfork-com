const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const functionsUrl = process.env.TUNESFORK_FUNCTIONS_URL
  || "https://urrxrntdkmmmqqwaihfj.supabase.co/functions/v1";
const stateDir = process.env.TUNESFORK_STATE_DIR || path.join(
  os.homedir(),
  process.platform === "darwin" ? "Library/Application Support/Tunesfork Sync"
  : process.platform === "win32" ? "AppData/Roaming/Tunesfork Sync"
  : ".config/tunesfork-sync",
);

async function expectOk(response, label) {
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${label} failed (${response.status}): ${body.slice(0, 300)}`);
  }
  return response;
}

async function main() {
  const release = await fetch(
    "https://github.com/Hank-Moogy/www-tunesfork-com/releases/latest/download/Tunesfork-Sync-mac-universal.dmg",
    { method: "HEAD", redirect: "follow" },
  );
  await expectOk(release, "latest macOS release");
  console.log(`[smoke-backend] release asset: ${release.status}`);

  const pair = await expectOk(await fetch(`${functionsUrl}/pair-device-init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_name: "Tunesfork release smoke test" }),
  }), "pair-device-init");
  const pairBody = await pair.json();
  if (!/^[A-Z2-9]{6}$/.test(pairBody.code || "") || !String(pairBody.pair_url || "").includes("/desktop-pair?code=")) {
    throw new Error("pair-device-init returned an invalid pairing payload");
  }
  console.log("[smoke-backend] pairing endpoint: ok");

  const token = fs.readFileSync(path.join(stateDir, "token"), "utf8").trim();
  const state = JSON.parse(fs.readFileSync(path.join(stateDir, "state.json"), "utf8"));
  const projectId = process.env.TUNESFORK_SMOKE_PROJECT_ID
    || Object.values(state.projectLinks || {}).find((link) => link?.projectId)?.projectId;
  if (!token || !projectId) throw new Error("No paired token/project is available for authenticated smoke checks");

  const download = await expectOk(await fetch(`${functionsUrl}/get-version-download-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ project_id: projectId }),
  }), "get-version-download-url");
  const downloadBody = await download.json();
  if (!downloadBody.signedUrl) throw new Error("get-version-download-url returned no signedUrl");

  const range = await fetch(downloadBody.signedUrl, {
    headers: { Range: "bytes=0-3" },
  });
  if (!(range.ok || range.status === 206)) {
    throw new Error(`signed project download failed (${range.status})`);
  }
  const signature = new Uint8Array(await range.arrayBuffer());
  if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
    throw new Error("signed project download did not return a ZIP");
  }
  console.log("[smoke-backend] authenticated project download: ok");
}

main().catch((error) => {
  console.error(`[smoke-backend] ${error.message}`);
  process.exit(1);
});
