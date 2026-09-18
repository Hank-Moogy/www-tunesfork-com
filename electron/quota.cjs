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

// Entitlements are stored as binary gigabytes — 5 GiB, 100 GiB, 500 GiB — and
// the pricing page advertises them as 5 GB, 100 GB and 500 GB. Dividing by 1e9
// turned those into 5.4, 107.4 and 536.9, so the app quietly disagreed with the
// page the user had just read about the one number they were buying.
function formatGb(bytes) {
  if (!Number.isFinite(bytes)) return null;
  const gb = bytes / 1024 ** 3;
  const rounded = gb >= 10 ? Math.round(gb) : Math.round(gb * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} GB`;
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
//
// "No limit" and "limit not loaded yet" look identical from the bytes alone, and
// conflating them told every newly paired user their plan was metered — which is
// a legacy-account term, and the opposite of the 5 GB ceiling a free account
// actually has. The plan disambiguates them.
function storageUsage({ usedBytes, limitBytes, plan }) {
  if (limitBytes == null || !Number.isFinite(limitBytes) || limitBytes <= 0) {
    if (plan === "legacy") {
      return { known: true, metered: true, percent: null, usedLabel: formatGb(usedBytes), limitLabel: null, level: "ok" };
    }
    // Say how much is stored, and nothing we cannot stand behind.
    return { known: false, metered: false, percent: null, usedLabel: formatGb(usedBytes), limitLabel: null, level: "ok" };
  }
  const used = Number.isFinite(usedBytes) && usedBytes > 0 ? usedBytes : 0;
  const percent = Math.min(100, Math.round((used / limitBytes) * 100));
  return {
    known: true,
    metered: false,
    percent,
    usedLabel: formatGb(used),
    limitLabel: formatGb(limitBytes),
    level: percent >= 100 ? "full" : percent >= 95 ? "critical" : percent >= 80 ? "warn" : "ok",
  };
}

module.exports = { formatGb, isQuotaError, parseQuotaDetail, quotaNotification, storageUsage };
