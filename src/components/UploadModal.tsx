import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import JSZip from "jszip";
import confetti from "canvas-confetti";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  FolderOpen,
  AlertTriangle,
  XCircle,
  Music,
  Check,
} from "lucide-react";
import {
  validateFolder,
  parseAlsFile,
  formatBytes,
  type AlsMetadata,
  type FolderValidation,
} from "@/lib/als-parser";

interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function UploadModal({ open, onOpenChange }: UploadModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // State
  const [step, setStep] = useState(1);
  const [validation, setValidation] = useState<FolderValidation | null>(null);
  const [selectedAls, setSelectedAls] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<AlsMetadata | null>(null);
  const [projectName, setProjectName] = useState("");
  const [bpm, setBpm] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preZippedBlob, setPreZippedBlob] = useState<Blob | null>(null);
  const [processing, setProcessing] = useState(false);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep(1);
    setValidation(null);
    setSelectedAls(null);
    setMetadata(null);
    setProjectName("");
    setBpm("");
    setChangeNote("");
    setAudioFile(null);
    setProgress(0);
    setProgressLabel("");
    setUploading(false);
    setDragOver(false);
    setPreZippedBlob(null);
    setProcessing(false);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  // Pick the latest .als file by name (files often contain dates like 2024-01-15)
  const pickLatestAls = (alsFiles: File[]): File => {
    if (alsFiles.length === 1) return alsFiles[0];
    // Sort descending by name — dates in filenames naturally sort this way
    return [...alsFiles].sort((a, b) => b.name.localeCompare(a.name))[0];
  };

  const advanceWithAls = async (als: File) => {
    setSelectedAls(als);
    const meta = await parseAlsFile(als);
    setMetadata(meta);
    setProjectName(meta?.projectName ?? als.name.replace(/\.als$/i, ""));
    setBpm(meta?.bpm?.toString() ?? "");
    setStep(2);
  };

  // Handle a direct .zip upload
  const handleZipSelect = useCallback(
    async (file: File) => {
      try {
        const zip = await JSZip.loadAsync(file);
        // Convert zip entries to pseudo-File objects for validation
        const entries: File[] = [];
        const promises: Promise<void>[] = [];
        zip.forEach((relativePath, zipEntry) => {
          if (zipEntry.dir) return;
          promises.push(
            zipEntry.async("blob").then((blob) => {
              const f = new File([blob], zipEntry.name, { type: blob.type });
              // Attach a fake webkitRelativePath for folder detection
              Object.defineProperty(f, "webkitRelativePath", { value: relativePath });
              entries.push(f);
            })
          );
        });
        await Promise.all(promises);

        const result = validateFolder(entries);
        setValidation(result);
        setPreZippedBlob(file); // Store original zip — upload as-is

        if (result.errors.length > 0) return;

        // Auto-select latest .als file
        const als = pickLatestAls(result.alsFiles);
        await advanceWithAls(als);
      } catch {
        setValidation({
          alsFiles: [],
          hasSamplesFolder: false,
          totalSizeBytes: 0,
          allFiles: [],
          errors: ["Could not read zip file. Make sure it's a valid .zip archive."],
          warnings: [],
        });
      }
    },
    []
  );

  // Step 1: Folder selection
  const handleFolderSelect = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      // Detect single .zip file
      if (files.length === 1 && files[0].name.toLowerCase().endsWith(".zip")) {
        return handleZipSelect(files[0]);
      }

      setPreZippedBlob(null);
      const fileArray = Array.from(files);
      const result = validateFolder(fileArray);
      setValidation(result);

      if (result.errors.length > 0) return;

      // Auto-select latest .als file
      const als = pickLatestAls(result.alsFiles);
      await advanceWithAls(als);
    },
    [handleZipSelect]
  );


  // Optimistic progress: smoothly animate from current to target over duration
  const animateProgress = (from: number, to: number, durationMs: number) => {
    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(elapsed / durationMs, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress(from + (to - from) * eased);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  // Step 4: Upload
  const handleUpload = async () => {
    if (!validation || !user) return;
    setUploading(true);
    setStep(4);

    // Kick off optimistic progress immediately
    setProgressLabel("Preparing project...");
    setProgress(5);
    animateProgress(5, 30, 1500);

    try {
      let blob: Blob;

      if (preZippedBlob) {
        blob = preZippedBlob;
        // Jump ahead since no zipping needed
        await new Promise((r) => setTimeout(r, 400));
        setProgress(35);
      } else {
        const zip = new JSZip();
        for (const file of validation.allFiles) {
          const path = file.webkitRelativePath || file.name;
          zip.file(path, file);
        }
        blob = await zip.generateAsync(
          { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
          (meta) => setProgress(15 + meta.percent * 0.25)
        );
      }

      // Upload zip
      setProgressLabel("Uploading...");
      animateProgress(40, 75, 3000);
      const zipPath = `${user.id}/${Date.now()}.zip`;
      const { error: zipError } = await supabase.storage
        .from("project-zips")
        .upload(zipPath, blob, { upsert: false });
      if (zipError) throw zipError;
      setProgress(80);

      // Upload audio preview (optional)
      let audioUrl: string | null = null;
      if (audioFile) {
        const audioPath = `${user.id}/${Date.now()}-preview.${audioFile.name.split(".").pop()}`;
        const { error: audioError } = await supabase.storage
          .from("audio-previews")
          .upload(audioPath, audioFile, { upsert: false });
        if (audioError) throw audioError;
        const { data: audioPublic } = supabase.storage
          .from("audio-previews")
          .getPublicUrl(audioPath);
        audioUrl = audioPublic.publicUrl;
      }
      setProgress(90);

      // Create project record
      const { data: project, error: projError } = await supabase
        .from("projects")
        .insert({
          name: projectName,
          bpm: bpm ? parseInt(bpm) : null,
          owner_id: user.id,
        })
        .select()
        .single();
      if (projError) throw projError;

      // Create version record
      const { error: verError } = await supabase
        .from("project_versions")
        .insert({
          project_id: project.id,
          version_number: 1,
          uploader_id: user.id,
          change_note: changeNote || null,
          zip_url: zipPath,
          audio_preview_url: audioUrl,
          plugin_list: metadata?.plugins ?? null,
          file_size_bytes: blob.size,
        });
      if (verError) throw verError;

      setProgress(100);
      setProgressLabel("Done!");

      // Confetti!
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#3B82F6", "#22C55E", "#fff"],
      });

      // Redirect after a moment
      setTimeout(() => {
        handleClose();
        navigate(`/project/${project.id}`);
      }, 1500);
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
      setUploading(false);
      setStep(3);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {step === 1 && "Select Project Folder"}
            {step === 2 && "Project Details"}
            {step === 3 && "Audio Preview"}
            {step === 4 && "Uploading..."}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex gap-1 mb-2">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Step 1: Folder selection */}
        {step === 1 && (
          <div className="space-y-4">
            <div
              className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 transition-colors cursor-pointer ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground"
              }`}
              onClick={() => folderInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFolderSelect(e.dataTransfer.files);
              }}
            >
              <FolderOpen className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-foreground font-medium mb-1">
                Drop your Ableton project folder or .zip here
              </p>
              <p className="text-xs text-muted-foreground">or click to browse folders</p>
              <input
                ref={folderInputRef}
                type="file"
                /* @ts-expect-error webkitdirectory is not standard */
                webkitdirectory=""
                directory=""
                multiple
                className="hidden"
                onChange={(e) => handleFolderSelect(e.target.files)}
              />
            </div>
            <button
              type="button"
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
              onClick={() => zipInputRef.current?.click()}
            >
              or select a .zip file
            </button>
            <input
              ref={zipInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleZipSelect(file);
              }}
            />

            {/* Errors */}
            {validation?.errors.map((err, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
              >
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                {err}
              </div>
            ))}

            {/* Warnings */}
            {validation?.warnings.map((w, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-md bg-yellow-500/10 p-3 text-sm text-yellow-400"
              >
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                {w}
              </div>
            ))}

            {/* Folder info */}
            {validation && validation.errors.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {validation.allFiles.length} files ·{" "}
                {formatBytes(validation.totalSizeBytes)}
              </p>
            )}

            {/* Continue with warnings */}
            {validation &&
              validation.errors.length === 0 &&
              validation.warnings.length > 0 && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const als = pickLatestAls(validation.alsFiles);
                    advanceWithAls(als);
                  }}
                >
                  Continue anyway
                </Button>
              )}
          </div>
        )}

        {/* Step 2: Project details */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="bg-secondary border-border"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bpm">BPM</Label>
              <Input
                id="bpm"
                type="number"
                value={bpm}
                onChange={(e) => setBpm(e.target.value)}
                className="bg-secondary border-border"
                placeholder="e.g. 120"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Change Note</Label>
              <Input
                id="note"
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                className="bg-secondary border-border"
                placeholder="What changed in this version?"
              />
            </div>

            {/* Plugin list preview */}
            {metadata?.plugins && metadata.plugins.length > 0 && (
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">
                  Detected Plugins
                </Label>
                <div className="flex flex-wrap gap-1">
                  {metadata.plugins.map((p) => (
                    <span
                      key={p}
                      className="rounded bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                Back
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={!projectName.trim()}
                className="flex-1"
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Audio preview */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Attach a rough mix or bounce for your collaborators to preview
              (MP3 or WAV, max 50MB). This is optional.
            </p>

            <div
              className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-8 cursor-pointer hover:border-muted-foreground transition-colors"
              onClick={() => audioInputRef.current?.click()}
            >
              <Music className="h-8 w-8 text-muted-foreground mb-2" />
              {audioFile ? (
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    {audioFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(audioFile.size)}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Click to select audio file
                </p>
              )}
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/mpeg,audio/wav,audio/mp3"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && file.size <= 50 * 1024 * 1024) {
                    setAudioFile(file);
                  } else if (file) {
                    toast({
                      title: "File too large",
                      description: "Audio preview must be under 50MB.",
                      variant: "destructive",
                    });
                  }
                }}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                Back
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setAudioFile(null);
                  handleUpload();
                }}
                className="flex-1"
              >
                Skip
              </Button>
              <Button onClick={handleUpload} disabled={!audioFile} className="flex-1">
                Upload
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Upload progress */}
        {step === 4 && (
          <div className="space-y-6 py-4">
            <div className="flex flex-col items-center gap-4">
              {progress < 100 ? (
                <Upload className="h-10 w-10 text-primary animate-pulse" />
              ) : (
                <Check className="h-10 w-10 text-accent" />
              )}
              <p className="text-sm font-medium text-foreground">
                {progressLabel}
              </p>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-center text-xs text-muted-foreground">
              {validation && formatBytes(validation.totalSizeBytes)}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
