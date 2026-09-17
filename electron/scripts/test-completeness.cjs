const assert = require("node:assert/strict");
const test = require("node:test");
const { openWarning, shareWarning, summarize } = require("../completeness.cjs");

const complete = { verified: true, included: 40, missing: 0, external: 0, missing_paths: [], external_paths: [] };

test("a complete project says nothing at all", () => {
  assert.equal(summarize(complete).complete, true);
  assert.equal(openWarning({ projectName: "Amalhea", sampleCheck: complete }), null);
  assert.equal(shareWarning({ projectName: "Amalhea", sampleCheck: complete }), null);
});

test("external samples blame the right person, because only they can fix it", () => {
  const check = {
    verified: true, included: 30, missing: 0, external: 2,
    missing_paths: [],
    external_paths: ["/Users/sam/Library/Samples/Kick 808.wav", "/Volumes/SSD/Vox take 3.aif"],
  };
  const warning = openWarning({ projectName: "Amalhea", sampleCheck: check, ownerName: "Sam" });
  assert.equal(warning.severity, "error");
  assert.match(warning.title, /2 samples did not come with this project/);
  assert.match(warning.body, /Ask Sam to run File → Collect All and Save/);
  // the fix belongs to the owner, so the collaborator is not told to do it
  assert.doesNotMatch(warning.body, /re-link/);
});

test("names the files, because a count is not a memory", () => {
  const check = {
    verified: true, included: 1, missing: 1, external: 1,
    missing_paths: ["Samples/Imported/Snare 808.wav"],
    external_paths: ["/Users/sam/Library/Samples/Kick 808.wav"],
  };
  assert.deepEqual(summarize(check).names, ["Kick 808.wav", "Snare 808.wav"]);
});

test("missing-but-local reads differently from never-uploaded", () => {
  const check = { verified: true, included: 9, missing: 3, external: 0, missing_paths: ["a.wav", "b.wav", "c.wav"], external_paths: [] };
  const warning = openWarning({ projectName: "Amalhea", sampleCheck: check, ownerName: "Sam" });
  assert.match(warning.title, /3 samples missing from this project/);
  assert.match(warning.body, /re-link the audio/);
  assert.doesNotMatch(warning.body, /Collect All/);
});

test("an unreadable set is reported as unknown, never as fine", () => {
  const check = { verified: false, included: 0, missing: 0, external: 0, missing_paths: [], external_paths: [] };
  assert.equal(summarize(check).complete, false);
  assert.equal(openWarning({ projectName: "Amalhea", sampleCheck: check }).severity, "warn");
  assert.match(shareWarning({ projectName: "Amalhea", sampleCheck: check }).title, /unknown/i);
});

test("the owner is warned at share time in their own terms", () => {
  const check = { verified: true, included: 30, missing: 0, external: 4, missing_paths: [], external_paths: ["/x/a.wav"] };
  const warning = shareWarning({ projectName: "Amalhea", sampleCheck: check });
  assert.equal(warning.severity, "error");
  assert.match(warning.title, /Collaborators will open this with missing audio/);
  assert.match(warning.body, /4 samples live outside the project folder/);
  assert.match(warning.body, /Collect All and Save/);
});

test("singular and plural both read as English", () => {
  const one = { verified: true, included: 1, missing: 0, external: 1, missing_paths: [], external_paths: ["/x/a.wav"] };
  assert.match(openWarning({ sampleCheck: one }).title, /^1 sample did not come/);
  const many = { ...one, external: 2, external_paths: ["/x/a.wav", "/x/b.wav"] };
  assert.match(openWarning({ sampleCheck: many }).title, /^2 samples did not come/);
});

test("survives a version stored before sample checks existed", () => {
  // absent is unknown, never "fine"
  assert.equal(summarize(null).complete, false);
  assert.equal(summarize(null).verified, false);
  assert.equal(summarize(undefined).verified, false);
  assert.doesNotThrow(() => openWarning({ sampleCheck: null }));
});
