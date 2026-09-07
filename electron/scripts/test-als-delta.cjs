const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const zlib = require("node:zlib");
const { decodeAlsDelta, encodeAlsDelta, packAls, readAlsXml } = require("../als-delta.cjs");

// Ableton writes gzip with a zeroed mtime and OS byte 0x13; reproduce that framing
// so the fixtures exercise the same path a real .als does.
function als(xml) {
  const packed = zlib.gzipSync(Buffer.from(xml), { level: 6, memLevel: 9 });
  packed[8] = 0x00;
  packed[9] = 0x13;
  return packed;
}

// Real .als XML is megabytes of low-redundancy event data. A fixture of repeated
// text would gzip to a few hundred bytes and make any delta look bad by ratio, so
// generate varied — but deterministic — note data.
function projectXml(tempo, tracks) {
  let seed = 1337;
  const rand = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32;
  const clips = Array.from({ length: tracks }, (_, i) => {
    const notes = Array.from({ length: 400 }, () =>
      `<Note Time="${(rand() * 512).toFixed(4)}" Key="${(rand() * 127) | 0}" Vel="${(rand() * 127) | 0}"/>`,
    ).join("");
    return `<MidiTrack Id="${i}"><Name Value="Track ${i}"/><Notes>${notes}</Notes></MidiTrack>`;
  }).join("");
  return `<?xml version="1.0"?><Ableton><Tempo Value="${tempo}"/><Tracks>${clips}</Tracks></Ableton>`;
}

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

test("rebuilds the exact original bytes from a delta", () => {
  const base = als(projectXml(120, 30));
  const next = als(projectXml(124, 30));
  const payload = encodeAlsDelta(next, readAlsXml(base));
  assert.ok(payload, "a small edit should encode as a delta");
  const rebuilt = decodeAlsDelta(payload, base);
  assert.equal(sha256(rebuilt), sha256(next));
  assert.ok(rebuilt.equals(next));
});

test("a one-value edit costs a small fraction of the file", () => {
  const base = als(projectXml(120, 60));
  const next = als(projectXml(121, 60));
  const payload = encodeAlsDelta(next, readAlsXml(base));
  assert.ok(payload.length < next.length / 20, `delta was ${payload.length} of ${next.length} bytes`);
});

test("declines a delta that would not pay for itself", () => {
  const base = als(projectXml(120, 30));
  const unrelated = als(projectXml(90, 30).replace(/Note /g, "Automation "));
  assert.equal(encodeAlsDelta(unrelated, readAlsXml(base)), null);
});

test("declines files whose gzip framing cannot be reproduced", () => {
  const xml = Buffer.from(projectXml(120, 30));
  // Level 1 is not the framing packAls rebuilds, so the round trip must fail closed.
  const foreign = zlib.gzipSync(xml, { level: 1 });
  assert.equal(encodeAlsDelta(foreign, xml), null);
});

test("ignores files that are not gzip at all", () => {
  assert.equal(readAlsXml(Buffer.from("not an als")), null);
  assert.equal(encodeAlsDelta(Buffer.from("not an als"), Buffer.from("<Ableton/>")), null);
});

test("rejects a corrupt or hostile payload instead of emitting wrong bytes", () => {
  const base = als(projectXml(120, 30));
  const next = als(projectXml(125, 30));
  const payload = encodeAlsDelta(next, readAlsXml(base));

  assert.throws(() => decodeAlsDelta(Buffer.from("garbage"), base));
  const truncated = payload.subarray(0, payload.length - 8);
  assert.throws(() => decodeAlsDelta(truncated, base));
  // A delta rebuilt against the wrong base must not silently yield a valid file.
  const wrongBase = als(projectXml(200, 12));
  let mismatch = false;
  try {
    mismatch = sha256(decodeAlsDelta(payload, wrongBase)) !== sha256(next);
  } catch {
    mismatch = true;
  }
  assert.ok(mismatch, "a wrong base must not reconstruct the original file");
});

test("round-trips a base and target that share no content", () => {
  const base = als("<Ableton><Tempo Value=\"120\"/></Ableton>");
  const next = als(projectXml(140, 20));
  // Nothing to copy, so this is all literal — still lossless when it is accepted.
  const payload = encodeAlsDelta(next, readAlsXml(base), { maxRatio: 10 });
  assert.ok(payload);
  assert.ok(decodeAlsDelta(payload, base).equals(next));
});

test("packAls reproduces Ableton framing byte for byte", () => {
  const original = als(projectXml(118, 8));
  const xml = readAlsXml(original);
  assert.ok(packAls(xml, original.subarray(0, 10)).equals(original));
});
