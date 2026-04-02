import pako from "pako";

export interface AlsMetadata {
  projectName: string;
  bpm: number | null;
  plugins: string[];
}

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

    return { projectName, bpm, plugins: Array.from(plugins) };
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
