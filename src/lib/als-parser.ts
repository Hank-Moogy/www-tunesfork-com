import pako from "pako";

export interface Clip {
  name: string;
  start: number; // in beats
  end: number;   // in beats
}

export interface Track {
  name: string;
  type: "audio" | "midi" | "return" | "group";
  color: number; // Ableton color index
  clips: Clip[];
}

export interface SampleRef {
  /** Relative path resolved from <RelativePath> elements (e.g. "Samples/Recorded/kick.wav"). */
  relativePath: string | null;
  /** Absolute path from <Path Value="…"/>. Present on most refs. */
  absolutePath: string | null;
  /** True if Ableton marked this ref as having a usable relative path. */
  hasRelativePath: boolean;
}

export interface AlsMetadata {
  projectName: string;
  bpm: number | null;
  plugins: string[];
  tracks: Track[];
  samples: SampleRef[];
  /** Ableton Live version that produced this .als (e.g. "Ableton Live 11.3.13"). */
  abletonVersion: string | null;
}

// Ableton's 70-color palette (index → hex)
export const ABLETON_COLORS: string[] = [
  "#FF94A6","#FFA529","#CC9927","#F7F47C","#BFFB00","#1AFF2F","#25FFA8","#5CFFE8",
  "#8BC5FF","#5480E4","#92A7FF","#D86CE4","#E553A0","#FFFFFF","#FF3636","#F66C03",
  "#99724B","#FFF034","#87FF67","#3DC300","#00BFAF","#19E9FF","#10A4EE","#007DC0",
  "#886CE4","#B677C6","#FF39D4","#D0D0D0","#E2675A","#FFA374","#D3AD71","#E8E55C",
  "#C6E48B","#85C1A3","#9AD3C2","#B4D5E0","#A7C7E7","#849BC1","#B9A9D4","#CDB2CB",
  "#E4A0BE","#A9A9A9","#C6928A","#B78256","#A69279","#C2C57C","#9DBB84","#7DAF8C",
  "#85B5A4","#8EB9B3","#92B8C8","#84A0B5","#A09BB5","#B296B4","#BD93A8","#7B7B7B",
  "#AF7963","#A05B3C","#7E6C56","#A6A455","#83A06C","#6B9775","#73A58E","#7CAC9F",
  "#84AAB4","#6D8AA1","#8B839D","#A07F98","#A5799B","#5E5E5E","#9A6B56","#825A3D",
];

/**
 * Parse an .als file (gzip-compressed XML) to extract metadata.
 * Returns null on failure — never blocks the user.
 */
export async function parseAlsFile(file: File): Promise<AlsMetadata | null> {
  try {
    const buffer = await file.arrayBuffer();
    const decompressed = pako.inflate(new Uint8Array(buffer));
    const xml = new TextDecoder().decode(decompressed);

    // Extract project name from the file name (remove .als extension)
    const projectName = file.name.replace(/\.als$/i, "");

    // Extract BPM — look for <Tempo> → <Manual Value="..." />
    let bpm: number | null = null;
    const tempoMatch = xml.match(/<Tempo[^>]*>[\s\S]*?<Manual\s+Value="([^"]+)"/);
    if (tempoMatch) {
      const parsed = parseFloat(tempoMatch[1]);
      if (!isNaN(parsed) && parsed > 0) bpm = Math.round(parsed);
    }

    // Extract Ableton Live version from the root <Ableton ... Creator="Ableton Live X.Y.Z" />
    let abletonVersion: string | null = null;
    const creatorMatch = xml.match(/<Ableton\b[^>]*\bCreator="([^"]+)"/);
    if (creatorMatch) {
      abletonVersion = creatorMatch[1];
    } else {
      const majMatch = xml.match(/<Ableton\b[^>]*\bMajorVersion="([^"]+)"/);
      const minMatch = xml.match(/<Ableton\b[^>]*\bMinorVersion="([^"]+)"/);
      if (majMatch || minMatch) {
        abletonVersion = `Ableton Live ${majMatch?.[1] ?? ""}${minMatch ? ` (${minMatch[1]})` : ""}`.trim();
      }
    }

    // Extract plugin names from <PluginDesc> → <VstPluginInfo> or <AuPluginInfo>
    const plugins = new Set<string>();
    const pluginMatches = xml.matchAll(/<(?:VstPluginInfo|AuPluginInfo)[^>]*>[\s\S]*?<PlugName\s+Value="([^"]+)"/g);
    for (const m of pluginMatches) {
      if (m[1]) plugins.add(m[1]);
    }

    // Extract tracks and clips using DOMParser for accurate traversal
    const tracks: Track[] = [];
    const doc = new DOMParser().parseFromString(xml, "text/xml");

    const trackTypeMap: Record<string, Track["type"]> = {
      AudioTrack: "audio",
      MidiTrack: "midi",
      ReturnTrack: "return",
      GroupTrack: "group",
    };

    // Helper: get direct child element by tag name (not nested descendants)
    const directChild = (el: Element, tag: string): Element | null => {
      for (let i = 0; i < el.children.length; i++) {
        if (el.children[i].tagName === tag) return el.children[i];
      }
      return null;
    };

    const parseTrackElement = (trackEl: Element, type: Track["type"]): Track => {
      // Name: <Name><EffectiveName Value="..."/>
      const nameEl = directChild(trackEl, "Name");
      const effectiveName = nameEl ? directChild(nameEl, "EffectiveName") : null;
      const name = effectiveName?.getAttribute("Value") || `${type} track`;

      // Color: <ColorIndex Value="..."/> or <Color Value="..."/>
      const colorEl = directChild(trackEl, "ColorIndex") || directChild(trackEl, "Color");
      const color = colorEl ? parseInt(colorEl.getAttribute("Value") || "0") : 0;

      // Clips: find all AudioClip / MidiClip descendants
      const clips: Clip[] = [];
      const clipEls = trackEl.querySelectorAll("AudioClip, MidiClip");
      clipEls.forEach((clipEl) => {
        const startEl = clipEl.querySelector("CurrentStart");
        const endEl = clipEl.querySelector("CurrentEnd");
        const clipNameEl = clipEl.querySelector("Name > EffectiveName") || clipEl.querySelector("Name");
        const start = startEl ? parseFloat(startEl.getAttribute("Value") || "") : NaN;
        const end = endEl ? parseFloat(endEl.getAttribute("Value") || "") : NaN;
        const clipName = clipNameEl?.getAttribute("Value") || "";
        if (!isNaN(start) && !isNaN(end) && end > start) {
          clips.push({ name: clipName, start, end });
        }
      });

      return { name, type, color, clips };
    };

    // Find the <Tracks> container and iterate direct children
    const tracksContainer = doc.querySelector("Tracks");
    if (tracksContainer) {
      for (let i = 0; i < tracksContainer.children.length; i++) {
        const child = tracksContainer.children[i];
        const type = trackTypeMap[child.tagName];
        if (type) {
          tracks.push(parseTrackElement(child, type));
        }
      }
    }

    // Extract sample references — every <SampleRef><FileRef>…</FileRef></SampleRef>
    // Two formats exist:
    //   • Live ≤11: <RelativePath><RelativePathElement Dir="Samples"/><RelativePathElement Dir="Imported"/></RelativePath>
    //               + <HasRelativePath Value="true|false"/>
    //   • Live 12+: <RelativePath Value="Samples/Imported/foo.wav"/> + <RelativePathType Value="3"/>
    //               (no HasRelativePath element). RelativePathType=3 means "relative to project".
    const samples: SampleRef[] = [];
    const sampleRefEls = doc.querySelectorAll("SampleRef");
    sampleRefEls.forEach((sampleRef) => {
      const fileRef = sampleRef.querySelector("FileRef") || sampleRef;

      // Absolute path
      const pathEl = fileRef.querySelector(":scope > Path") || fileRef.querySelector("Path");
      const absolutePath = pathEl?.getAttribute("Value") || null;

      // Relative path — prefer Live 12 attribute form, fall back to nested elements.
      let relativePath: string | null = null;
      const relPathEl = fileRef.querySelector("RelativePath");
      if (relPathEl) {
        const attrVal = relPathEl.getAttribute("Value");
        if (attrVal && attrVal.length > 0) {
          relativePath = attrVal;
        } else {
          const segs: string[] = [];
          relPathEl.querySelectorAll("RelativePathElement").forEach((rpe) => {
            const dir = rpe.getAttribute("Dir");
            if (dir) segs.push(dir);
          });
          const nameEl = fileRef.querySelector(":scope > Name") || fileRef.querySelector("Name");
          const fileName =
            nameEl?.getAttribute("Value") ||
            (absolutePath ? absolutePath.split(/[\\/]/).pop() || "" : "");
          if (segs.length > 0 || fileName) {
            relativePath = [...segs, fileName].filter(Boolean).join("/");
          }
        }
      }

      // hasRelativePath: Live 11 has an explicit flag; Live 12 implies it via
      // a non-empty RelativePath plus RelativePathType ∈ {1,3} (project-relative).
      const hasRelEl = fileRef.querySelector("HasRelativePath");
      let hasRelativePath: boolean;
      if (hasRelEl) {
        hasRelativePath = hasRelEl.getAttribute("Value") === "true";
      } else {
        const typeEl = fileRef.querySelector("RelativePathType");
        const typeVal = typeEl?.getAttribute("Value");
        hasRelativePath = !!relativePath && (typeVal === "1" || typeVal === "3" || typeVal === null || typeVal === undefined);
      }

      // Skip refs with no path at all (e.g. impulse responses without a file)
      if (!absolutePath && !relativePath) return;
      samples.push({ relativePath, absolutePath, hasRelativePath });
    });

    return { projectName, bpm, plugins: Array.from(plugins), tracks, samples };
  } catch {
    // Parsing failed — skip silently per spec
    return null;
  }
}

export interface FolderValidation {
  alsFiles: File[];
  hasSamplesFolder: boolean;
  totalSizeBytes: number;
  allFiles: File[];
  errors: string[];
  warnings: string[];
  /** Sample paths the .als references but that aren't in the uploaded files. */
  missingSamples: string[];
  /** Sample refs that have no relative path — they only exist on the uploader's machine. */
  nonRelativeSamples: string[];
}

/** Normalize a path for case-insensitive comparison and consistent separators. */
function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
}

/**
 * Validate a selected folder for Ableton project structure.
 * Pass `samples` from `parseAlsFile` to also detect missing / non-relative refs.
 */
export function validateFolder(files: File[], samples: SampleRef[] = []): FolderValidation {
  const alsFiles = files.filter((f) => f.name.toLowerCase().endsWith(".als"));
  const hasSamplesFolder = files.some((f) => {
    const parts = f.webkitRelativePath?.split("/") ?? [];
    return parts.some((p) => p.toLowerCase() === "samples");
  });
  const totalSizeBytes = files.reduce((sum, f) => sum + f.size, 0);

  const errors: string[] = [];
  const warnings: string[] = [];

  if (alsFiles.length === 0) {
    errors.push(
      "No Ableton Set file found. Make sure you selected a project folder, not a subfolder."
    );
  }

  // Build a set of file paths inside the upload, normalized.
  // We accept matches by either the full webkitRelativePath OR the trailing portion
  // (so that `<projectFolder>/Samples/x.wav` matches a relative ref of `Samples/x.wav`).
  const uploadedNormalized = new Set<string>();
  const uploadedTails: string[] = [];
  for (const f of files) {
    const rel = f.webkitRelativePath || f.name;
    const norm = normalizePath(rel);
    uploadedNormalized.add(norm);
    uploadedTails.push(norm);
  }

  const isPresent = (relPath: string): boolean => {
    const target = normalizePath(relPath);
    if (uploadedNormalized.has(target)) return true;
    // Allow matching when the upload includes the project folder as a prefix.
    return uploadedTails.some((u) => u === target || u.endsWith("/" + target));
  };

  const missingSamples: string[] = [];
  const nonRelativeSamples: string[] = [];

  for (const s of samples) {
    if (!s.relativePath || !s.hasRelativePath) {
      // No usable relative path — sample only exists on the uploader's disk.
      if (s.absolutePath) nonRelativeSamples.push(s.absolutePath);
      continue;
    }
    if (!isPresent(s.relativePath)) {
      missingSamples.push(s.relativePath);
    }
  }

  if (nonRelativeSamples.length > 0) {
    errors.push(
      `${nonRelativeSamples.length} sample(s) in your .als still point to absolute paths on your computer. ` +
        `In Ableton: File → Collect All and Save and tick every category (Factory Packs, User Library, Other locations), then re-upload.`
    );
  }

  if (missingSamples.length > 0) {
    errors.push(
      `${missingSamples.length} sample(s) referenced by your .als are missing from the folder you selected (e.g. ${missingSamples
        .slice(0, 3)
        .join(", ")}). Make sure you selected the full project folder, not just the .als file.`
    );
  }

  // Only warn about a missing samples folder when the .als didn't tell us anything.
  if (samples.length === 0 && !hasSamplesFolder && alsFiles.length > 0) {
    warnings.push(
      "No samples folder detected. If your project uses external samples, your collaborator may get missing file errors."
    );
  }

  if (totalSizeBytes > 1024 * 1024 * 1024) {
    warnings.push("This is a large project — upload may take several minutes.");
  }

  return {
    alsFiles,
    hasSamplesFolder,
    totalSizeBytes,
    allFiles: files,
    errors,
    warnings,
    missingSamples,
    nonRelativeSamples,
  };
}

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
