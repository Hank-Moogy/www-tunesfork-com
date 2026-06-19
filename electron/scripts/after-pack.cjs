const { spawnSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  // electron-builder creates x64/arm64 temp apps before merging a universal
  // app. Signing those temp bundles changes CodeResources and makes the merge
  // fail because non-binary files no longer match.
  if (context.appOutDir.endsWith("-temp")) return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  const result = spawnSync("codesign", [
    "--force",
    "--deep",
    "--sign",
    "-",
    "--identifier",
    "com.tunesfork.sync",
    appPath,
  ], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(
      `Ad-hoc signing failed for ${appPath}: ${result.stderr || result.stdout}`,
    );
  }
  console.log(`[after-pack] Ad-hoc signed ${appPath} as com.tunesfork.sync`);
};
