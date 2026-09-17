const assert = require("node:assert/strict");
const test = require("node:test");
const { formatGb, isQuotaError, parseQuotaDetail, quotaNotification, storageUsage } = require("../quota.cjs");

test("recognises a quota rejection by code and by message", () => {
  assert.equal(isQuotaError({ code: "QUOTA_EXCEEDED" }), true);
  assert.equal(isQuotaError({ message: "reserve failed: QUOTA_EXCEEDED" }), true);
  assert.equal(isQuotaError({ code: "UPLOAD_CONFLICT" }), false);
  assert.equal(isQuotaError(null), false);
});

test("reads the numbers the database raised with", () => {
  const detail = JSON.stringify({ used_bytes: 4800000000, reserved_bytes: 0, required_bytes: 900000000, limit_bytes: 5368709120 });
  assert.deepEqual(parseQuotaDetail(detail), {
    usedBytes: 4800000000, limitBytes: 5368709120, reservedBytes: 0, requiredBytes: 900000000,
  });
  // already-parsed detail is just as valid
  assert.equal(parseQuotaDetail({ used_bytes: 1, limit_bytes: 2 }).limitBytes, 2);
});

test("survives a rejection that carries no usable detail", () => {
  for (const bad of [null, undefined, "not json", "{}", { limit_bytes: "many" }]) {
    assert.equal(parseQuotaDetail(bad), null);
  }
  // and still says something the user can act on
  const n = quotaNotification({ projectName: "Amalhea", detail: null });
  assert.equal(n.title, "Cloud storage full");
  assert.match(n.body, /"Amalhea" was not backed up/);
  assert.doesNotMatch(n.body, /null|undefined|NaN/);
});

test("names the project and the ceiling when it can", () => {
  const detail = JSON.stringify({ used_bytes: 5300000000, limit_bytes: 5368709120 });
  assert.match(quotaNotification({ projectName: "Amalhea", detail }).body, /5\.4 GB of cloud storage is full/);
});

test("an account with no ceiling is metered, not 0% full", () => {
  const usage = storageUsage({ usedBytes: 9529571384, limitBytes: null });
  assert.equal(usage.metered, true);
  assert.equal(usage.percent, null);
  assert.equal(usage.level, "ok");
  assert.equal(usage.usedLabel, "9.5 GB");
});

test("grades usage so the tray can warn before the limit, not after", () => {
  const at = (used) => storageUsage({ usedBytes: used, limitBytes: 100 }).level;
  assert.equal(at(10), "ok");
  assert.equal(at(80), "warn");
  assert.equal(at(95), "critical");
  assert.equal(at(100), "full");
  assert.equal(at(140), "full");
  // never renders past a full bar
  assert.equal(storageUsage({ usedBytes: 140, limitBytes: 100 }).percent, 100);
});

test("formats sizes without false precision", () => {
  assert.equal(formatGb(5368709120), "5.4 GB");
  assert.equal(formatGb(107374182400), "107 GB");
});
