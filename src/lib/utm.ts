import * as amplitude from "@amplitude/unified";

/**
 * UTM + referrer capture for attribution.
 * - Reads UTM params from the current URL on first load.
 * - Persists them in sessionStorage so they ride along with every event in the session.
 * - Registers them as Amplitude event properties (via Identify) and user properties
 *   (setOnce for first-touch, set for last-touch).
 */

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

type UtmKey = (typeof UTM_KEYS)[number];
type UtmData = Partial<Record<UtmKey | "referrer" | "landing_page", string>>;

const STORAGE_KEY = "tf_utm_v1";

function readStored(): UtmData {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UtmData) : {};
  } catch {
    return {};
  }
}

function writeStored(data: UtmData) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

/**
 * Call once on app boot. Captures UTMs from URL (if any), merges with stored,
 * and pushes them to Amplitude as event + user properties.
 */
export function initUtmTracking() {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  const fromUrl: UtmData = {};
  for (const key of UTM_KEYS) {
    const v = url.searchParams.get(key);
    if (v) fromUrl[key] = v;
  }

  const stored = readStored();
  const hasNewUtms = Object.keys(fromUrl).length > 0;

  // Merge: new URL UTMs override stored (last-touch wins for the session).
  const merged: UtmData = { ...stored, ...fromUrl };

  // Capture referrer + landing page on first visit of the session.
  if (!stored.referrer && document.referrer) {
    merged.referrer = document.referrer;
  }
  if (!stored.landing_page) {
    merged.landing_page = window.location.pathname + window.location.search;
  }

  writeStored(merged);

  try {
    // Event-level: attach to every future event automatically.
    amplitude.setGroup; // no-op reference to ensure tree-shake safety
    const identify = new amplitude.Identify();

    for (const [k, v] of Object.entries(merged)) {
      if (!v) continue;
      // First-touch (never overwritten)
      identify.setOnce(`initial_${k}`, v);
      // Last-touch (latest value wins) — only update if new from URL or first set
      if (hasNewUtms || !stored[k as keyof UtmData]) {
        identify.set(k, v);
      }
    }
    amplitude.identify(identify);
  } catch (e) {
    console.warn("[utm] init failed", e);
  }
}

/**
 * Returns the stored UTM/attribution data so it can be merged into specific
 * events (e.g. signup_completed) as event properties.
 */
export function getUtmProps(): UtmData {
  return readStored();
}
