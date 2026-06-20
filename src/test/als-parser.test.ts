import { describe, expect, it } from "vitest";
import pako from "pako";
import { parseAlsFile } from "@/lib/als-parser";

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
    <Scenes><Scene Id="0"><Name Value="Intro"/></Scene></Scenes>
  </LiveSet>
</Ableton>`;

describe("parseAlsFile", () => {
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
  });
});
