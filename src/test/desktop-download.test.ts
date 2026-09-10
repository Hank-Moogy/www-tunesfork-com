import { describe, expect, it } from "vitest";
import { desktopReleaseLabelFromPayload } from "@/lib/desktopDownload";

describe("desktop release copy", () => {
  it("uses the latest release tag and preserves the unsigned warning", () => {
    expect(desktopReleaseLabelFromPayload({
      tag_name: "v0.1.0-alpha.14",
      name: "Tunesfork Sync v0.1.0-alpha.14 (unsigned alpha)",
    })).toBe("v0.1.0-alpha.14 · unsigned build");
  });

  it("uses only the tag for a signed release", () => {
    expect(desktopReleaseLabelFromPayload({
      tag_name: "v0.1.0-alpha.15",
      name: "Tunesfork Sync v0.1.0-alpha.15",
    })).toBe("v0.1.0-alpha.15");
  });

  it("rejects malformed API payloads", () => {
    expect(desktopReleaseLabelFromPayload({ tag_name: "<script>" })).toBeNull();
    expect(desktopReleaseLabelFromPayload(null)).toBeNull();
  });
});
