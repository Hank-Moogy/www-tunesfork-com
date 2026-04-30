// Lightweight .als parser for the desktop app.
// Mirrors the metadata extraction we do in the web UploadModal so that
// every desktop save uploads fresh tracks/plugins/bpm with the new version.
//
// .als files are gzip-compressed XML. We extract:
//   - bpm
//   - plugin names (VST/AU)
//   - tracks: name, type, color (clip-level extraction skipped — not needed
//     for the dashboard preview and would require a real XML parser)
const fs = require("fs");
const zlib = require("zlib");

function safeMatchAll(xml, regex) {
  const out = [];
  let m;
  while ((m = regex.exec(xml)) !== null) out.push(m);
  return out;
}

function parseAlsFile(alsPath) {
  try {
    const buf = fs.readFileSync(alsPath);
    let xml;
    try {
      xml = zlib.gunzipSync(buf).toString("utf8");
    } catch {
      // Some .als files (rare) aren't gzipped; fall back to raw text.
      xml = buf.toString("utf8");
    }

    // BPM: <Tempo>… <Manual Value="…"/>
    let bpm = null;
    const tempoMatch = xml.match(/<Tempo[^>]*>[\s\S]*?<Manual\s+Value="([^"]+)"/);
    if (tempoMatch) {
      const parsed = parseFloat(tempoMatch[1]);
      if (!isNaN(parsed) && parsed > 0) bpm = Math.round(parsed);
    }

    // Plugins: VstPluginInfo / AuPluginInfo → PlugName
    const plugins = new Set();
    const pluginRe = /<(?:VstPluginInfo|AuPluginInfo)[^>]*>[\s\S]*?<PlugName\s+Value="([^"]+)"/g;
    for (const m of safeMatchAll(xml, pluginRe)) {
      if (m[1]) plugins.add(m[1]);
    }

    // Tracks: scan for <AudioTrack>, <MidiTrack>, <ReturnTrack>, <GroupTrack> blocks
    // and pull out the EffectiveName + ColorIndex inside each one.
    const tracks = [];
    const trackTypes = {
      AudioTrack: "audio",
      MidiTrack: "midi",
      ReturnTrack: "return",
      GroupTrack: "group",
    };
    for (const tag of Object.keys(trackTypes)) {
      const blockRe = new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, "g");
      for (const blockMatch of safeMatchAll(xml, blockRe)) {
        const block = blockMatch[0];
        const nameM = block.match(/<EffectiveName\s+Value="([^"]+)"/);
        const colorM = block.match(/<ColorIndex\s+Value="(\d+)"/) ||
                       block.match(/<Color\s+Value="(\d+)"/);
        tracks.push({
          name: nameM ? nameM[1] : `${trackTypes[tag]} track`,
          type: trackTypes[tag],
          color: colorM ? parseInt(colorM[1], 10) : 0,
          clips: [], // intentionally empty — clip waveform view comes from web upload
        });
      }
    }

    return {
      bpm,
      plugins: Array.from(plugins),
      tracks,
    };
  } catch (e) {
    return null;
  }
}

module.exports = { parseAlsFile };
