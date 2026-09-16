import { describe, expect, it } from "vitest";
import { contributionStatus, describeUploadResult, splitContributions } from "@/lib/contributions";

const row = (id: string, status: string | null, versionNumber: number | null, createdAt: string) => ({
  id, status, version_number: versionNumber, created_at: createdAt,
});

describe("fork request review", () => {
  it("keeps pending contributions out of the version history", () => {
    const { versions, forkRequests } = splitContributions([
      row("v2", "approved", 2, "2026-09-10T10:00:00Z"),
      row("fork", "pending", null, "2026-09-16T10:00:00Z"),
      row("v1", "approved", 1, "2026-09-01T10:00:00Z"),
    ]);
    expect(versions.map((v) => v.id)).toEqual(["v2", "v1"]);
    expect(forkRequests.map((v) => v.id)).toEqual(["fork"]);
    // The pending save must not become the project's current state.
    expect(versions[0].id).toBe("v2");
  });

  it("treats pre-review rows with no status as part of the project", () => {
    const { versions, forkRequests } = splitContributions([row("legacy", null, 1, "2026-01-01T00:00:00Z")]);
    expect(versions).toHaveLength(1);
    expect(forkRequests).toHaveLength(0);
    expect(contributionStatus({ status: undefined })).toBe("approved");
  });

  it("hides rejected and superseded contributions from both lists", () => {
    const { versions, forkRequests } = splitContributions([
      row("rejected", "rejected", null, "2026-09-12T10:00:00Z"),
      row("superseded", "superseded", null, "2026-09-13T10:00:00Z"),
      row("v1", "approved", 1, "2026-09-01T10:00:00Z"),
    ]);
    expect(versions.map((v) => v.id)).toEqual(["v1"]);
    expect(forkRequests).toEqual([]);
  });

  it("shows the newest fork request first", () => {
    const { forkRequests } = splitContributions([
      row("older", "pending", null, "2026-09-14T10:00:00Z"),
      row("newer", "pending", null, "2026-09-16T10:00:00Z"),
    ]);
    expect(forkRequests.map((v) => v.id)).toEqual(["newer", "older"]);
  });

  it("never claims a version number for a contributor's save", () => {
    expect(describeUploadResult({ status: "pending", version_number: null }))
      .toEqual({ pending: true, title: "Fork request sent" });
    expect(describeUploadResult({ status: "approved", version_number: 3 }))
      .toEqual({ pending: false, title: "Version 3" });
  });
});
