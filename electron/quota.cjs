// What the app knows, and says, when the account runs out of cloud storage.
//
// Until now a quota rejection produced an analytics event and a red line in a
// log the user has to open on purpose. The save simply did not happen, and
// nothing said so or offered a way out.

function isQuotaError(error) {
  if (!error) return false;
  return error.code === "QUOTA_EXCEEDED" || String(error.message || "").includes("QUOTA_EXCEEDED");
}

// negotiate-project-upload forwards the DETAIL the database raised with, which
// carries the real numbers. It arrives as a JSON string, or already parsed,
// or not at all — a rejection is still actionable without it.
function parseQuotaDetail(detail) {
  let parsed = detail;
  if (typeof detail === "string") {
    try { parsed = JSON.parse(detail); } catch { return null; }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const limitBytes = num(parsed.limit_bytes);
  const usedBytes = num(parsed.used_bytes);
  if (limitBytes === null || usedBytes === null) return null;
  return {
    usedBytes,
    limitBytes,
    reservedBytes: num(parsed.reserved_bytes) ?? 0,
    requiredBytes: num(parsed.required_bytes) ?? 0,
  };
}

function formatGb(bytes) {
  if (!Number.isFinite(bytes)) return null;
  const gb = bytes / 1e9;
  return `${gb >= 10 ? Math.round(gb) : gb.toFixed(1)} GB`;
}

// One sentence the user can act on: what did not happen, and why.
function quotaNotification({ projectName, detail }) {
  const numbers = parseQuotaDetail(detail);
  const subject = projectName ? `"${projectName}"` : "This project";
  const body = numbers
    ? `${subject} was not backed up — your ${formatGb(numbers.limitBytes)} of cloud storage is full.`
    : `${subject} was not backed up — your cloud storage is full.`;
  return { title: "Cloud storage full", body };
}

// Storage the tray can show before the limit is reached rather than after.
function storageUsage({ usedBytes, limitBytes }) {
  if (limitBytes == null || !Number.isFinite(limitBytes) || limitBytes <= 0) {
    // Legacy and metered accounts have no ceiling to draw.
    return { metered: true, percent: null, usedLabel: formatGb(usedBytes), limitLabel: null, level: "ok" };
  }
  const used = Number.isFinite(usedBytes) && usedBytes > 0 ? usedBytes : 0;
  const percent = Math.min(100, Math.round((used / limitBytes) * 100));
  return {
    metered: false,
    percent,
    usedLabel: formatGb(used),
    limitLabel: formatGb(limitBytes),
    level: percent >= 100 ? "full" : percent >= 95 ? "critical" : percent >= 80 ? "warn" : "ok",
  };
}

module.exports = { formatGb, isQuotaError, parseQuotaDetail, quotaNotification, storageUsage };
