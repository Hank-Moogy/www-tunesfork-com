// Whether a project will actually open with its sound intact, and what to say
// when it will not.
//
// A collaborator opening a shared project to silent, offline clips is the worst
// thing Tunesfork can do to someone: the product's whole promise is that the
// project arrives complete. Two different failures produce it, and they need
// different sentences.
//
//   external — the set points at audio living outside the project folder. It
//              was never in the manifest, so it never left the owner's machine.
//              Only the owner can fix this, with Collect All and Save.
//   missing  — the set points at audio inside the folder that is not there.
//              Already broken before upload; re-linking in Ableton is the fix.

function summarize(sampleCheck) {
  const missing = Number(sampleCheck?.missing ?? 0) || 0;
  const external = Number(sampleCheck?.external ?? 0) || 0;
  // No check at all is not the same as a clean check. Versions stored before
  // sample checking existed, and rows where the .als could not be read, are
  // unknown — and unknown must never render as "complete", which is the exact
  // false promise this module exists to prevent.
  const verified = sampleCheck != null && sampleCheck.verified !== false;
  const missingPaths = Array.isArray(sampleCheck?.missing_paths) ? sampleCheck.missing_paths : [];
  const externalPaths = Array.isArray(sampleCheck?.external_paths) ? sampleCheck.external_paths : [];
  return {
    verified,
    missing,
    external,
    total: missing + external,
    complete: verified && missing === 0 && external === 0,
    // Show the files themselves. "3 samples are missing" is a statistic; naming
    // them is what lets someone recognise the sound they lost.
    names: [...externalPaths, ...missingPaths].map(basename).slice(0, 5),
  };
}

function basename(filePath) {
  const parts = String(filePath || "").split(/[\\/]/);
  return parts[parts.length - 1] || String(filePath || "");
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// What the person who just opened a shared project needs to know. They cannot
// fix external samples themselves, so the action names the person who can.
function openWarning({ projectName, sampleCheck, ownerName }) {
  const summary = summarize(sampleCheck);
  if (summary.complete) return null;
  const who = ownerName ? `Ask ${ownerName}` : "Ask the project owner";
  const subject = projectName ? `"${projectName}"` : "This project";

  if (!summary.verified) {
    return {
      severity: "warn",
      title: "Sample check unavailable",
      body: `Tunesfork could not read ${subject}'s sample list, so it cannot confirm the audio is complete.`,
      action: null,
      summary,
    };
  }
  if (summary.external > 0) {
    return {
      severity: "error",
      title: `${plural(summary.total, "sample")} did not come with this project`,
      body: `${subject} points at audio stored outside the project folder, so it was never uploaded. ${who} to run File → Collect All and Save in Ableton, then save again.`,
      action: "notify-owner",
      summary,
    };
  }
  return {
    severity: "error",
    title: `${plural(summary.missing, "sample")} missing from this project`,
    body: `${subject} refers to audio that is not in the project folder. Ableton will show ${summary.missing === 1 ? "it" : "them"} as offline. ${who} to re-link the audio and save again.`,
    action: "notify-owner",
    summary,
  };
}

// What the owner needs to know, before their incompleteness becomes someone
// else's wasted afternoon. Sharing is the moment this stops being private.
function shareWarning({ projectName, sampleCheck }) {
  const summary = summarize(sampleCheck);
  if (summary.complete) return null;
  const subject = projectName ? `"${projectName}"` : "This project";
  if (!summary.verified) {
    return {
      severity: "warn",
      title: "Sample completeness unknown",
      body: `Tunesfork could not read the sample list for ${subject}. Collaborators may open it to missing audio.`,
      summary,
    };
  }
  const what = summary.external > 0
    ? `${plural(summary.external, "sample")} live outside the project folder and will not reach collaborators`
    : `${plural(summary.missing, "sample")} referenced by the set ${summary.missing === 1 ? "is" : "are"} not in the project folder`;
  return {
    severity: summary.external > 0 ? "error" : "warn",
    title: "Collaborators will open this with missing audio",
    body: `${what}. In Ableton: File → Collect All and Save, then save once more so Tunesfork picks it up.`,
    summary,
  };
}

module.exports = { basename, openWarning, plural, shareWarning, summarize };
