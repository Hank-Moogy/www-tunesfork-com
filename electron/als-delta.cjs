// Delta encoding for Ableton project files.
//
// An .als is gzipped XML. Two consecutive saves differ by a few hundred bytes of
// XML but share almost no compressed bytes, so a delta over the *decompressed*
// XML is ~200x smaller than a delta over the .als itself. We therefore store a
// changed .als as a patch against an earlier one and rebuild it on restore.
//
// Rebuilding has to be byte-exact: the manifest records the sha256 of the real
// file, and restore verifies it. Ableton's gzip is reproducible with zlib level
// 6 at memLevel 9, and we carry the original 10-byte gzip header verbatim so any
// other writer's framing survives too. The encoder still proves the round trip
// locally before offering a delta — if it cannot rebuild the exact bytes, the
// caller falls back to storing the file whole.

const zlib = require("node:zlib");

const ENCODING = "als_xml_delta";
const MAGIC = Buffer.from("TFD1");
const GZIP_HEADER_BYTES = 10;
const BLOCK = 32; // matcher granularity, in bytes
const MAX_CANDIDATES = 8; // hash-bucket probes per position
const MAX_XML_BYTES = 512 * 1024 * 1024;

function isGzip(buffer) {
  return buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}

// ---------------------------------------------------------------- varints

function writeVarint(out, value) {
  let n = value;
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
}

function readVarint(buffer, cursor) {
  let result = 0;
  let shift = 1;
  let offset = cursor;
  for (;;) {
    if (offset >= buffer.length) throw new Error("Truncated delta");
    const byte = buffer[offset++];
    result += (byte & 0x7f) * shift;
    if ((byte & 0x80) === 0) break;
    shift *= 128;
    if (shift > 2 ** 53) throw new Error("Malformed delta varint");
  }
  return [result, offset];
}

// ------------------------------------------------------------ delta codec

function indexBase(base) {
  const buckets = new Map();
  for (let i = 0; i + BLOCK <= base.length; i += BLOCK) {
    let hash = 0;
    for (let k = 0; k < BLOCK; k++) hash = (Math.imul(hash, 16777619) ^ base[i + k]) >>> 0;
    const existing = buckets.get(hash);
    if (existing === undefined) buckets.set(hash, i);
    else if (Array.isArray(existing)) { if (existing.length < MAX_CANDIDATES) existing.push(i); }
    else buckets.set(hash, [existing, i]);
  }
  return buckets;
}

// Greedy copy/insert encoder: emit COPY for any run of >= BLOCK bytes already in
// the base, and accumulate everything else as literal.
function encodeDelta(base, target) {
  const buckets = indexBase(base);
  const out = [];
  writeVarint(out, target.length);

  let literalStart = 0;
  let cursor = 0;
  const flushLiteral = (end) => {
    if (end <= literalStart) return;
    out.push(0);
    writeVarint(out, end - literalStart);
    for (let i = literalStart; i < end; i++) out.push(target[i]);
  };

  while (cursor < target.length) {
    let bestOffset = -1;
    let bestLength = 0;
    if (cursor + BLOCK <= target.length) {
      let hash = 0;
      for (let k = 0; k < BLOCK; k++) hash = (Math.imul(hash, 16777619) ^ target[cursor + k]) >>> 0;
      const candidate = buckets.get(hash);
      if (candidate !== undefined) {
        const offsets = Array.isArray(candidate) ? candidate : [candidate];
        for (const offset of offsets) {
          let length = 0;
          while (
            offset + length < base.length &&
            cursor + length < target.length &&
            base[offset + length] === target[cursor + length]
          ) length++;
          if (length > bestLength) { bestLength = length; bestOffset = offset; }
        }
      }
    }
    if (bestLength >= BLOCK) {
      flushLiteral(cursor);
      out.push(1);
      writeVarint(out, bestOffset);
      writeVarint(out, bestLength);
      cursor += bestLength;
      literalStart = cursor;
    } else {
      cursor++;
    }
  }
  flushLiteral(target.length);
  return Buffer.from(out);
}

function decodeDelta(base, delta) {
  let [targetLength, cursor] = readVarint(delta, 0);
  if (targetLength > MAX_XML_BYTES) throw new Error("Delta target exceeds the size limit");
  const target = Buffer.allocUnsafe(targetLength);
  let written = 0;

  while (cursor < delta.length) {
    const op = delta[cursor++];
    if (op === 0) {
      let length;
      [length, cursor] = readVarint(delta, cursor);
      if (cursor + length > delta.length) throw new Error("Truncated delta literal");
      if (written + length > targetLength) throw new Error("Delta overruns its target");
      delta.copy(target, written, cursor, cursor + length);
      cursor += length;
      written += length;
    } else if (op === 1) {
      let offset;
      let length;
      [offset, cursor] = readVarint(delta, cursor);
      [length, cursor] = readVarint(delta, cursor);
      if (offset + length > base.length) throw new Error("Delta copies past the base");
      if (written + length > targetLength) throw new Error("Delta overruns its target");
      base.copy(target, written, offset, offset + length);
      written += length;
    } else {
      throw new Error(`Unknown delta opcode ${op}`);
    }
  }
  if (written !== targetLength) throw new Error("Delta produced the wrong length");
  return target;
}

// ------------------------------------------------------------- .als framing

function readAlsXml(fileBytes) {
  if (!isGzip(fileBytes)) return null;
  try {
    return zlib.gunzipSync(fileBytes);
  } catch {
    return null;
  }
}

// Recompress XML and restore the original gzip framing, so the result is the
// byte-for-byte file the manifest hashed.
function packAls(xml, gzipHeader) {
  if (gzipHeader.length !== GZIP_HEADER_BYTES) throw new Error("Invalid gzip header");
  const packed = zlib.gzipSync(xml, { level: 6, memLevel: 9 });
  gzipHeader.copy(packed, 0, 0, GZIP_HEADER_BYTES);
  return packed;
}

/**
 * Encode `fileBytes` as a patch against `baseXml`.
 * Returns null whenever a delta is not safe or not worth it, and the caller
 * should store the file whole.
 */
function encodeAlsDelta(fileBytes, baseXml, { maxRatio = 0.25 } = {}) {
  const xml = readAlsXml(fileBytes);
  if (!xml) return null;

  const header = fileBytes.subarray(0, GZIP_HEADER_BYTES);
  // Prove the round trip before committing to a delta: if this writer's gzip is
  // not one we can reproduce, a delta could never be rebuilt.
  if (!packAls(xml, header).equals(fileBytes)) return null;

  const body = encodeDelta(baseXml, xml);
  const payload = zlib.brotliCompressSync(
    Buffer.concat([MAGIC, header, body]),
    { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } },
  );
  // A delta that saves little is not worth the extra fetch and the chain it
  // creates; the caller re-keyframes instead.
  if (payload.length > fileBytes.length * maxRatio) return null;
  return payload;
}

/** Rebuild the original .als bytes from a stored delta payload and its base .als. */
function decodeAlsDelta(payload, baseFileBytes) {
  const baseXml = readAlsXml(baseFileBytes);
  if (!baseXml) throw new Error("Delta base is not a readable Ableton file");

  const raw = zlib.brotliDecompressSync(payload);
  if (raw.length < MAGIC.length + GZIP_HEADER_BYTES || !raw.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Unrecognised delta payload");
  }
  const header = raw.subarray(MAGIC.length, MAGIC.length + GZIP_HEADER_BYTES);
  const body = raw.subarray(MAGIC.length + GZIP_HEADER_BYTES);
  return packAls(decodeDelta(baseXml, body), header);
}

module.exports = {
  ENCODING,
  decodeAlsDelta,
  encodeAlsDelta,
  packAls,
  readAlsXml,
};
