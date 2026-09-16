const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { appendLogLine, formatLine, logFilePath, rotateIfNeeded } = require("../diagnostic-log.cjs");

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tf-log-"));
}

test("the record survives the tray popover closing", () => {
  const dir = tmpdir();
  appendLogLine(dir, { ts: Date.parse("2026-09-16T15:52:01Z"), level: "err", msg: "Register failed 409" });
  assert.match(
    fs.readFileSync(logFilePath(dir), "utf8"),
    /2026-09-16T15:52:01\.000Z \[err\] Register failed 409/,
  );
});

test("a multi-line error stays on one line", () => {
  assert.equal(
    formatLine({ ts: 0, level: "err", msg: "line one\nline two" }),
    "1970-01-01T00:00:00.000Z [err] line one ⏎ line two\n",
  );
});

test("rotation keeps a backup instead of destroying the failed run", () => {
  const dir = tmpdir();
  const file = logFilePath(dir);
  fs.writeFileSync(file, "x".repeat(200));
  assert.equal(rotateIfNeeded(file, 100), true);
  assert.ok(fs.existsSync(`${file}.1`));
  appendLogLine(dir, { ts: 0, level: "info", msg: "after rotation" });
  assert.match(fs.readFileSync(file, "utf8"), /after rotation/);
  assert.equal(fs.readFileSync(`${file}.1`, "utf8").length, 200);
});

test("a file under the limit is not rotated", () => {
  const file = logFilePath(tmpdir());
  fs.writeFileSync(file, "short");
  assert.equal(rotateIfNeeded(file, 1000), false);
});

test("logging never throws when the directory is unwritable", () => {
  assert.doesNotThrow(() => appendLogLine("/proc/nonexistent-tunesfork", { ts: 0, level: "info", msg: "x" }));
});
