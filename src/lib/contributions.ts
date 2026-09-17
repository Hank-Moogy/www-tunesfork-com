// A contributor's save is a fork request until the project owner approves it.
// Until then it is not a version: it has no version number, it is not the
// project's "current" state, and it must not appear in the version history.
export type ContributionStatus = "approved" | "pending" | "rejected" | "superseded";

type ContributionRow = {
  id: string;
  created_at: string;
  status?: string | null;
  version_number?: number | null;
};

export function contributionStatus(row: Pick<ContributionRow, "status">): ContributionStatus {
  // Rows written before the review flow existed carry no status and are, by
  // definition, already part of the project.
  const value = row.status ?? "approved";
  return value === "pending" || value === "rejected" || value === "superseded" ? value : "approved";
}

export function splitContributions<T extends ContributionRow>(rows: T[]): {
  versions: T[];
  forkRequests: T[];
} {
  const versions: T[] = [];
  const forkRequests: T[] = [];
  for (const row of rows) {
    const status = contributionStatus(row);
    if (status === "approved") versions.push(row);
    else if (status === "pending") forkRequests.push(row);
    // rejected and superseded rows are history, not something to act on.
  }
  forkRequests.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { versions, forkRequests };
}

// What the desktop app should say after a save is accepted by the server.
export function describeUploadResult(result: {
  status?: string | null;
  version_number?: number | null;
}): { pending: boolean; title: string } {
  if (contributionStatus(result) === "pending") {
    return { pending: true, title: "Fork request sent" };
  }
  return { pending: false, title: `Version ${result.version_number ?? ""}`.trim() };
}
