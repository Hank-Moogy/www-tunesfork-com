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

export interface AlsMetadata {
  projectName: string;
  bpm: number | null;
  plugins: string[];
  tracks: Track[];
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

    // Extract plugin names from <PluginDesc> → <VstPluginInfo> or <AuPluginInfo>
    const plugins = new Set<string>();
    const pluginMatches = xml.matchAll(/<(?:VstPluginInfo|AuPluginInfo)[^>]*>[\s\S]*?<PlugName\s+Value="([^"]+)"/g);
    for (const m of pluginMatches) {
      if (m[1]) plugins.add(m[1]);
    }

    // Extract tracks and clips
    const tracks: Track[] = [];
    const trackTypeMap: Record<string, Track["type"]> = {
      AudioTrack: "audio",
      MidiTrack: "midi",
      ReturnTrack: "return",
      GroupTrack: "group",
    };

    for (const [tag, type] of Object.entries(trackTypeMap)) {
      // Find each track block
      const trackRegex = new RegExp(`<${tag}\\s[^>]*Id="\\d+"[^>]*>([\\s\\S]*?)(?=<(?:AudioTrack|MidiTrack|ReturnTrack|GroupTrack|MasterTrack)\\s|$)`, "g");
      let trackMatch;
      while ((trackMatch = trackRegex.exec(xml)) !== null) {
        const trackBlock = trackMatch[1];

        // Extract track name
        const nameMatch = trackBlock.match(/<EffectiveName\s+Value="([^"]*)"/);
        const name = nameMatch?.[1] || `${type} track`;

        // Extract color
        const colorMatch = trackBlock.match(/<Color\s+Value="(\d+)"/);
        const color = colorMatch ? parseInt(colorMatch[1]) : 0;

        // Extract clips
        const clips: Clip[] = [];
        const clipRegex = /<(?:AudioClip|MidiClip)\s[^>]*>[\s\S]*?<CurrentStart\s+Value="([^"]+)"[\s\S]*?<CurrentEnd\s+Value="([^"]+)"[\s\S]*?(?:<Name\s+Value="([^"]*)")?/g;
        let clipMatch;
        while ((clipMatch = clipRegex.exec(trackBlock)) !== null) {
          const start = parseFloat(clipMatch[1]);
          const end = parseFloat(clipMatch[2]);
          const clipName = clipMatch[3] || "";
          if (!isNaN(start) && !isNaN(end) && end > start) {
            clips.push({ name: clipName, start, end });
          }
        }

        tracks.push({ name, type, color, clips });
      }
    }

    return { projectName, bpm, plugins: Array.from(plugins), tracks };
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
}

/**
 * Validate a selected folder for Ableton project structure.
 */
export function validateFolder(files: File[]): FolderValidation {
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

  if (!hasSamplesFolder) {
    warnings.push(
      "No samples folder detected. Your collaborator may get missing file errors. Did you run 'Collect All and Save' in Ableton before uploading?"
    );
  }

  if (totalSizeBytes > 1024 * 1024 * 1024) {
    warnings.push("This is a large project — upload may take several minutes.");
  }

  return { alsFiles, hasSamplesFolder, totalSizeBytes, allFiles: files, errors, warnings };
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
