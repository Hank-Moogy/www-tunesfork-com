

## Investigation: ALS Track Parsing Issues

### Root Cause

The parser uses **regex on raw XML** to find tracks and extract names. This is fundamentally fragile for Ableton's XML structure because:

1. **Nested tracks inside groups**: Ableton nests `<AudioTrack>` and `<MidiTrack>` tags inside `<GroupTrack>` containers. The regex finds *all* track tags at every nesting level, creating duplicate/phantom entries and wrong boundaries between tracks.

2. **Wrong name extraction**: `<EffectiveName>` appears on many nested elements (devices, chains, sends). The regex grabs the *first* match in the block, which is often a device name or chain name — not the track name. This explains the "odd names."

3. **Boundary slicing is broken**: Each track's XML block is sliced from one `<AudioTrack>` tag to the next. With nesting, a GroupTrack's block includes all its child tracks, so boundaries overlap and names bleed across tracks.

### The Fix: Use the Browser's DOMParser

Instead of regex, parse the decompressed XML with `DOMParser` (built into every browser, zero dependencies). This gives us a proper DOM tree where we can:

- Select only **top-level** tracks under `<Tracks>` (not nested ones inside groups)
- Navigate directly to each track's `<Name><EffectiveName Value="..."/>` path
- Correctly handle group tracks and their children

### Plan

**File: `src/lib/als-parser.ts`** — Rewrite the track extraction section:

1. After `pako.inflate` and decoding the XML string, parse it with `new DOMParser().parseFromString(xml, "text/xml")`
2. Find the `<Tracks>` container element
3. Iterate its direct children (`AudioTrack`, `MidiTrack`, `ReturnTrack`, `GroupTrack`)
4. For each track element, extract:
   - **Name**: Navigate to the track element's direct `<Name>` child → `<EffectiveName Value="..."/>`
   - **Color**: Direct `<ColorIndex>` or `<Color>` child → `Value` attribute
   - **Clips**: Find `<AudioClip>` / `<MidiClip>` descendants, extract `CurrentStart`, `CurrentEnd`, `Name`
5. Keep BPM and plugin extraction as-is (those regex patterns work fine on flat structures)

This approach will:
- Match Ableton's actual track count and order
- Get correct track names (not device/chain names)
- Handle group tracks properly
- Zero new dependencies (DOMParser is a browser API)

