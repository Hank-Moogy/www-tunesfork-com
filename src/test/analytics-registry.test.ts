import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EVENT_SCHEMA_VERSION, SEMANTIC_EVENT_NAMES, UPLOAD_EVENT_PROPERTIES } from "../../shared/analytics-events";

describe("analytics registry", () => {
  it("contains unique, versioned canonical events", () => {
    expect(EVENT_SCHEMA_VERSION).toBe(1);
    expect(new Set(SEMANTIC_EVENT_NAMES).size).toBe(SEMANTIC_EVENT_NAMES.length);
    expect(SEMANTIC_EVENT_NAMES).toContain("Authenticated Session Started");
    expect(UPLOAD_EVENT_PROPERTIES).toContain("reused_bytes");
  });

  it("rejects undocumented main-process IPC event names", () => {
    const source = readFileSync(resolve(process.cwd(), "electron/main.cjs"), "utf8");
    const emitted = [...source.matchAll(/emitAnalytics\(\s*["']([^"']+)["']/g)].map((match) => match[1]);
    const documented = new Set<string>(SEMANTIC_EVENT_NAMES);
    expect(emitted.length).toBeGreaterThan(0);
    expect(emitted.filter((name) => !documented.has(name))).toEqual([]);
  });
});
