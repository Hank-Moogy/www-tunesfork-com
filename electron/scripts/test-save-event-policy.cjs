const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_SAVE_DEBOUNCE_MS,
  getSaveEventDelayMs,
} = require("../save-event-policy.cjs");

test("uses the normal debounce when the project was not opened by Tunesfork", () => {
  assert.equal(getSaveEventDelayMs({ now: 50_000 }), DEFAULT_SAVE_DEBOUNCE_MS);
});

test("queues rather than discards a save event inside the open guard", () => {
  assert.equal(getSaveEventDelayMs({ openedAt: 10_000, now: 20_000 }), 20_000);
});

test("uses the normal debounce once the open guard has elapsed", () => {
  assert.equal(getSaveEventDelayMs({ openedAt: 10_000, now: 40_000 }), DEFAULT_SAVE_DEBOUNCE_MS);
});

test("never shortens the normal debounce at the end of the open guard", () => {
  assert.equal(getSaveEventDelayMs({ openedAt: 10_000, now: 39_000 }), DEFAULT_SAVE_DEBOUNCE_MS);
});
