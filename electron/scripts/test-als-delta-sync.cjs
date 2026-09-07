// Walks a run of .als revisions through the same keyframe/patch decisions the
// sync loop makes, and rebuilds each one the way restore does. Guards the whole
// contract: every stored version must come back byte-identical.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const zlib = require("node:zlib");
const { ENCODING, decodeAlsDelta, encodeAlsDelta, readAlsXml } = require("../als-delta.cjs");

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

function als(xml) {
  const packed = zlib.gzipSync(Buffer.from(xml), { level: 6, memLevel: 9 });
  packed[8] = 0x00;
  packed[9] = 0x13;
  return packed;
}

function revision(seedTempo, edits) {
  let seed = 4242;
  const rand = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32;
  const tracks = Array.from({ length: 24 }, (_, i) => {
    const notes = Array.from({ length: 300 }, () =>
      `<Note Time="${(rand() * 512).toFixed(4)}" Key="${(rand() * 127) | 0}"/>`,
    ).join("");
    return `<MidiTrack Id="${i}"><Name Value="Track ${i}"/><Notes>${notes}</Notes></MidiTrack>`;
  }).join("");
  const automation = Array.from({ length: edits }, (_, i) => `<Event Id="${i}" V="${i * 3.5}"/>`).join("");
  return als(`<?xml version="1.0"?><Ableton><Tempo Value="${seedTempo}"/><Tracks>${tracks}</Tracks><Auto>${automation}</Auto></Ableton>`);
}

// Mirrors the client: patch against the last revision stored whole, and
// re-keyframe whenever the encoder declines.
function storeRevisions(revisions) {
  const stored = [];
  let keyframe = null;
  for (const bytes of revisions) {
    const payload = keyframe ? encodeAlsDelta(bytes, readAlsXml(keyframe)) : null;
    if (payload) {
      stored.push({ encoding: ENCODING, payload, base: keyframe, sha256: sha256(bytes) });
    } else {
      stored.push({ encoding: "raw", payload: bytes, base: null, sha256: sha256(bytes) });
      keyframe = bytes;
    }
  }
  return stored;
}

// Mirrors restore.
function rebuild(entry) {
  return entry.encoding === ENCODING ? decodeAlsDelta(entry.payload, entry.base) : entry.payload;
}

test("every stored revision restores byte-identically", () => {
  const revisions = [
    revision(120, 4), revision(121, 6), revision(121, 40),
    revision(124, 41), revision(124, 90), revision(128, 91),
  ];
  const stored = storeRevisions(revisions);

  assert.equal(stored[0].encoding, "raw", "the first save has no base and must be stored whole");
  revisions.forEach((original, index) => {
    const restored = rebuild(stored[index]);
    assert.equal(sha256(restored), stored[index].sha256);
    assert.ok(restored.equals(original), `revision ${index} did not round-trip`);
  });
});

test("patches cost a fraction of storing every revision whole", () => {
  const revisions = [revision(120, 4), revision(120, 5), revision(120, 6), revision(120, 7)];
  const stored = storeRevisions(revisions);
  const wholeBytes = revisions.reduce((sum, bytes) => sum + bytes.length, 0);
  const storedBytes = stored.reduce((sum, entry) => sum + entry.payload.length, 0);
  assert.ok(stored.filter((entry) => entry.encoding === ENCODING).length === 3, "only the first should be a keyframe");
  assert.ok(storedBytes < wholeBytes / 3, `stored ${storedBytes} of ${wholeBytes} bytes`);
});

test("a drifted revision re-keyframes instead of storing a bloated patch", () => {
  const base = revision(120, 4);
  // Same project shape, completely different note data: no useful patch exists.
  const drifted = als(readAlsXml(revision(120, 4)).toString().replace(/Note /g, "Automation "));
  const stored = storeRevisions([base, drifted]);
  assert.equal(stored[1].encoding, "raw");
  assert.ok(rebuild(stored[1]).equals(drifted));
});

test("a corrupted patch fails loudly rather than restoring wrong bytes", () => {
  const revisions = [revision(120, 4), revision(120, 9)];
  const stored = storeRevisions(revisions);
  assert.equal(stored[1].encoding, ENCODING);
  const corrupted = { ...stored[1], payload: Buffer.from(stored[1].payload) };
  corrupted.payload[corrupted.payload.length >> 1] ^= 0xff;
  let failed = false;
  try {
    failed = sha256(rebuild(corrupted)) !== stored[1].sha256;
  } catch {
    failed = true;
  }
  assert.ok(failed, "a corrupted patch must not pass as the original file");
});
