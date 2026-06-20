const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  assertFolderReadable,
  folderAccessMessage,
  isFolderPermissionError,
} = require("../folder-access.cjs");
const { parseAlsFile } = require("../als-parser.cjs");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tunesfork-folder-access-"));
try {
  assert.equal(assertFolderReadable(tmp), path.resolve(tmp));

  const file = path.join(tmp, "not-a-folder");
  fs.writeFileSync(file, "x");
  assert.throws(() => assertFolderReadable(file), (error) => error.code === "ENOTDIR");

  assert.equal(isFolderPermissionError({ code: "EPERM" }), true);
  assert.equal(isFolderPermissionError({ code: "EACCES" }), true);
  assert.equal(isFolderPermissionError({ code: "ENOENT" }), false);

  const permissionMessage = folderAccessMessage(tmp, { code: "EPERM" });
  assert.match(permissionMessage, /Privacy & Security/);
  assert.match(permissionMessage, /Choose the folder again/);

  const missingMessage = folderAccessMessage(path.join(tmp, "missing"), { code: "ENOENT" });
  assert.match(missingMessage, /no longer exists/);

  const alsFixture = `<?xml version="1.0"?>
  <Ableton Creator="Ableton Live 12.0"><LiveSet><Tracks><MidiTrack>
    <Name><EffectiveName Value="Keys"/></Name><ColorIndex Value="10"/>
    <DeviceChain><MainSequencer>
      <ClipSlotList><ClipSlot Id="0"><ClipSlot><Value><MidiClip><CurrentStart Value="0"/><CurrentEnd Value="8"/><Name Value="Session Keys"/><Color Value="11"/></MidiClip></Value></ClipSlot></ClipSlot></ClipSlotList>
      <ClipTimeable><ArrangerAutomation><Events><MidiClip><CurrentStart Value="16"/><CurrentEnd Value="32"/><Name Value="Arrangement Keys"/></MidiClip></Events></ArrangerAutomation></ClipTimeable>
    </MainSequencer></DeviceChain>
  </MidiTrack></Tracks><Scenes><Scene Id="0"><Name Value="Intro"/></Scene></Scenes></LiveSet></Ableton>`;
  const alsPath = path.join(tmp, "fixture.als");
  fs.writeFileSync(alsPath, require("node:zlib").gzipSync(alsFixture));
  const metadata = parseAlsFile(alsPath);
  assert.equal(metadata.tracks[0].clips.length, 1);
  assert.equal(metadata.tracks[0].clips[0].name, "Arrangement Keys");
  assert.equal(metadata.tracks[0].sessionClips.length, 1);
  assert.equal(metadata.tracks[0].sessionClips[0].sceneName, "Intro");

  console.log("[test-folder-access] ok");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
