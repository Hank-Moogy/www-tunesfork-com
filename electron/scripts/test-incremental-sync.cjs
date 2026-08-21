const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const zlib = require("node:zlib");
const { buildProjectManifest, manifestForApi } = require("../incremental-sync.cjs");

function fixture() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "tfsync-manifest-"));
  const project = path.join(temp, "Demo Project");
  fs.mkdirSync(path.join(project, "Samples"), { recursive: true });
  fs.writeFileSync(path.join(project, "Demo.als"), zlib.gzipSync("<Ableton><Tempo>120</Tempo></Ableton>"));
  fs.writeFileSync(path.join(project, "Samples", "kick.wav"), Buffer.from("sample-bytes"));
  fs.mkdirSync(path.join(project, "Backup"));
  fs.writeFileSync(path.join(project, "Backup", "old.als"), "ignored");
  return { temp, project, cache: path.join(temp, "state", "hash-cache.json") };
}

test("builds a reconstruction-safe manifest and excludes backup files", () => {
  const { temp, project, cache } = fixture();
  try {
    const result = buildProjectManifest(project, cache);
    assert.equal(result.manifest.schema_version, 1);
    assert.deepEqual(result.manifest.files.map((file) => file.path), [
      "Demo Project/Demo.als",
      "Demo Project/Samples/kick.wav",
    ]);
    assert.ok(result.manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)));
    assert.ok(result.bytesHashed > 0);
    assert.ok(!JSON.stringify(manifestForApi(result.manifest)).includes("source_path"));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("reuses cached hashes and changes the aggregate only for logical changes", () => {
  const { temp, project, cache } = fixture();
  try {
    const first = buildProjectManifest(project, cache);
    const second = buildProjectManifest(project, cache);
    assert.equal(second.projectHash, first.projectHash);
    assert.equal(second.bytesHashed, 0);

    const als = path.join(project, "Demo.als");
    fs.writeFileSync(als, zlib.gzipSync("<Ableton><Tempo>121</Tempo></Ableton>"));
    const changed = buildProjectManifest(project, cache);
    assert.notEqual(changed.projectHash, first.projectHash);
    assert.ok(changed.bytesHashed > 0);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
