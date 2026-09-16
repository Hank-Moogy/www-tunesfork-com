const DEFAULT_SAVE_DEBOUNCE_MS = 5_000;
const DEFAULT_OPEN_EVENT_GUARD_MS = 30_000;

function getSaveEventDelayMs({
  openedAt,
  now = Date.now(),
  debounceMs = DEFAULT_SAVE_DEBOUNCE_MS,
  openEventGuardMs = DEFAULT_OPEN_EVENT_GUARD_MS,
} = {}) {
  if (!Number.isFinite(openedAt) || openedAt <= 0) return debounceMs;

  const elapsedSinceOpen = Math.max(0, now - openedAt);
  if (elapsedSinceOpen >= openEventGuardMs) return debounceMs;

  // Opening an Ableton set can emit the same filesystem events as saving it.
  // Delay events inside that guard window instead of dropping them: the later
  // content-hash check turns an open-only event into a no-op, while a genuine
  // save made immediately after opening is still uploaded.
  return Math.max(debounceMs, openEventGuardMs - elapsedSinceOpen);
}

module.exports = {
  DEFAULT_SAVE_DEBOUNCE_MS,
  DEFAULT_OPEN_EVENT_GUARD_MS,
  getSaveEventDelayMs,
};
