// A persistent, on-disk copy of everything the Diagnostics panel shows.
//
// log() previously went only to console.log (invisible in a packaged app) and
// over IPC to the tray popover, which keeps nothing once it closes. So by the
// time anyone knows a save failed, the only record of why is already gone —
// which is exactly when it is needed. This writes the same lines to a rotating
// file the user can send on.
const fs = require("node:fs");
const path = require("node:path");

const MAX_BYTES = 2 * 1024 * 1024;

function logFilePath(stateDir) {
  return path.join(stateDir, "sync.log");
}

function formatLine({ ts, level, msg }) {
  const stamp = new Date(ts).toISOString();
  // One line per entry, newline-escaped, so a multi-line error message cannot
  // corrupt the shape of the file.
  return `${stamp} [${level}] ${String(msg).replace(/\r?\n/g, " ⏎ ")}\n`;
}

// Keep one previous file so a rotation cannot destroy the evidence of the run
// that just failed.
function rotateIfNeeded(file, maxBytes = MAX_BYTES, fsImpl = fs) {
  try {
    if (fsImpl.statSync(file).size < maxBytes) return false;
  } catch {
    return false;
  }
  try {
    fsImpl.renameSync(file, `${file}.1`);
    return true;
  } catch {
    return false;
  }
}

function appendLogLine(stateDir, entry, { maxBytes = MAX_BYTES, fsImpl = fs } = {}) {
  const file = logFilePath(stateDir);
  try {
    rotateIfNeeded(file, maxBytes, fsImpl);
    fsImpl.appendFileSync(file, formatLine(entry), { mode: 0o600 });
  } catch {
    // Diagnostics must never be able to break the thing they are diagnosing.
  }
  return file;
}

module.exports = { MAX_BYTES, appendLogLine, formatLine, logFilePath, rotateIfNeeded };
