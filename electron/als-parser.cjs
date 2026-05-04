// Lightweight .als parser for the desktop app.
// Mirrors the metadata extraction we do in the web UploadModal so that
// every desktop save uploads fresh tracks/plugins/bpm/clips with the new version.
//
// .als files are gzip-compressed XML. We extract:
//   - bpm
//   - plugin names (VST/AU)
//   - tracks: name, type, color, AND clips (name, start, end in beats)
const fs = require("fs");
const zlib = require("zlib");
const { XMLParser } = require("fast-xml-parser");

const TRACK_TYPE_MAP = {
  AudioTrack: "audio",
  MidiTrack: "midi",
  ReturnTrack: "return",
  GroupTrack: "group",
};

// fast-xml-parser config: keep attributes, no array coercion (we'll normalize),
// and don't process text-only nodes specially.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  // We don't know up-front which elements repeat, so force arrays for the
  // ones we iterate over to keep traversal uniform.
  isArray: (name) =>
    name === "AudioClip" ||
    name === "MidiClip" ||
    name === "AudioTrack" ||
    name === "MidiTrack" ||
    name === "ReturnTrack" ||
    name === "GroupTrack" ||
    name === "SampleRef" ||
    name === "RelativePathElement",
});

function attrValue(node, attr) {
  if (!node || typeof node !== "object") return undefined;
  return node[`@_${attr}`];
}

// Walk the parsed tree and return any node matching `name`. Used so we don't
// have to know the exact path to <Tracks> (it varies by Live version).
function findFirst(node, name) {
  if (!node || typeof node !== "object") return null;
  if (node[name]) return node[name];
  for (const k of Object.keys(node)) {
    if (k.startsWith("@_")) continue;
    const child = node[k];
    if (Array.isArray(child)) {
      for (const c of child) {
        const r = findFirst(c, name);
        if (r) return r;
      }
    } else if (typeof child === "object") {
      const r = findFirst(child, name);
      if (r) return r;
    }
  }
  return null;
}

// Recursively collect every node with the given tag name, regardless of depth.
function collectAll(node, name, out) {
  if (!node || typeof node !== "object") return;
  if (node[name]) {
    const v = node[name];
    if (Array.isArray(v)) out.push(...v);
    else out.push(v);
  }
  for (const k of Object.keys(node)) {
    if (k.startsWith("@_") || k === name) continue;
    const child = node[k];
    if (Array.isArray(child)) child.forEach((c) => collectAll(c, name, out));
    else if (typeof child === "object") collectAll(child, name, out);
  }
}

function parseClips(trackEl) {
  const clips = [];
  // Audio + MIDI clips both live somewhere under the track. The exact path
  // changes between Live versions (Sample / MainSequencer / ClipSlotList /
  // Arrangement…), so just walk the whole subtree.
  const audio = [];
  const midi = [];
  collectAll(trackEl, "AudioClip", audio);
  collectAll(trackEl, "MidiClip", midi);

  for (const clip of [...audio, ...midi]) {
    // In Ableton XML these fields are not always direct children of the clip.
    // The web parser uses querySelector(), so mirror that by finding them at
    // any depth inside the AudioClip/MidiClip node.
    const startNode = findFirst(clip, "CurrentStart");
    const endNode = findFirst(clip, "CurrentEnd");
    const start = parseFloat(attrValue(startNode, "Value"));
    const end = parseFloat(attrValue(endNode, "Value"));

    const nameNode = findFirst(clip, "Name");
    const effectiveNameNode = findFirst(nameNode, "EffectiveName") || findFirst(clip, "EffectiveName");
    const name = attrValue(effectiveNameNode, "Value") || attrValue(nameNode, "Value") || "";

    if (!isNaN(start) && !isNaN(end) && end > start) {
      clips.push({ name, start, end });
    }
  }
  return clips;
}

function parseTrackElement(trackEl, type) {
  // Name: <Name><EffectiveName Value="…"/></Name>
  let name = `${type} track`;
  if (trackEl.Name) {
    name = attrValue(trackEl.Name?.EffectiveName, "Value")
        || attrValue(trackEl.Name, "Value")
        || name;
  }
  const colorRaw =
    attrValue(trackEl.ColorIndex, "Value") ||
    attrValue(trackEl.Color, "Value");
  const color = colorRaw ? parseInt(colorRaw, 10) || 0 : 0;

  return { name, type, color, clips: parseClips(trackEl) };
}

function parseAlsFile(alsPath) {
  try {
    const buf = fs.readFileSync(alsPath);
    let xml;
    try {
      xml = zlib.gunzipSync(buf).toString("utf8");
    } catch {
      xml = buf.toString("utf8");
    }

    const doc = parser.parse(xml);

    // BPM: <Tempo>…<Manual Value="…"/></Tempo>
    let bpm = null;
    const tempo = findFirst(doc, "Tempo");
    if (tempo) {
      const v = parseFloat(attrValue(tempo.Manual, "Value"));
      if (!isNaN(v) && v > 0) bpm = Math.round(v);
    }

    // Plugins: <PluginDesc> → <VstPluginInfo|AuPluginInfo> → <PlugName Value="…"/>
    const pluginNodes = [];
    collectAll(doc, "VstPluginInfo", pluginNodes);
    collectAll(doc, "AuPluginInfo", pluginNodes);
    // Live 11+ uses Vst3PluginInfo too — include for completeness.
    collectAll(doc, "Vst3PluginInfo", pluginNodes);
    const plugins = new Set();
    for (const p of pluginNodes) {
      const n = attrValue(p.PlugName, "Value");
      if (n) plugins.add(n);
    }

    // Tracks: walk <Tracks> container if present, else search anywhere.
    const tracks = [];
    const tracksContainer = findFirst(doc, "Tracks") || doc;
    for (const tag of Object.keys(TRACK_TYPE_MAP)) {
      const list = tracksContainer[tag];
      if (!list) continue;
      const arr = Array.isArray(list) ? list : [list];
      for (const t of arr) tracks.push(parseTrackElement(t, TRACK_TYPE_MAP[tag]));
    }

    // Sample references — supports Live ≤11 (nested RelativePathElement + HasRelativePath)
    // and Live 12+ (single <RelativePath Value="…"/> + <RelativePathType Value="…"/>).
    const sampleNodes = [];
    collectAll(doc, "SampleRef", sampleNodes);
    const samples = [];
    for (const sr of sampleNodes) {
      const fileRef = sr.FileRef || sr;
      const absolutePath = attrValue(fileRef.Path, "Value") || null;

      let relativePath = null;
      const relPath = fileRef.RelativePath;
      if (relPath) {
        // Live 12 attribute form
        const attrVal = attrValue(relPath, "Value");
        if (attrVal && attrVal.length > 0) {
          relativePath = attrVal;
        } else {
          const elems = relPath.RelativePathElement;
          const arr = Array.isArray(elems) ? elems : elems ? [elems] : [];
          const segs = [];
          for (const rpe of arr) {
            const dir = attrValue(rpe, "Dir");
            if (dir) segs.push(dir);
          }
          const fileName =
            attrValue(fileRef.Name, "Value") ||
            (absolutePath ? absolutePath.split(/[\\/]/).pop() || "" : "");
          if (segs.length > 0 || fileName) {
            relativePath = [...segs, fileName].filter(Boolean).join("/");
          }
        }
      }

      let hasRelativePath;
      if (fileRef.HasRelativePath) {
        hasRelativePath = attrValue(fileRef.HasRelativePath, "Value") === "true";
      } else {
        const typeVal = attrValue(fileRef.RelativePathType, "Value");
        hasRelativePath = !!relativePath && (typeVal === "1" || typeVal === "3" || typeVal == null);
      }

      if (!absolutePath && !relativePath) continue;
      samples.push({ relativePath, absolutePath, hasRelativePath });
    }

    return { bpm, plugins: Array.from(plugins), tracks, samples };
  } catch (e) {
    return null;
  }
}

module.exports = { parseAlsFile };
