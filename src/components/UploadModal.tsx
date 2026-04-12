import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import JSZip from "jszip";
import * as tus from "tus-js-client";
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
  existingProjectId?: string;
  existingProjectName?: string;
  onVersionUploaded?: () => void;
}

export default function UploadModal({ open, onOpenChange, existingProjectId, existingProjectName, onVersionUploaded }: UploadModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // State
  const [step, setStep] = useState(1);
  const [validation, setValidation] = useState<FolderValidation | null>(null);
  const [metadata, setMetadata] = useState<AlsMetadata | null>(null);
  const [projectName, setProjectName] = useState("");
  const [bpm, setBpm] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [preZippedBlob, setPreZippedBlob] = useState<Blob | null>(null);
  const [processing, setProcessing] = useState(false);

  const PROCESSING_MESSAGES = [
    "Reading project files…",
    "Scanning for Ableton sets…",
    "Detecting plugins & instruments…",
    "Analyzing track layout…",
    "Extracting clip data…",
    "Mapping sample references…",
    "Almost there…",
  ];

  const [processingMsgIndex, setProcessingMsgIndex] = useState(0);

  useEffect(() => {
    if (!processing) {
      setProcessingMsgIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setProcessingMsgIndex((i) => (i + 1) % PROCESSING_MESSAGES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [processing]);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const progressValueRef = useRef(0);
  const progressAnimationRef = useRef<number | null>(null);
  const uploadAbortRef = useRef(false);
  const resumableUploadRef = useRef<tus.Upload | null>(null);
  const lastLoggedUploadPercentRef = useRef(-1);

  const stopProgressAnimation = useCallback(() => {
    if (progressAnimationRef.current !== null) {
      cancelAnimationFrame(progressAnimationRef.current);
      progressAnimationRef.current = null;
    }
  }, []);

  const setProgressValue = useCallback((value: number) => {
    const next = Math.max(0, Math.min(100, value));
    progressValueRef.current = next;
    setProgress(next);
  }, []);

  const animateProgressTo = useCallback(
    (target: number, durationMs: number) => {
      stopProgressAnimation();
      const start = performance.now();
      const from = progressValueRef.current;
      const tick = () => {
        const elapsed = performance.now() - start;
        const t = Math.min(elapsed / durationMs, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        const next = from + (target - from) * eased;
        progressValueRef.current = next;
        setProgress(next);

        if (t < 1) {
          progressAnimationRef.current = requestAnimationFrame(tick);
        } else {
          progressAnimationRef.current = null;
        }
      };

      progressAnimationRef.current = requestAnimationFrame(tick);
    },
    [stopProgressAnimation]
  );

  useEffect(() => () => stopProgressAnimation(), [stopProgressAnimation]);

  const reset = () => {
    stopProgressAnimation();
    uploadAbortRef.current = true;
    lastLoggedUploadPercentRef.current = -1;

    const activeUpload = resumableUploadRef.current;
    resumableUploadRef.current = null;
    if (activeUpload) {
      Promise.resolve(activeUpload.abort(true)).catch((error) => {
        console.warn("[upload] failed to abort resumable upload", error);
      });
    }

    setStep(1);
    setValidation(null);
    setMetadata(null);
    setProjectName("");
    setBpm("");
    setChangeNote("");
    setAudioFile(null);
    setProgressValue(0);
    setProgressLabel("");
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
    const meta = await parseAlsFile(als);
    setMetadata(meta);
    setProjectName(existingProjectName ?? meta?.projectName ?? als.name.replace(/\.als$/i, ""));
    setBpm(meta?.bpm?.toString() ?? "");
    setStep(2);
  };

  const uploadZipResumable = useCallback(
    async (
      file: File,
      objectPath: string,
      onProgress: (percentage: number, bytesUploaded: number, bytesTotal: number) => void
    ) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("You need to be signed in before uploading.");
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const endpoint = `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`;

      console.log("[upload] starting resumable upload", {
        endpoint,
        bucket: "project-zips",
        objectPath,
        fileName: file.name,
        size: file.size,
        type: file.type,
      });

      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: {
            authorization: `Bearer ${session.access_token}`,
          },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          chunkSize: 6 * 1024 * 1024,
          metadata: {
            bucketName: "project-zips",
            objectName: objectPath,
            contentType: file.type || "application/zip",
            cacheControl: "3600",
          },
          onError: (error) => {
            resumableUploadRef.current = null;
            const detailedError = error as Error & {
              originalRequest?: unknown;
              originalResponse?: unknown;
            };

            console.error("[upload] resumable upload error", {
              objectPath,
              message: error.message,
              name: error.name,
              originalRequest: detailedError.originalRequest,
              originalResponse: detailedError.originalResponse,
            });
            reject(error);
          },
          onProgress: (bytesUploaded, bytesTotal) => {
            const percentage = bytesTotal > 0 ? (bytesUploaded / bytesTotal) * 100 : 0;
            const rounded = Math.floor(percentage);

            if (rounded >= lastLoggedUploadPercentRef.current + 5 || rounded === 100) {
              lastLoggedUploadPercentRef.current = rounded;
              console.log("[upload] resumable progress", {
                objectPath,
                bytesUploaded,
                bytesTotal,
                percentage: Number(percentage.toFixed(2)),
              });
            }

            onProgress(percentage, bytesUploaded, bytesTotal);
          },
          onSuccess: () => {
            resumableUploadRef.current = null;
            console.log("[upload] resumable upload complete", {
              objectPath,
              uploadUrl: upload.url,
            });
            resolve();
          },
        });

        resumableUploadRef.current = upload;

        upload
          .findPreviousUploads()
          .then((previousUploads) => {
            if (previousUploads.length > 0) {
              console.log("[upload] found previous resumable upload", {
                objectPath,
                count: previousUploads.length,
              });
              upload.resumeFromPreviousUpload(previousUploads[0]);
            }

            if (uploadAbortRef.current) {
              resumableUploadRef.current = null;
              reject(new Error("Upload cancelled."));
              return;
            }

            upload.start();
          })
          .catch((error) => {
            resumableUploadRef.current = null;
            console.error("[upload] failed to initialize resumable upload", {
              objectPath,
              error,
            });
            reject(error);
          });
      });
    },
    []
  );

  // Handle a direct .zip upload
  const handleZipSelect = useCallback(
    async (file: File) => {
      setProcessing(true);
      try {
        const zip = await JSZip.loadAsync(file);
        const entries: File[] = [];
        const promises: Promise<void>[] = [];
        zip.forEach((relativePath, zipEntry) => {
          if (zipEntry.dir) return;
          promises.push(
            zipEntry.async("blob").then((blob) => {
              const f = new File([blob], zipEntry.name, { type: blob.type });
              Object.defineProperty(f, "webkitRelativePath", { value: relativePath });
              entries.push(f);
            })
          );
        });
        await Promise.all(promises);

        const result = validateFolder(entries);
        setValidation(result);
        setPreZippedBlob(file);

        if (result.errors.length > 0) {
          setProcessing(false);
          return;
        }

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
      setProcessing(false);
    },
    []
  );

  // Step 1: Folder selection
  const handleFolderSelect = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      if (files.length === 1 && files[0].name.toLowerCase().endsWith(".zip")) {
        return handleZipSelect(files[0]);
      }

      setProcessing(true);
      setPreZippedBlob(null);
      const fileArray = Array.from(files);
      const result = validateFolder(fileArray);
      setValidation(result);

      if (result.errors.length > 0) {
        setProcessing(false);
        return;
      }

      const als = pickLatestAls(result.alsFiles);
      await advanceWithAls(als);
      setProcessing(false);
    },
    [handleZipSelect]
  );

  // Step 4: Upload
  const handleUpload = async () => {
    if (!validation || !user) return;
    setStep(4);

    setProgressValue(0);
    setProgressLabel("Preparing archive…");
    animateProgressTo(10, 500);
    uploadAbortRef.current = false;
    lastLoggedUploadPercentRef.current = -1;

    try {
      let blob: Blob;

      if (preZippedBlob) {
        blob = preZippedBlob;
        animateProgressTo(33, 500);
        await new Promise((r) => setTimeout(r, 500));
        stopProgressAnimation();
        setProgressValue(33);
      } else {
        await new Promise((r) => setTimeout(r, 150));
        stopProgressAnimation();
        const zip = new JSZip();
        for (const file of validation.allFiles) {
          const path = file.webkitRelativePath || file.name;
          zip.file(path, file);
        }
        blob = await zip.generateAsync(
          { type: "blob", compression: "DEFLATE", compressionOptions: { level: 1 } },
          (meta) => setProgressValue(Math.max(10, Math.min(33, 10 + meta.percent * 0.23)))
        );
        setProgressValue(33);
      }

      // Upload zip via SDK
      setProgressLabel("Uploading archive…");

      const zipPath = `${user.id}/${Date.now()}.zip`;
      console.log("[upload] uploading zip", zipPath, "size", blob.size, "type", blob.type);
      
      // Ensure blob is a proper File for the upload
      const fileToUpload = blob instanceof File 
        ? blob 
        : new File([blob], zipPath.split('/').pop()!, { type: 'application/zip' });

      const uploadStartedAt = performance.now();
      await uploadZipResumable(fileToUpload, zipPath, (percentage, bytesUploaded, bytesTotal) => {
        stopProgressAnimation();
        setProgressValue(Math.max(33, Math.min(85, 33 + percentage * 0.52)));
        // Don't show percentage in label - it's shown separately in the UI
        setProgressLabel("Uploading archive…");

        if (percentage >= 100) {
          console.log("[upload] file transfer finished", {
            zipPath,
            bytesUploaded,
            bytesTotal,
          });
        }
      });
      console.log("[upload] zip uploaded successfully", {
        zipPath,
        durationMs: Math.round(performance.now() - uploadStartedAt),
      });

      if (uploadAbortRef.current) return;
      stopProgressAnimation();
      setProgressValue(88);

      let audioUrl: string | null = null;
      if (audioFile) {
        setProgressLabel("Uploading audio preview…");
        const audioPath = `${user.id}/${Date.now()}-preview.${audioFile.name.split(".").pop()}`;
        console.log("[upload] uploading audio preview", {
          audioPath,
          size: audioFile.size,
          type: audioFile.type,
        });
        const { error: audioError } = await supabase.storage
          .from("audio-previews")
          .upload(audioPath, audioFile, { upsert: false });
        if (audioError) {
          console.error("[upload] audio upload error:", audioError);
          throw audioError;
        }
        console.log("[upload] audio preview uploaded", { audioPath });
        const { data: audioPublic } = supabase.storage
          .from("audio-previews")
          .getPublicUrl(audioPath);
        audioUrl = audioPublic.publicUrl;
      }

      if (uploadAbortRef.current) return;
      setProgressLabel("Saving project…");
      setProgressValue(93);

      let projectId: string;

      if (existingProjectId) {
        // Upload new version to existing project
        projectId = existingProjectId;
      } else {
        // Create new project
        console.log("[upload] creating project record", {
          projectName,
          bpm: bpm ? parseInt(bpm) : null,
          ownerId: user.id,
        });

        const { data: project, error: projError } = await supabase
          .from("projects")
          .insert({
            name: projectName,
            bpm: bpm ? parseInt(bpm) : null,
            owner_id: user.id,
          })
          .select()
          .single();
        if (projError) {
          console.error("[upload] project insert error:", projError);
          throw projError;
        }
        console.log("[upload] project created", { projectId: project.id });
        projectId = project.id;
      }

      // Determine next version number
      let versionNumber = 1;
      if (existingProjectId) {
        const { data: existingVersions } = await supabase
          .from("project_versions")
          .select("version_number")
          .eq("project_id", existingProjectId)
          .order("version_number", { ascending: false })
          .limit(1);
        if (existingVersions && existingVersions.length > 0) {
          versionNumber = existingVersions[0].version_number + 1;
        }
      }

      console.log("[upload] creating project version", {
        projectId,
        versionNumber,
        zipPath,
        audioUrl,
        fileSizeBytes: blob.size,
      });
      const { error: verError } = await supabase
        .from("project_versions")
        .insert({
          project_id: projectId,
          version_number: versionNumber,
          uploader_id: user.id,
          change_note: changeNote || null,
          zip_url: zipPath,
          audio_preview_url: audioUrl,
          plugin_list: metadata?.plugins ?? null,
          file_size_bytes: blob.size,
          track_list: (metadata?.tracks as any) ?? null,
        });
      if (verError) {
        console.error("[upload] version insert error:", verError);
        throw verError;
      }
      console.log("[upload] project version created", {
        projectId,
        versionNumber,
      });

      if (uploadAbortRef.current) return;

      setProgressValue(100);
      setProgressLabel("Upload complete!");

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#3B82F6", "#22C55E", "#fff"],
      });

      setTimeout(() => {
        handleClose();
        if (onVersionUploaded) {
          onVersionUploaded();
        } else {
          navigate(`/project/${projectId}`);
        }
      }, 1500);
    } catch (error: any) {
      if (uploadAbortRef.current) return;
      console.error("[upload] failed:", error);
      toast({
        title: "Upload failed",
        description: error?.message || "Something went wrong.",
        variant: "destructive",
      });
      stopProgressAnimation();
      setStep(3);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {step === 1 && (existingProjectId ? "Upload New Version" : "Select Project Folder")}
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
            {processing && (
              <div className="flex flex-col items-center justify-center rounded-lg border-2 border-primary/30 bg-primary/5 p-10">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary mb-3" />
                <p className="text-sm text-foreground font-medium animate-fade-in" key={processingMsgIndex}>
                  {PROCESSING_MESSAGES[processingMsgIndex]}
                </p>
                <p className="text-xs text-muted-foreground mt-1">This may take a moment for large projects</p>
              </div>
            )}
            {!processing && (<>
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

            {validation?.errors.map((err, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
              >
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                {err}
              </div>
            ))}

            {validation?.warnings.map((w, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-md bg-yellow-500/10 p-3 text-sm text-yellow-400"
              >
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                {w}
              </div>
            ))}

            {validation && validation.errors.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {validation.allFiles.length} files ·{" "}
                {preZippedBlob
                  ? formatBytes(preZippedBlob.size)
                  : formatBytes(validation.totalSizeBytes)}
              </p>
            )}

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
            </>)}
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
              (MP3 or WAV, up to 500MB). This is optional.
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
                      description: "Audio preview must be under 500MB.",
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
              <p className="font-mono text-3xl font-semibold text-foreground tabular-nums">
                {Math.round(progress)}%
              </p>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-center text-xs text-muted-foreground">
              {preZippedBlob
                ? formatBytes(preZippedBlob.size)
                : validation && formatBytes(validation.totalSizeBytes)}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
