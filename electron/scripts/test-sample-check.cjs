const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { buildSampleCheck } = require("../sample-check.cjs");

test("detects collected, missing, and external sample references before upload", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "tunesfork-sample-check-"));
  try {
    const collectedDir = path.join(project, "Samples", "Collected");
    fs.mkdirSync(collectedDir, { recursive: true });
    fs.writeFileSync(path.join(collectedDir, "kick.wav"), "audio");

    const result = buildSampleCheck(project, [
      {
        relativePath: "Samples/Collected/kick.wav",
        absolutePath: "/Library/kick.wav",
        hasRelativePath: true,
      },
      {
        relativePath: "Samples/Collected/snare.wav",
        absolutePath: "/Library/snare.wav",
        hasRelativePath: true,
      },
      {
        relativePath: null,
        absolutePath: "/Library/hihat.wav",
        hasRelativePath: false,
      },
    ]);

    assert.equal(result.included, 1);
    assert.equal(result.missing, 1);
    assert.equal(result.external, 1);
    assert.deepEqual(result.missing_paths, ["Samples/Collected/snare.wav"]);
    assert.deepEqual(result.external_paths, ["/Library/hihat.wav"]);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});
