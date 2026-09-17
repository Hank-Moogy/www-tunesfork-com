import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The edge functions are Deno modules that vitest cannot import, but a
// templateName typo fails silently at send time — the mail just never arrives.
// Reading the sources catches that without a Deno runtime.
const FUNCTIONS_DIR = resolve(process.cwd(), "supabase/functions");
const REGISTRY = resolve(FUNCTIONS_DIR, "_shared/transactional-email-templates/registry.ts");

function registeredTemplates(): string[] {
  const source = readFileSync(REGISTRY, "utf8");
  const block = source.slice(source.indexOf("export const TEMPLATES"));
  return [...block.matchAll(/'([a-z0-9-]+)':/g)].map((match) => match[1]);
}

function requestedTemplates(): { name: string; file: string }[] {
  const found: { name: string; file: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const source = readFileSync(full, "utf8");
      for (const match of source.matchAll(/templateName:\s*['"]([^'"]+)['"]/g)) {
        found.push({ name: match[1], file: full });
      }
    }
  };
  walk(FUNCTIONS_DIR);
  return found;
}

describe("transactional email templates", () => {
  it("registers both sides of the fork request conversation", () => {
    const names = registeredTemplates();
    expect(names).toContain("fork-request-received");
    expect(names).toContain("fork-request-reviewed");
    expect(new Set(names).size).toBe(names.length);
  });

  it("every template a function asks for actually exists", () => {
    const registered = new Set(registeredTemplates());
    const requested = requestedTemplates();
    expect(requested.length).toBeGreaterThan(0);
    const unknown = requested.filter((entry) => !registered.has(entry.name));
    expect(unknown.map((entry) => `${entry.name} in ${entry.file}`)).toEqual([]);
  });

  it("notifies the owner when a contributor's save lands as a fork request", () => {
    const source = readFileSync(resolve(FUNCTIONS_DIR, "create-version-from-desktop/index.ts"), "utf8");
    // The notification must be gated on the pending status — an owner's own save
    // is a version, not something to review.
    expect(source).toMatch(/result\.status === "pending"/);
    expect(source).toContain("fork-request-received");
    // Keyed on the contribution so a retried finalization cannot mail twice.
    expect(source).toMatch(/idempotencyKey:\s*`fork-request-\$\{params\.versionId\}`/);
  });

  it("tells the contributor the outcome, and only the owner can trigger it", () => {
    const source = readFileSync(resolve(FUNCTIONS_DIR, "notify-contribution-reviewed/index.ts"), "utf8");
    expect(source).toContain("fork-request-reviewed");
    expect(source).toMatch(/project\.owner_id !== reviewer\.id/);
    // An undecided contribution has no outcome to report.
    expect(source).toMatch(/status !== 'approved' && version\.status !== 'rejected'/);
  });
});
