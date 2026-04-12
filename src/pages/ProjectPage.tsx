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
} from "lucide-react";
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

  const commentInputRef = useRef<HTMLInputElement>(null);

  // Fetch project data
  useEffect(() => {
    if (!id || !user) return;
    const fetchAll = async () => {
      setLoading(true);

      const { data: proj } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .single();
      if (!proj) {
        navigate("/dashboard");
        return;
      }
      setProject(proj);

      const { data: vers } = await supabase
        .from("project_versions")
        .select("*")
        .eq("project_id", id)
        .order("version_number", { ascending: false });
      setVersions(vers ?? []);
      if (vers && vers.length > 0) {
        setSelectedVersion(vers[0]);
      }

      // Fetch collaborators with profiles
      const { data: collabs } = await supabase
        .from("collaborators")
        .select("*")
        .eq("project_id", id);
      if (collabs) {
        const userIds = collabs.map((c) => c.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", userIds);
        const profileMap = new Map(profiles?.map((p) => [p.user_id, p]));
        setCollaborators(
          collabs.map((c) => ({
            ...c,
            profile: profileMap.get(c.user_id) ?? null,
          }))
        );
      }

      setLoading(false);
    };
    fetchAll();
  }, [id, user, navigate]);

  // Fetch comments when selected version changes
  useEffect(() => {
    if (!selectedVersion) return;
    const fetchComments = async () => {
      const { data } = await supabase
        .from("comments")
        .select("*")
        .eq("version_id", selectedVersion.id)
        .order("created_at", { ascending: true });
      if (data) {
        const userIds = [...new Set(data.map((c) => c.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", userIds);
        const profileMap = new Map(profiles?.map((p) => [p.user_id, p]));
        setComments(
          data.map((c) => ({ ...c, profile: profileMap.get(c.user_id) ?? null }))
        );
      }
    };
    fetchComments();
  }, [selectedVersion]);

  const handleSendComment = async () => {
    if (!newComment.trim() || !selectedVersion || !user) return;
    setSendingComment(true);
    const { error } = await supabase.from("comments").insert({
      body: newComment.trim(),
      version_id: selectedVersion.id,
      user_id: user.id,
    });
    if (error) {
      toast({ title: "Error", description: "Could not post comment.", variant: "destructive" });
    } else {
      setNewComment("");
      // Re-fetch comments
      const { data } = await supabase
        .from("comments")
        .select("*")
        .eq("version_id", selectedVersion.id)
        .order("created_at", { ascending: true });
      if (data) {
        const userIds = [...new Set(data.map((c) => c.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", userIds);
        const profileMap = new Map(profiles?.map((p) => [p.user_id, p]));
        setComments(
          data.map((c) => ({ ...c, profile: profileMap.get(c.user_id) ?? null }))
        );
      }
    }
    setSendingComment(false);
  };

  const handleDownload = async () => {
    if (!selectedVersion) return;
    setDownloading(true);
    try {
      const { data, error } = await supabase.storage
        .from("project-zips")
        .createSignedUrl(selectedVersion.zip_url, 300);
      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, "_blank");
      }
    } catch {
      toast({ title: "Error", description: "Could not generate download link.", variant: "destructive" });
    }
    setDownloading(false);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({ title: "Link copied", description: "Project link copied to clipboard." });
  };

  const handleAddCollaborator = async () => {
    if (!collabEmail.trim() || !project) return;
    setAddingCollab(true);
    // Look up user by email via profiles (display_name might contain email)
    // Since we can't query auth.users, we search profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .ilike("display_name", `%${collabEmail.trim()}%`);
    
    // If no match, try exact match on the email part before @
    let targetUserId: string | null = null;
    if (profiles && profiles.length > 0) {
      targetUserId = profiles[0].user_id;
    }

    if (!targetUserId) {
      toast({
        title: "User not found",
        description: "No user found with that name or email. They need to sign up first.",
        variant: "destructive",
      });
      setAddingCollab(false);
      return;
    }

    const { error } = await supabase.from("collaborators").insert({
      project_id: project.id,
      user_id: targetUserId,
      permission_level: collabRole,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Collaborator added" });
      setCollabEmail("");
      setAddCollabOpen(false);
      // Refresh collaborators
      const { data: collabs } = await supabase
        .from("collaborators")
        .select("*")
        .eq("project_id", project.id);
      if (collabs) {
        const uids = collabs.map((c) => c.user_id);
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", uids);
        const pm = new Map(profs?.map((p) => [p.user_id, p]));
        setCollaborators(collabs.map((c) => ({ ...c, profile: pm.get(c.user_id) ?? null })));
      }
    }
    setAddingCollab(false);
  };

  const trackList: Track[] = selectedVersion?.track_list
    ? (selectedVersion.track_list as unknown as Track[])
    : [];

  const pluginList: string[] = selectedVersion?.plugin_list
    ? (selectedVersion.plugin_list as unknown as string[])
    : [];

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
      <main className="mx-auto max-w-7xl px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate">{project.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              {project.bpm && (
                <Badge variant="secondary" className="font-mono text-xs">
                  {project.bpm} BPM
                </Badge>
              )}
              {pluginList.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {pluginList.length} plugins
                </Badge>
              )}
              {selectedVersion && (
                <Badge variant="outline" className="text-xs">
                  {formatBytes(selectedVersion.file_size_bytes)}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="h-4 w-4 mr-1" /> Share
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={downloading || !selectedVersion}
            >
              <Download className="h-4 w-4 mr-1" /> Download
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${id}`)}>
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Left sidebar — Version Timeline */}
          <div className="w-64 shrink-0">
            <div className="rounded-lg border border-border bg-card p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Versions
                </h2>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setUploadOpen(true)}
                >
                  <Plus className="h-3 w-3" /> New
                </Button>
              </div>

              <div className="space-y-1">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVersion(v)}
                    className={`w-full text-left rounded-md px-3 py-2 transition-colors ${
                      selectedVersion?.id === v.id
                        ? "bg-primary/10 border border-primary/30"
                        : "hover:bg-secondary"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          selectedVersion?.id === v.id ? "bg-primary" : "bg-muted-foreground/30"
                        }`}
                      />
                      <span className="text-sm font-medium">Version {v.version_number}</span>
                    </div>
                    {v.change_note && (
                      <p className="text-xs text-muted-foreground mt-1 pl-4 truncate">
                        {v.change_note}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground pl-4 mt-0.5 font-mono">
                      {new Date(v.created_at).toLocaleDateString()}
                    </p>
                  </button>
                ))}
              </div>

              {versions.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No versions yet.
                </p>
              )}
            </div>

            {/* Collaborators */}
            <div className="rounded-lg border border-border bg-card p-4 mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Collaborators
                </h2>
                {project.owner_id === user?.id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setAddCollabOpen(true)}
                  >
                    <UserPlus className="h-3 w-3" /> Add
                  </Button>
                )}
              </div>

              {/* Owner */}
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-[10px] bg-primary/20 text-primary">
                    OW
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">Owner</p>
                  <p className="text-[10px] text-muted-foreground">Owner</p>
                </div>
              </div>

              {collaborators.map((c) => (
                <div key={c.id} className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-[10px] bg-secondary text-muted-foreground">
                      {(c.profile?.display_name ?? "?").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">
                      {c.profile?.display_name ?? "User"}
                    </p>
                    <p className="text-[10px] text-muted-foreground capitalize">
                      {c.permission_level}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right main area */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Audio preview */}
            {selectedVersion?.audio_preview_url && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Music className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium">Audio Preview</h3>
                </div>
                <audio
                  controls
                  className="w-full"
                  src={selectedVersion.audio_preview_url}
                />
              </div>
            )}

            {/* Arrangement Timeline */}
            {trackList.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Arrangement
                </h3>
                <ArrangementTimeline tracks={trackList} />
              </div>
            )}

            {/* Plugins */}
            {pluginList.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-sm font-medium mb-3">Plugins</h3>
                <div className="flex flex-wrap gap-1.5">
                  {pluginList.map((p) => (
                    <Badge key={p} variant="secondary" className="font-mono text-xs">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Version description */}
            {selectedVersion?.change_note && (
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-sm font-medium mb-2">Version Notes</h3>
                <p className="text-sm text-muted-foreground">{selectedVersion.change_note}</p>
              </div>
            )}

            {/* Comments */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-medium mb-4">
                Comments ({comments.length})
              </h3>

              {comments.length === 0 && (
                <p className="text-sm text-muted-foreground mb-4">
                  No comments yet. Be the first to leave feedback.
                </p>
              )}

              <div className="space-y-3 mb-4 max-h-80 overflow-y-auto">
                {comments.map((c) => (
                  <div key={c.id} className="flex gap-2">
                    <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                      <AvatarFallback className="text-[10px] bg-secondary text-muted-foreground">
                        {(c.profile?.display_name ?? "?").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">
                          {c.profile?.display_name ?? "User"}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {new Date(c.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-foreground mt-0.5">{c.body}</p>
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
                  className="bg-secondary border-border text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendComment();
                    }
                  }}
                />
                <Button
                  size="icon"
                  onClick={handleSendComment}
                  disabled={!newComment.trim() || sendingComment}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Upload New Version Modal */}
      <UploadModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        existingProjectId={project.id}
        existingProjectName={project.name}
        onVersionUploaded={() => {
          // Refresh versions
          supabase
            .from("project_versions")
            .select("*")
            .eq("project_id", project.id)
            .order("version_number", { ascending: false })
            .then(({ data }) => {
              if (data) {
                setVersions(data);
                setSelectedVersion(data[0]);
              }
            });
        }}
      />

      {/* Add Collaborator Dialog */}
      <Dialog open={addCollabOpen} onOpenChange={setAddCollabOpen}>
        <DialogContent className="sm:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle>Add Collaborator</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Username or display name</label>
              <Input
                value={collabEmail}
                onChange={(e) => setCollabEmail(e.target.value)}
                placeholder="Search by name…"
                className="bg-secondary border-border"
              />
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
            <Button
              className="w-full"
              onClick={handleAddCollaborator}
              disabled={!collabEmail.trim() || addingCollab}
            >
              {addingCollab ? "Adding…" : "Add Collaborator"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
