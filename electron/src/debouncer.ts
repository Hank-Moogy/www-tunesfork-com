// Per-key debounce. Each key (an .als path) gets its own quiet window.
export class Debouncer<K> {
  private timers = new Map<K, ReturnType<typeof setTimeout>>();
  constructor(private waitMs: number) {}

  fire(key: K, fn: () => void) {
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      this.timers.delete(key);
      fn();
    }, this.waitMs);
    this.timers.set(key, t);
  }

  cancelAll() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}
