const assert = require("node:assert/strict");
const test = require("node:test");
const {
  decideRestoreTarget, findDuplicateWatchFolders, reviewCopyPath, workingCopyPath,
} = require("../working-copy.cjs");

const ROOT = "/Users/x/TunesFork/Projects";
const PID = "1bf30319-efb2-4c4a-9db0-118022a23a23";

test("a project has one stable folder, not one per restore", () => {
  const a = workingCopyPath(ROOT, "Amalhea", PID);
  const b = workingCopyPath(ROOT, "Amalhea", PID);
  assert.equal(a, b);
  assert.equal(a, `${ROOT}/Amalhea [1bf30319]`);
  // no version, no clock — those are what produced eight folders for one project
  assert.doesNotMatch(a, /\d{10,}/);
  assert.doesNotMatch(a, /\bV\d/);
});

test("names that would escape the folder are neutralised", () => {
  assert.equal(workingCopyPath(ROOT, "../../etc/passwd", PID), `${ROOT}/.._.._etc_passwd [1bf30319]`);
  assert.equal(workingCopyPath(ROOT, "", PID), `${ROOT}/Project [1bf30319]`);
});

test("a first restore creates the working copy and watches it", () => {
  const d = decideRestoreTarget({ root: ROOT, projectId: PID, projectName: "Amalhea", folderExists: false });
  assert.equal(d.mode, "create");
  assert.equal(d.watch, true);
  assert.equal(d.folder, `${ROOT}/Amalhea [1bf30319]`);
});

test("an untouched copy is safe to update in place", () => {
  const d = decideRestoreTarget({
    root: ROOT, projectId: PID, projectName: "Amalhea",
    folderExists: true, contentHash: "abc", baseContentHash: "abc",
  });
  assert.equal(d.mode, "update");
});

test("a copy with unshared work is never overwritten", () => {
  const d = decideRestoreTarget({
    root: ROOT, projectId: PID, projectName: "Amalhea",
    folderExists: true, contentHash: "local-edits", baseContentHash: "abc",
  });
  assert.equal(d.mode, "blocked");
  assert.match(d.reason, /changes that are not in Tunesfork/);
});

test("not knowing counts as unsafe, not as safe", () => {
  // a restore-created folder carries lastContentHash: null
  const d = decideRestoreTarget({
    root: ROOT, projectId: PID, projectName: "Amalhea",
    folderExists: true, contentHash: "abc", baseContentHash: null,
  });
  assert.equal(d.mode, "blocked");
  assert.match(d.reason, /cannot tell/);
});

test("reviewing a fork never touches the working copy, and is not watched", () => {
  const d = decideRestoreTarget({
    root: ROOT, projectId: PID, projectName: "Amalhea", versionId: "deadbeef-1111", isReview: true,
    folderExists: true, contentHash: "abc", baseContentHash: "abc",
  });
  assert.equal(d.mode, "review");
  assert.equal(d.watch, false);
  assert.notEqual(d.folder, workingCopyPath(ROOT, "Amalhea", PID));
  assert.equal(d.folder, reviewCopyPath(ROOT, "Amalhea", PID, "deadbeef-1111"));
});

test("stale twins are found, newest kept, and nothing is deleted", () => {
  const folders = ["/w/Amalhea [1bf30319]", "/w/old-Amalhea", "/w/Breaks"];
  const links = {
    "/w/Amalhea [1bf30319]": { projectId: PID, updatedAt: 3000, projectName: "Amalhea" },
    "/w/old-Amalhea": { projectId: PID, updatedAt: 1000, projectName: "Amalhea" },
    "/w/Breaks": { projectId: "other", updatedAt: 2000, projectName: "Breaks" },
  };
  const dupes = findDuplicateWatchFolders(folders, links);
  assert.equal(dupes.length, 1);
  assert.equal(dupes[0].folder, "/w/old-Amalhea");
  assert.equal(dupes[0].keeping, "/w/Amalhea [1bf30319]");
});

test("a single copy of each project reports nothing to clean up", () => {
  assert.deepEqual(findDuplicateWatchFolders(["/w/a"], { "/w/a": { projectId: PID, updatedAt: 1 } }), []);
  assert.deepEqual(findDuplicateWatchFolders([], {}), []);
});
