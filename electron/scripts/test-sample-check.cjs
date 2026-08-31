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

test("counts reused external references as one actionable file", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "tunesfork-sample-check-"));
  try {
    const repeated = {
      relativePath: "../Shared/kick.wav",
      absolutePath: "/Shared/kick.wav",
      hasRelativePath: true,
    };
    const result = buildSampleCheck(project, [repeated, repeated, repeated]);
    assert.equal(result.missing, 1);
    assert.deepEqual(result.missing_paths, ["../Shared/kick.wav"]);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test("ignores Ableton application-bundled device resources", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "tunesfork-sample-check-"));
  try {
    const result = buildSampleCheck(project, [{
      relativePath: "Samples/Hybrid/ImpulseResponses/Grand Stage L.aif",
      absolutePath: "/Applications/Ableton Live 12 Suite.app/Contents/App-Resources/Builtin/Samples/Hybrid/ImpulseResponses/Grand Stage L.aif",
      hasRelativePath: false,
    }]);
    assert.equal(result.missing, 0);
    assert.equal(result.external, 0);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});
