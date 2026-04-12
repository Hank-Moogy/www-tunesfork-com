import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import Navbar from "@/components/Navbar";
import ArrangementTimeline from "@/components/ArrangementTimeline";
import UploadModal from "@/components/UploadModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Download,
  Share2,
  Plus,
  Settings,
  Clock,
  UserPlus,
  Send,
  Music,
  ChevronLeft,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatBytes } from "@/lib/als-parser";
import type { Track } from "@/lib/als-parser";
import type { Tables } from "@/integrations/supabase/types";

type Project = Tables<"projects">;
type Version = Tables<"project_versions">;

interface Comment {
  id: string;
  body: string;
  user_id: string;
  created_at: string;
  timestamp_seconds: number | null;
  profile?: { display_name: string | null; avatar_url: string | null } | null;
}

interface Collaborator {
  id: string;
  user_id: string;
  permission_level: "viewer" | "contributor";
  profile?: { display_name: string | null; avatar_url: string | null } | null;
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [addCollabOpen, setAddCollabOpen] = useState(false);
  const [collabEmail, setCollabEmail] = useState("");
  const [collabRole, setCollabRole] = useState<"viewer" | "contributor">("viewer");
  const [addingCollab, setAddingCollab] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const commentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id || !user) return;
    const fetchAll = async () => {
      setLoading(true);
      const { data: proj } = await supabase.from("projects").select("*").eq("id", id).single();
      if (!proj) { navigate("/dashboard"); return; }
      setProject(proj);

      const { data: vers } = await supabase
        .from("project_versions").select("*").eq("project_id", id)
        .order("version_number", { ascending: false });
      setVersions(vers ?? []);
      if (vers && vers.length > 0) setSelectedVersion(vers[0]);

      const { data: collabs } = await supabase.from("collaborators").select("*").eq("project_id", id);
      if (collabs) {
        const userIds = collabs.map((c) => c.user_id);
        const { data: profiles } = await supabase.from("profiles").select("user_id, display_name, avatar_url").in("user_id", userIds);
        const profileMap = new Map(profiles?.map((p) => [p.user_id, p]));
        setCollaborators(collabs.map((c) => ({ ...c, profile: profileMap.get(c.user_id) ?? null })));
      }
      setLoading(false);
    };
    fetchAll();
  }, [id, user, navigate]);

  useEffect(() => {
    if (!selectedVersion) return;
    const fetchComments = async () => {
      const { data } = await supabase.from("comments").select("*").eq("version_id", selectedVersion.id).order("created_at", { ascending: true });
      if (data) {
        const userIds = [...new Set(data.map((c) => c.user_id))];
        const { data: profiles } = await supabase.from("profiles").select("user_id, display_name, avatar_url").in("user_id", userIds);
        const profileMap = new Map(profiles?.map((p) => [p.user_id, p]));
        setComments(data.map((c) => ({ ...c, profile: profileMap.get(c.user_id) ?? null })));
      }
    };
    fetchComments();
  }, [selectedVersion]);

  const handleSendComment = async () => {
    if (!newComment.trim() || !selectedVersion || !user) return;
    setSendingComment(true);
    const { error } = await supabase.from("comments").insert({ body: newComment.trim(), version_id: selectedVersion.id, user_id: user.id });
    if (error) {
      toast({ title: "Error", description: "Could not post comment.", variant: "destructive" });
    } else {
      setNewComment("");
      const { data } = await supabase.from("comments").select("*").eq("version_id", selectedVersion.id).order("created_at", { ascending: true });
      if (data) {
        const userIds = [...new Set(data.map((c) => c.user_id))];
        const { data: profiles } = await supabase.from("profiles").select("user_id, display_name, avatar_url").in("user_id", userIds);
        const profileMap = new Map(profiles?.map((p) => [p.user_id, p]));
        setComments(data.map((c) => ({ ...c, profile: profileMap.get(c.user_id) ?? null })));
      }
    }
    setSendingComment(false);
  };

  const handleDownload = async () => {
    if (!selectedVersion) return;
    setDownloading(true);
    try {
      const { data, error } = await supabase.storage.from("project-zips").createSignedUrl(selectedVersion.zip_url, 300);
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    } catch {
      toast({ title: "Error", description: "Could not generate download link.", variant: "destructive" });
    }
    setDownloading(false);
  };

  const handleShare = () => {
    const shareToken = (project as any)?.share_token;
    if (shareToken) {
      const shareUrl = `${window.location.origin}/share/${shareToken}`;
      navigator.clipboard.writeText(shareUrl);
      toast({ title: "Share link copied", description: "Anyone with this link can preview the project." });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({ title: "Link copied", description: "Project link copied to clipboard." });
    }
  };

  const handleAddCollaborator = async () => {
    if (!collabEmail.trim() || !project) return;
    setAddingCollab(true);
    const { data: profiles } = await supabase.from("profiles").select("user_id, display_name").ilike("display_name", `%${collabEmail.trim()}%`);
    let targetUserId: string | null = null;
    if (profiles && profiles.length > 0) targetUserId = profiles[0].user_id;
    if (!targetUserId) {
      toast({ title: "User not found", description: "No user found with that name. They need to sign up first.", variant: "destructive" });
      setAddingCollab(false);
      return;
    }
    const { error } = await supabase.from("collaborators").insert({ project_id: project.id, user_id: targetUserId, permission_level: collabRole });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Collaborator added" });
      setCollabEmail("");
      setAddCollabOpen(false);
      const { data: collabs } = await supabase.from("collaborators").select("*").eq("project_id", project.id);
      if (collabs) {
        const uids = collabs.map((c) => c.user_id);
        const { data: profs } = await supabase.from("profiles").select("user_id, display_name, avatar_url").in("user_id", uids);
        const pm = new Map(profs?.map((p) => [p.user_id, p]));
        setCollaborators(collabs.map((c) => ({ ...c, profile: pm.get(c.user_id) ?? null })));
      }
    }
    setAddingCollab(false);
  };

  const trackList: Track[] = selectedVersion?.track_list ? (selectedVersion.track_list as unknown as Track[]) : [];
  const pluginList: string[] = selectedVersion?.plugin_list ? (selectedVersion.plugin_list as unknown as string[]) : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-4">
        {/* Compact header */}
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate("/dashboard")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold truncate flex-1">{project.name}</h1>
          <div className="flex items-center gap-1.5">
            {project.bpm && (
              <Badge variant="outline" className="font-mono text-[10px] border-pastel-blue/30 text-pastel-blue">
                {project.bpm} BPM
              </Badge>
            )}
            {pluginList.length > 0 && (
              <Badge variant="outline" className="text-[10px] border-pastel-purple/30 text-pastel-purple">
                {pluginList.length} plugins
              </Badge>
            )}
            {selectedVersion && (
              <Badge variant="outline" className="text-[10px] font-mono border-border">
                {formatBytes(selectedVersion.file_size_bytes)}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 ml-2">
            <Button
              size="sm"
              className="h-7 text-xs gap-1 bg-pastel-green/15 text-pastel-green border border-pastel-green/25 hover:bg-pastel-green/25"
              variant="outline"
              onClick={handleShare}
            >
              <Share2 className="h-3 w-3" /> Share
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs gap-1 bg-pastel-blue/15 text-pastel-blue border border-pastel-blue/25 hover:bg-pastel-blue/25"
              variant="outline"
              onClick={handleDownload}
              disabled={downloading || !selectedVersion}
            >
              <Download className="h-3 w-3" /> Download
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Unified content area */}
        <div className="flex gap-4">
          {/* Left: Versions + Collaborators */}
          <div className="w-56 shrink-0 space-y-3">
            {/* Versions */}
            <div className="rounded-lg border border-border bg-card/60 backdrop-blur-sm">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Versions
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px] gap-1 text-pastel-orange hover:text-pastel-orange hover:bg-pastel-orange/10"
                  onClick={() => setUploadOpen(true)}
                >
                  <Plus className="h-3 w-3" /> New
                </Button>
              </div>
              <div className="p-1.5 space-y-0.5 max-h-64 overflow-y-auto">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVersion(v)}
                    className={`w-full text-left rounded-md px-2.5 py-1.5 transition-all text-xs ${
                      selectedVersion?.id === v.id
                        ? "bg-primary/10 border border-primary/20"
                        : "hover:bg-secondary border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${selectedVersion?.id === v.id ? "bg-primary" : "bg-muted-foreground/30"}`} />
                      <span className="font-medium">V{v.version_number}</span>
                      <span className="text-[10px] text-muted-foreground font-mono ml-auto">
                        {new Date(v.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    {v.change_note && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 pl-3 truncate">{v.change_note}</p>
                    )}
                  </button>
                ))}
                {versions.length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-3">No versions yet.</p>
                )}
              </div>
            </div>

            {/* Collaborators */}
            <div className="rounded-lg border border-border bg-card/60 backdrop-blur-sm">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Team
                </span>
                {project.owner_id === user?.id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px] gap-1 text-pastel-pink hover:text-pastel-pink hover:bg-pastel-pink/10"
                    onClick={() => setAddCollabOpen(true)}
                  >
                    <UserPlus className="h-3 w-3" /> Add
                  </Button>
                )}
              </div>
              <div className="p-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="text-[8px] bg-pastel-blue/20 text-pastel-blue">OW</AvatarFallback>
                  </Avatar>
                  <span className="text-[11px] text-muted-foreground">Owner</span>
                </div>
                {collaborators.map((c) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="text-[8px] bg-secondary text-muted-foreground">
                        {(c.profile?.display_name ?? "?").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-[11px] truncate">{c.profile?.display_name ?? "User"}</span>
                    <span className="text-[9px] text-muted-foreground capitalize ml-auto">{c.permission_level}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Main content */}
          <div className="flex-1 min-w-0 rounded-lg border border-border bg-card/40 backdrop-blur-sm overflow-hidden">
            {/* Audio preview */}
            {selectedVersion?.audio_preview_url && (
              <div className="px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Music className="h-3.5 w-3.5 text-pastel-purple" />
                  <span className="text-xs font-medium text-muted-foreground">Audio Preview</span>
                </div>
                <audio controls className="w-full h-8" src={selectedVersion.audio_preview_url} />
              </div>
            )}

            {/* Arrangement Timeline */}
            {trackList.length > 0 && (
              <div className="border-b border-border">
                <div className="px-4 py-2 flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-pastel-orange" />
                  <span className="text-xs font-medium text-muted-foreground">Arrangement</span>
                  <span className="text-[10px] text-muted-foreground font-mono ml-auto">{trackList.length} tracks</span>
                </div>
                <ArrangementTimeline tracks={trackList} />
              </div>
            )}

            {/* Plugins */}
            {pluginList.length > 0 && (
              <div className="px-4 py-3 border-b border-border">
                <span className="text-xs font-medium text-muted-foreground block mb-2">Plugins</span>
                <div className="flex flex-wrap gap-1">
                  {pluginList.map((p) => (
                    <Badge key={p} variant="secondary" className="font-mono text-[10px] bg-secondary/60 text-muted-foreground border-none py-0">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Version notes */}
            {selectedVersion?.change_note && (
              <div className="px-4 py-3 border-b border-border">
                <span className="text-xs font-medium text-muted-foreground block mb-1">Notes</span>
                <p className="text-sm text-foreground/80">{selectedVersion.change_note}</p>
              </div>
            )}

            {/* Comments */}
            <div className="px-4 py-3">
              <span className="text-xs font-medium text-muted-foreground block mb-3">
                Comments ({comments.length})
              </span>

              {comments.length === 0 && (
                <p className="text-xs text-muted-foreground/60 mb-3">No comments yet. Be the first to leave feedback.</p>
              )}

              <div className="space-y-2.5 mb-3 max-h-60 overflow-y-auto">
                {comments.map((c) => (
                  <div key={c.id} className="flex gap-2">
                    <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                      <AvatarFallback className="text-[9px] bg-secondary text-muted-foreground">
                        {(c.profile?.display_name ?? "?").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium">{c.profile?.display_name ?? "User"}</span>
                        <span className="text-[9px] text-muted-foreground font-mono">
                          {new Date(c.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-xs text-foreground/80 mt-0.5">{c.body}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  ref={commentInputRef}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment…"
                  className="bg-secondary/50 border-border text-xs h-8"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendComment(); }
                  }}
                />
                <Button
                  size="icon"
                  className="h-8 w-8 shrink-0 bg-pastel-blue/15 text-pastel-blue border border-pastel-blue/25 hover:bg-pastel-blue/25"
                  variant="outline"
                  onClick={handleSendComment}
                  disabled={!newComment.trim() || sendingComment}
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <UploadModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        existingProjectId={project.id}
        existingProjectName={project.name}
        onVersionUploaded={() => {
          supabase
            .from("project_versions").select("*").eq("project_id", project.id)
            .order("version_number", { ascending: false })
            .then(({ data }) => {
              if (data) { setVersions(data); setSelectedVersion(data[0]); }
            });
        }}
      />

      <Dialog open={addCollabOpen} onOpenChange={setAddCollabOpen}>
        <DialogContent className="sm:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle>Add Collaborator</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Username or display name</label>
              <Input value={collabEmail} onChange={(e) => setCollabEmail(e.target.value)} placeholder="Search by name…" className="bg-secondary border-border" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Permission</label>
              <Select value={collabRole} onValueChange={(v) => setCollabRole(v as "viewer" | "contributor")}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer — can view and comment</SelectItem>
                  <SelectItem value="contributor">Contributor — can upload versions</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full bg-pastel-green/20 text-pastel-green border border-pastel-green/30 hover:bg-pastel-green/30" variant="outline" onClick={handleAddCollaborator} disabled={!collabEmail.trim() || addingCollab}>
              {addingCollab ? "Adding…" : "Add Collaborator"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
