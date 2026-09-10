const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const {
  MAX_FILE_BYTES,
  safeRestoreDestination,
  validateLegacyZipEntries,
} = require("../restore-validation.cjs");

const restoreRoot = path.resolve("/tmp/tunesfork-restore-validation");
const entry = (entryName, size = 1, isDirectory = false) => ({
  entryName,
  isDirectory,
  header: { size },
});

test("keeps normalized restore paths inside the version folder", () => {
  assert.equal(
    safeRestoreDestination(restoreRoot, "Demo Project/Samples/kick.wav"),
    path.join(restoreRoot, "Demo Project/Samples/kick.wav"),
  );
  for (const unsafe of ["../escape.als", "/absolute.als", "folder/../escape.als", "folder\\escape.als", "bad\0name.als"]) {
    assert.throws(() => safeRestoreDestination(restoreRoot, unsafe), /invalid path/);
  }
});

test("rejects legacy ZIP collisions and oversized entries before extraction", () => {
  assert.throws(() => validateLegacyZipEntries([
    entry("Demo Project/Track.als"),
    entry("Demo Project/track.als"),
  ], restoreRoot), /colliding path/);
  assert.throws(() => validateLegacyZipEntries([
    entry("Demo Project/Track.als", MAX_FILE_BYTES + 1),
  ], restoreRoot), /invalid file size/);
});

test("accepts a normal legacy project ZIP entry set", () => {
  const entries = [
    entry("Demo Project/", 0, true),
    entry("Demo Project/Demo.als", 42),
    entry("Demo Project/Samples/kick.wav", 128),
  ];
  assert.equal(validateLegacyZipEntries(entries, restoreRoot), entries);
});
