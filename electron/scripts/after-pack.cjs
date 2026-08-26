const path = require("node:path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  // Release builds are recursively signed by electron-builder using the
  // Developer ID identity discovered from CSC_* or the login keychain.
  if (process.env.TUNESFORK_NOTARIZE === "1") return;
  // electron-builder creates x64/arm64 temp apps before merging a universal
  // app. Signing those temp bundles changes CodeResources and makes the merge
  // fail because non-binary files no longer match.
  if (context.appOutDir.endsWith("-temp")) return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  const { signAsync } = require("@electron/osx-sign");
  const localEntitlements = path.join(__dirname, "..", "build", "entitlements.local.plist");
  await signAsync({
    app: appPath,
    platform: "darwin",
    identity: "-",
    identityValidation: false,
    preAutoEntitlements: false,
    optionsForFile: () => ({
      entitlements: localEntitlements,
      hardenedRuntime: true,
    }),
  });
  console.log(`[after-pack] Recursively ad-hoc signed ${appPath} as com.tunesfork.sync`);
};
