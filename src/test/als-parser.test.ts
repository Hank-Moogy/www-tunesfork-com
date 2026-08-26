import { describe, expect, it } from "vitest";
import pako from "pako";
import { parseAlsFile, validateFolder } from "@/lib/als-parser";

const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton Creator="Ableton Live 12.0">
  <LiveSet>
    <Tracks>
      <MidiTrack>
        <Name><EffectiveName Value="Keys"/></Name>
        <ColorIndex Value="10"/>
        <DeviceChain>
          <MainSequencer>
            <ClipSlotList>
              <ClipSlot Id="0"><ClipSlot><Value><MidiClip><CurrentStart Value="0"/><CurrentEnd Value="8"/><Name Value="Session Keys"/><Color Value="11"/></MidiClip></Value></ClipSlot></ClipSlot>
            </ClipSlotList>
            <ClipTimeable>
              <ArrangerAutomation>
                <Events><MidiClip><CurrentStart Value="16"/><CurrentEnd Value="32"/><Name Value="Arrangement Keys"/></MidiClip></Events>
              </ArrangerAutomation>
            </ClipTimeable>
          </MainSequencer>
        </DeviceChain>
      </MidiTrack>
    </Tracks>
    <PluginDesc>
      <VstPluginInfo><PlugName Value="Legacy Synth"/></VstPluginInfo>
      <Vst3PluginInfo><PlugName Value="Modern Synth"/></Vst3PluginInfo>
      <AuPluginInfo><PlugName Value="Mac Synth"/></AuPluginInfo>
    </PluginDesc>
    <Scenes><Scene Id="0"><Name Value="Intro"/></Scene></Scenes>
  </LiveSet>
</Ableton>`;

describe("parseAlsFile", () => {
  it("rejects a set whose metadata cannot be inspected", async () => {
    const compressed = pako.gzip("<Ableton><LiveSet>");
    const file = {
      name: "broken.als",
      arrayBuffer: async () =>
        compressed.buffer.slice(
          compressed.byteOffset,
          compressed.byteOffset + compressed.byteLength,
        ),
    } as File;

    await expect(parseAlsFile(file)).resolves.toBeNull();
  });

  it("keeps Arrangement and Session clips separate", async () => {
    const compressed = pako.gzip(fixture);
    const file = {
      name: "fixture.als",
      arrayBuffer: async () =>
        compressed.buffer.slice(
          compressed.byteOffset,
          compressed.byteOffset + compressed.byteLength,
        ),
    } as File;
    const metadata = await parseAlsFile(file);

    expect(metadata?.tracks).toHaveLength(1);
    expect(metadata?.tracks[0].clips).toEqual([
      { name: "Arrangement Keys", start: 16, end: 32 },
    ]);
    expect(metadata?.tracks[0].sessionClips).toEqual([
      {
        name: "Session Keys",
        sceneIndex: 0,
        sceneName: "Intro",
        length: 8,
        color: 11,
      },
    ]);
    expect(metadata?.plugins).toEqual(["Legacy Synth", "Modern Synth", "Mac Synth"]);
  });

  it("treats missing and external sample references as upload-blocking errors", () => {
    const als = new File(["set"], "Song.als");
    Object.defineProperty(als, "webkitRelativePath", { value: "Song Project/Song.als" });

    const missing = validateFolder([als], [
      { relativePath: "Samples/Collected/kick.wav", absolutePath: "/Library/kick.wav", hasRelativePath: true },
      { relativePath: null, absolutePath: "/Library/snare.wav", hasRelativePath: false },
    ]);

    expect(missing.errors).toHaveLength(2);
    expect(missing.missingSamples).toEqual(["Samples/Collected/kick.wav"]);
    expect(missing.nonRelativeSamples).toEqual(["/Library/snare.wav"]);

    const sample = new File(["audio"], "kick.wav");
    Object.defineProperty(sample, "webkitRelativePath", {
      value: "Song Project/Samples/Collected/kick.wav",
    });
    const complete = validateFolder([als, sample], [
      { relativePath: "Samples/Collected/kick.wav", absolutePath: "/Library/kick.wav", hasRelativePath: true },
    ]);

    expect(complete.errors).toEqual([]);
    expect(complete.missingSamples).toEqual([]);
  });
});
