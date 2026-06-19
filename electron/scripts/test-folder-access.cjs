const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  assertFolderReadable,
  folderAccessMessage,
  isFolderPermissionError,
} = require("../folder-access.cjs");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tunesfork-folder-access-"));
try {
  assert.equal(assertFolderReadable(tmp), path.resolve(tmp));

  const file = path.join(tmp, "not-a-folder");
  fs.writeFileSync(file, "x");
  assert.throws(() => assertFolderReadable(file), (error) => error.code === "ENOTDIR");

  assert.equal(isFolderPermissionError({ code: "EPERM" }), true);
  assert.equal(isFolderPermissionError({ code: "EACCES" }), true);
  assert.equal(isFolderPermissionError({ code: "ENOENT" }), false);

  const permissionMessage = folderAccessMessage(tmp, { code: "EPERM" });
  assert.match(permissionMessage, /Privacy & Security/);
  assert.match(permissionMessage, /Choose the folder again/);

  const missingMessage = folderAccessMessage(path.join(tmp, "missing"), { code: "ENOENT" });
  assert.match(missingMessage, /no longer exists/);

  console.log("[test-folder-access] ok");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
