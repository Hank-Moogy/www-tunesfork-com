const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  MARKER_NAME,
  classifySaveTarget,
  readProjectMarker,
  resolveProjectLink,
  writeProjectMarker,
} = require("../save-routing.cjs");

const OWNER_PROJECT_ID = "1bf30319-efb2-4c4a-9db0-118022a23a23";

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tf-save-routing-"));
}

test("a contributor save in a linked folder targets the owner's existing project", () => {
  const folder = path.join(tmpdir(), "Amalhea Project");
  const resolved = resolveProjectLink({
    projectFolder: folder,
    projectLinks: {
      [path.resolve(folder)]: { projectId: OWNER_PROJECT_ID, projectName: "Amalhea", lastContentHash: "abc" },
    },
  });
  assert.equal(resolved.projectId, OWNER_PROJECT_ID);
  assert.equal(resolved.source, "path");
  assert.deepEqual(
    classifySaveTarget({ resolved, projectFolder: folder, restoreRoot: null }),
    { action: "upload", projectId: OWNER_PROJECT_ID, source: "path" },
  );
});

test("the in-folder marker survives moving the project somewhere else", () => {
  const root = tmpdir();
  const restored = path.join(root, "TunesFork", "Projects", "Amalhea [1bf30319] V2 aaaa-1", "Amalhea Project");
  fs.mkdirSync(restored, { recursive: true });
  writeProjectMarker(restored, { projectId: OWNER_PROJECT_ID, projectName: "Amalhea" });
  assert.deepEqual(readProjectMarker(restored), { projectId: OWNER_PROJECT_ID, projectName: "Amalhea" });

  // The user drags the project into their own "Ableton" folder and watches that
  // instead; projectLinks is keyed by path, so it no longer matches.
  const moved = path.join(root, "Ableton", "Amalhea Project");
  fs.mkdirSync(path.dirname(moved), { recursive: true });
  fs.renameSync(restored, moved);

  const resolved = resolveProjectLink({
    projectFolder: moved,
    projectLinks: { [path.resolve(restored)]: { projectId: OWNER_PROJECT_ID } },
    marker: readProjectMarker(moved),
  });
  assert.equal(resolved.projectId, OWNER_PROJECT_ID);
  assert.equal(resolved.source, "marker");
  // A move must not be mistaken for "unchanged since last upload" and skipped.
  assert.equal(resolved.lastContentHash, null);
});

test("the marker is hidden from both the watcher and the upload manifest", () => {
  assert.ok(MARKER_NAME.startsWith("."));
});

test("a restored folder with no mapping is blocked, not uploaded as a new project", () => {
  const root = tmpdir();
  const restoreRoot = path.join(root, "TunesFork", "Projects");
  const folder = path.join(restoreRoot, "Amalhea [1bf30319] V2 aaaa-1", "Amalhea Project");
  const target = classifySaveTarget({ resolved: null, projectFolder: folder, restoreRoot });
  assert.equal(target.action, "blocked");
  assert.equal(target.code, "PROJECT_LINK_LOST");
  assert.match(target.message, /Amalhea Project/);
});

test("a genuinely new project outside the restore root is still created", () => {
  const root = tmpdir();
  const target = classifySaveTarget({
    resolved: null,
    projectFolder: path.join(root, "Ableton", "New Idea Project"),
    restoreRoot: path.join(root, "TunesFork", "Projects"),
  });
  assert.equal(target.action, "create");
  assert.equal(target.projectId, null);
});

test("the marker wins when a stale path link points at a different project", () => {
  const folder = path.join(tmpdir(), "Amalhea Project");
  const resolved = resolveProjectLink({
    projectFolder: folder,
    projectLinks: {
      [path.resolve(folder)]: { projectId: "00000000-0000-4000-8000-000000000000", lastContentHash: "stale" },
    },
    marker: { projectId: OWNER_PROJECT_ID, projectName: "Amalhea" },
  });
  assert.equal(resolved.projectId, OWNER_PROJECT_ID);
  assert.equal(resolved.source, "marker-override");
  assert.equal(resolved.lastContentHash, null);
});

test("an unreadable or wrong-schema marker is ignored", () => {
  const folder = path.join(tmpdir(), "Broken Project");
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, MARKER_NAME), "{not json");
  assert.equal(readProjectMarker(folder), null);
  fs.writeFileSync(path.join(folder, MARKER_NAME), JSON.stringify({ schemaVersion: 2, projectId: OWNER_PROJECT_ID }));
  assert.equal(readProjectMarker(folder), null);
});
