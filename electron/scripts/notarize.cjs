const { execFileSync, spawnSync } = require("node:child_process");
const path = require("node:path");

module.exports = async function notarizeBuild(context) {
  if (process.env.TUNESFORK_NOTARIZE !== "1") return;
  if (context.electronPlatformName !== "darwin" || context.appOutDir.endsWith("-temp")) return;

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const signatureResult = spawnSync("codesign", ["-dv", "--verbose=4", appPath], { encoding: "utf8" });
  if (signatureResult.status !== 0) throw new Error(signatureResult.stderr || "Could not verify app signature");
  const signature = `${signatureResult.stdout || ""}\n${signatureResult.stderr || ""}`;
  if (!signature.includes("Authority=Developer ID Application:")) {
    throw new Error("Public release requires a Developer ID Application signature; install the certificate or set CSC_LINK/CSC_KEY_PASSWORD");
  }

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  const appleApiKey = process.env.APPLE_API_KEY;
  const appleApiKeyId = process.env.APPLE_API_KEY_ID;
  const appleApiIssuer = process.env.APPLE_API_ISSUER;
  const hasAppleIdCredentials = appleId && appleIdPassword && teamId;
  const hasApiKeyCredentials = appleApiKey && appleApiKeyId && appleApiIssuer;
  if (!hasAppleIdCredentials && !hasApiKeyCredentials) {
    throw new Error(
      "Notarization requires APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID, or APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER",
    );
  }

  const { notarize } = require("@electron/notarize");
  await notarize({
    appPath,
    ...(hasApiKeyCredentials
      ? { appleApiKey, appleApiKeyId, appleApiIssuer }
      : { appleId, appleIdPassword, teamId }),
  });
  execFileSync("xcrun", ["stapler", "staple", appPath], { stdio: "inherit" });
};
