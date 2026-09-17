// Which projects in the watched folders have never reached the cloud.
//
// The watcher only ever reacts to a save. A project that is sitting in a
// watched folder but has not been opened since it was added is invisible to
// Tunesfork — the user believes the folder is covered, and it is not. This is
// what lets the app say so.
const path = require("node:path");

function projectDisplayName(folder) {
  return path.basename(folder).replace(/ Project$/i, "");
}

// A project counts as backed up when something maps its folder to a cloud
// project — the path key, or the marker carried inside the folder.
function findUnbackedProjects(projects, projectLinks = {}, { normalize = path.resolve, readMarker = null } = {}) {
  const linked = new Set();
  for (const link of Object.values(projectLinks || {})) {
    if (link?.projectId && link.folder) linked.add(normalize(link.folder));
  }
  return (projects || [])
    .filter((project) => {
      const folder = normalize(project.folder);
      if (linked.has(folder)) return false;
      if (readMarker && readMarker(folder)?.projectId) return false;
      return true;
    })
    .map((project) => ({ folder: normalize(project.folder), name: projectDisplayName(project.folder) }));
}

// Notify when the set of uncovered projects actually changes, and never more
// than once a day for the same set. Repeating the same warning every scan is
// how a useful notice becomes something the user turns off.
const DEFAULT_REMIND_AFTER_MS = 24 * 60 * 60 * 1000;

function signatureOf(unbacked) {
  return unbacked.map((project) => project.folder).sort().join("\n");
}

function shouldNotifyUnbacked(unbacked, previous, now = Date.now(), remindAfterMs = DEFAULT_REMIND_AFTER_MS) {
  if (!unbacked || unbacked.length === 0) return false;
  if (!previous || !previous.signature) return true;
  if (previous.signature !== signatureOf(unbacked)) return true;
  return !Number.isFinite(previous.at) || now - previous.at >= remindAfterMs;
}

function unbackedNotification(unbacked) {
  const count = unbacked.length;
  if (count === 1) {
    return {
      title: "This project is not backed up",
      body: `"${unbacked[0].name}" is in a watched folder but has never been saved to the cloud. Back it up now.`,
    };
  }
  const names = unbacked.slice(0, 3).map((project) => project.name).join(", ");
  return {
    title: `${count} projects are not backed up`,
    body: `${names}${count > 3 ? ` and ${count - 3} more` : ""} are in your watched folders but have never been saved to the cloud.`,
  };
}

module.exports = {
  DEFAULT_REMIND_AFTER_MS,
  findUnbackedProjects,
  projectDisplayName,
  shouldNotifyUnbacked,
  signatureOf,
  unbackedNotification,
};
