const assert = require("node:assert/strict");
const test = require("node:test");
const {
  findUnbackedProjects, shouldNotifyUnbacked, signatureOf, unbackedNotification,
} = require("../backup-coverage.cjs");

const project = (folder) => ({ folder, alsPath: `${folder}/x.als` });

test("finds projects in a watched folder that have never reached the cloud", () => {
  const unbacked = findUnbackedProjects(
    [project("/w/Amalhea Project"), project("/w/Sketch Project"), project("/w/Demo Project")],
    {
      "/w/Amalhea Project": { projectId: "p1", folder: "/w/Amalhea Project" },
      "/w/Sketch Project": { projectId: null, folder: "/w/Sketch Project" },
    },
  );
  // a link row with no projectId never reached the cloud either
  assert.deepEqual(unbacked.map((p) => p.name), ["Sketch", "Demo"]);
});

test("a folder carrying a project marker counts as backed up", () => {
  const unbacked = findUnbackedProjects(
    [project("/moved/Amalhea Project")],
    {},
    { readMarker: (folder) => (folder === "/moved/Amalhea Project" ? { projectId: "p1" } : null) },
  );
  assert.deepEqual(unbacked, []);
});

test("says nothing when every project is covered", () => {
  assert.equal(shouldNotifyUnbacked([], null), false);
  assert.equal(shouldNotifyUnbacked(findUnbackedProjects([], {}), null), false);
});

test("warns once, then stays quiet until the set changes", () => {
  const unbacked = [{ folder: "/w/a", name: "a" }];
  assert.equal(shouldNotifyUnbacked(unbacked, null), true);

  const previous = { signature: signatureOf(unbacked), at: 1000 };
  // same set, minutes later: silence
  assert.equal(shouldNotifyUnbacked(unbacked, previous, 1000 + 60_000), false);
  // same set, a day later: worth repeating
  assert.equal(shouldNotifyUnbacked(unbacked, previous, 1000 + 25 * 3600 * 1000), true);
  // a new uncovered project appears: say so immediately
  assert.equal(shouldNotifyUnbacked([...unbacked, { folder: "/w/b", name: "b" }], previous, 1000 + 60_000), true);
});

test("the notice names the project, and does not list a hundred of them", () => {
  assert.match(unbackedNotification([{ folder: "/w/a", name: "Amalhea" }]).body, /"Amalhea" is in a watched folder/);
  const many = Array.from({ length: 7 }, (_, i) => ({ folder: `/w/${i}`, name: `P${i}` }));
  const notice = unbackedNotification(many);
  assert.equal(notice.title, "7 projects are not backed up");
  assert.match(notice.body, /P0, P1, P2 and 4 more/);
});

test("the signature ignores ordering, so a reshuffled scan is not new news", () => {
  const a = [{ folder: "/w/b" }, { folder: "/w/a" }];
  const b = [{ folder: "/w/a" }, { folder: "/w/b" }];
  assert.equal(signatureOf(a), signatureOf(b));
});
