import { describe, expect, it } from "vitest";
import { parseBackupProgress } from "../../electron/src/tray-ui/App";

const line = (msg: string) => ({ msg });

describe("back-up progress readout", () => {
  it("recovers the count from a run buried under per-file chatter", () => {
    // Taken from a real run: the announcement is one line, followed by 174
    // upload lines, which is exactly why it cannot be read off the log.
    const log = [
      line("Backing up Hollow Taste [2026-07-13 174304] Project (7/12)…"),
      ...Array.from({ length: 174 }, (_, i) =>
        line(`Uploading changed file Hollow Taste [2026-07-13 174304] Project/Samples/Imported/Kick ${i}.wav (0.1 MB)…`)),
    ];
    expect(parseBackupProgress(log)).toEqual({
      project: "Hollow Taste [2026-07-13 174304]",
      current: 7,
      total: 12,
    });
  });

  it("reports the project currently being worked on, not the first one", () => {
    const log = [
      line("Backing up  Ganymede Project (1/12)…"),
      line(" Ganymede Project already up to date"),
      line("Backing up Europa Project (5/12)…"),
    ];
    expect(parseBackupProgress(log)).toMatchObject({ project: "Europa", current: 5, total: 12 });
  });

  it("strips the Ableton folder suffix so the name reads as the project", () => {
    expect(parseBackupProgress([line("Backing up breaks Project (4/12)…")])?.project).toBe("breaks");
  });

  it("returns nothing before the first project is announced", () => {
    expect(parseBackupProgress([line("Found 12 Ableton project folder(s)")])).toBeNull();
    expect(parseBackupProgress([])).toBeNull();
  });

  it("ignores an upload line that merely mentions backing up", () => {
    expect(parseBackupProgress([line("Uploading changed file Backing up notes (1/2).wav")])).toBeNull();
  });
});
