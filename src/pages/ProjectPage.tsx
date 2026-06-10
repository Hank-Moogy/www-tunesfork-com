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
// Badge import removed (no longer used in new layout)
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  Star,
  Settings,
  Clock,
  UserPlus,
  Send,
  Music,
  ChevronLeft,
  Trash2,
  Copy,
  Mail,
  X,
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
import PluginMatchSection from "@/components/PluginMatchSection";
import { SampleCheckBadge, type SampleCheck } from "@/components/SampleCheckBadge";
import OpenInAbletonButton from "@/components/OpenInAbletonButton";
import { usePageView } from "@/hooks/usePageView";
import { trackButtonClick, trackShareCompleted } from "@/lib/analytics";

type Project = Tables<"projects">;
type Version = Tables<"project_versions">;

interface VersionGroup {
  versionNumber: number;
  main: Version;
  saves: Version[];
}

interface Comment {
  id: string;
  body: string;
  user_id: string;
  created_at: string;
  timestamp_seconds: number | null;
  profile?: { display_name: string | null; avatar_url: string | null } | null;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(1, Math.round((now - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function groupVersions(versions: Version[]): VersionGroup[] {
  const grouped = new Map<number, Version[]>();
  for (const version of versions) {
    const group = grouped.get(version.version_number) ?? [];
    group.push(version);
    grouped.set(version.version_number, group);
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => b - a)
    .map(([versionNumber, group]) => {
      const sortedDesc = [...group].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const main = sortedDesc[0];
      const saves = sortedDesc.slice(1);
      return { versionNumber, main, saves };
    });
}

function CollaboratorRow({
  initials,
  name,
  role,
  online,
}: {
  initials: string;
  name: string;
  role: string;
  online: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-secondary/50 transition-colors">
      <div className="relative shrink-0">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="text-[11px] font-semibold bg-secondary text-foreground/80">
            {initials}
          </AvatarFallback>
        </Avatar>
        {online && (
          <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-card" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate">{name}</p>
        <p className="text-[11px] text-muted-foreground truncate">
          {role} {online ? "• Online" : ""}
        </p>
      </div>
    </div>
  );
}

interface Collaborator {
  id: string;
  user_id: string;
  permission_level: "viewer" | "contributor";
  profile?: { display_name: string | null; avatar_url: string | null } | null;
}

interface PendingInvite {
  id: string;
  email: string;
  permission_level: "viewer" | "contributor";
  token: string;
  expires_at: string;
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  usePageView("project", { project_id: id });
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
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [frequentCollabs, setFrequentCollabs] = useState<{
    user_id: string;
    email: string;
    display_name: string | null;
    avatar_url: string | null;
    project_count: number;
  }[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [profileMap, setProfileMap] = useState<Map<string, { display_name: string | null; avatar_url: string | null }>>(new Map());

  const commentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!addCollabOpen) return;
    supabase.rpc("get_frequent_collaborators", { _limit: 8 }).then(({ data, error }) => {
      if (error) { console.warn("frequent collabs", error); return; }
      setFrequentCollabs((data ?? []) as typeof frequentCollabs);
    });
  }, [addCollabOpen]);

  useEffect(() => {
    if (!id || !user) return;
    const fetchAll = async () => {
      setLoading(true);
      const { data: proj } = await supabase.from("projects").select("id,name,bpm,owner_id,handoff_status,handoff_locked_by,created_at,updated_at,archived").eq("id", id).single();
      if (!proj) { navigate("/dashboard"); return; }
      setProject(proj as unknown as Project);

      const { data: vers } = await supabase
        .from("project_versions").select("*").eq("project_id", id)
        .order("version_number", { ascending: false })
        .order("created_at", { ascending: false });
      setVersions(vers ?? []);
      // Newest save of the latest major version (saves group by version_number).
      if (vers && vers.length > 0) setSelectedVersion(vers[0]);

      const { data: collabs } = await supabase.from("collaborators").select("*").eq("project_id", id);
      const collabUserIds = collabs?.map((c) => c.user_id) ?? [];
      const uploaderIds = (vers ?? []).map((v) => v.uploader_id);
      const allIds = Array.from(new Set([...collabUserIds, ...uploaderIds, proj.owner_id].filter(Boolean)));
      const { data: profiles } = await supabase
        .from("profiles").select("user_id, display_name, avatar_url").in("user_id", allIds);
      const pMap = new Map(profiles?.map((p) => [p.user_id, { display_name: p.display_name, avatar_url: p.avatar_url }]));
      setProfileMap(pMap);
      if (collabs) {
        setCollaborators(collabs.map((c) => ({ ...c, profile: pMap.get(c.user_id) ?? null })));
      }
      // RLS limits these rows to the project owner; others get an empty list.
      const { data: invites } = await (supabase as any)
        .from("project_invites")
        .select("id, email, permission_level, token, expires_at")
        .eq("project_id", id)
        .is("accepted_at", null);
      setPendingInvites(invites ?? []);
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
    trackButtonClick("project_download_zip", "project", { project_id: project?.id, version_id: selectedVersion.id });
    setDownloading(true);
    try {
      const safeName = (project?.name || "project")
        .replace(/[^a-z0-9-_ ]/gi, "")
        .trim()
        .replace(/\s+/g, "_") || "project";
      const filename = `${safeName}_v${selectedVersion.version_number}.zip`;

      const { data, error } = await supabase.storage
        .from("project-zips")
        .download(selectedVersion.zip_url);
      if (error) throw error;
      if (!data) throw new Error("No archive returned.");

      const signature = new Uint8Array(await data.slice(0, 4).arrayBuffer());
      const isZip = signature[0] === 0x50 && signature[1] === 0x4b;
      if (!isZip) throw new Error("Downloaded file was not a ZIP archive.");

      const url = URL.createObjectURL(new Blob([data], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("[download] failed", error);
      toast({ title: "Error", description: "Could not download the ZIP archive.", variant: "destructive" });
    }
    setDownloading(false);
  };

  const handleShare = async () => {
    trackButtonClick("project_share_copy_link", "project", { project_id: project?.id });
    if (!project) {
      toast({ title: "Share unavailable", description: "Project is still loading.", variant: "destructive" });
      return;
    }

    const { data: shareToken, error: tokenErr } = await supabase.rpc("ensure_project_share_token", { _project_id: project.id });

    if (shareToken && !tokenErr) {
      const shareUrl = `${window.location.origin}/share/${shareToken}`;
      await navigator.clipboard.writeText(shareUrl);
      trackShareCompleted({ project_id: project.id, share_method: "copy_link" });
      toast({ title: "Share link copied", description: "Anyone with this link can preview the project." });
      return;
    }

    toast({
      title: "Could not create share link",
      description: "Please try again in a moment.",
      variant: "destructive",
    });
  };

  const copyInviteLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Invite link copied", description: "Send it to your collaborator — it gets them set up and into this project." });
    } catch {
      toast({ title: "Couldn't copy", description: link, variant: "destructive" });
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    const { error } = await (supabase as any).from("project_invites").delete().eq("id", inviteId);
    if (error) {
      toast({ title: "Could not revoke invite", description: error.message, variant: "destructive" });
      return;
    }
    setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
    toast({ title: "Invite revoked", description: "The link no longer works." });
  };

  const handleAddCollaborator = async () => {
    const email = collabEmail.trim().toLowerCase();
    if (!email || !project) return;
    trackButtonClick("project_add_collaborator", "project", { project_id: project.id, role: collabRole });
    // Basic email shape check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    setAddingCollab(true);
    const { data: matches, error: lookupErr } = await supabase.rpc("find_user_by_email", { _email: email });
    if (lookupErr) {
      toast({ title: "Error", description: lookupErr.message, variant: "destructive" });
      setAddingCollab(false);
      return;
    }
    const targetUserId = matches && matches.length > 0 ? matches[0].user_id : null;
    if (!targetUserId) {
      // No account yet — create a personal invite link the user shares directly.
      const { data: invite, error: invErr } = await (supabase as any).rpc("create_project_invite", {
        _project_id: project.id,
        _email: email,
        _permission: collabRole,
      });
      if (invErr || !invite) {
        toast({ title: "Could not create invite", description: invErr?.message ?? "Please try again.", variant: "destructive" });
      } else {
        trackButtonClick("project_invite_link_created", "project", { project_id: project.id, role: collabRole });
        setInviteLink(`${window.location.origin}/invite/${invite.token}`);
        const { data: invites } = await (supabase as any)
          .from("project_invites")
          .select("id, email, permission_level, token, expires_at")
          .eq("project_id", project.id)
          .is("accepted_at", null);
        setPendingInvites(invites ?? []);
      }
      setAddingCollab(false);
      return;
    }
    const { error } = await supabase.from("collaborators").insert({ project_id: project.id, user_id: targetUserId, permission_level: collabRole });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Collaborator added" });
      // Fire-and-forget invite email (don't block UI on failure)
      try {
        const inviterProfile = user?.user_metadata?.full_name ?? user?.email ?? null;
        const recipientName = matches?.[0]?.display_name ?? null;
        supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "collaborator-invited",
            recipientEmail: email,
            idempotencyKey: `collab-invited-${project.id}-${targetUserId}`,
            templateData: {
              inviterName: inviterProfile,
              recipientName,
              projectName: project.name,
              projectUrl: `${window.location.origin}/project/${project.id}`,
            },
          },
        });
      } catch (e) {
        console.warn("invite email failed", e);
      }
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

  const handleDeleteProject = async () => {
    if (!project) return;
    trackButtonClick("project_delete", "project", { project_id: project.id });
    setDeleting(true);
    const { error } = await supabase.from("projects").delete().eq("id", project.id);
    if (error) {
      toast({ title: "Error", description: "Could not delete project.", variant: "destructive" });
      setDeleting(false);
    } else {
      toast({ title: "Project deleted" });
      navigate("/dashboard");
    }
  };

  const refreshVersions = async (selectedId?: string) => {
    if (!project) return;
    const { data } = await supabase
      .from("project_versions")
      .select("*")
      .eq("project_id", project.id)
      .order("version_number", { ascending: false })
      .order("created_at", { ascending: false });
    const nextVersions = data ?? [];
    setVersions(nextVersions);
    if (selectedId) {
      setSelectedVersion(nextVersions.find((version) => version.id === selectedId) ?? nextVersions[0] ?? null);
    } else {
      setSelectedVersion(nextVersions[0] ?? null);
    }
  };

  const handlePromoteVersion = async () => {
    if (!selectedVersion || !project) return;
    trackButtonClick("project_promote_saved_version", "project", {
      project_id: project.id,
      version_id: selectedVersion.id,
      from_version_number: selectedVersion.version_number,
    });
    setPromoting(true);
    const { data, error } = await (supabase as any).rpc("promote_project_version", {
      _version_id: selectedVersion.id,
    });
    if (error) {
      toast({ title: "Could not promote version", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Promoted to main version", description: `This save is now V${data.version_number}.` });
      await refreshVersions(data.id);
    }
    setPromoting(false);
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

  const currentVersionLabel = selectedVersion
    ? `V${selectedVersion.version_number}${selectedVersion.change_note ? ` - ${selectedVersion.change_note}` : ""}`
    : "";
  const versionGroups = groupVersions(versions);
  const selectedGroup = selectedVersion
    ? versionGroups.find((group) => group.versionNumber === selectedVersion.version_number)
    : null;
  const selectedCanPromote = !!selectedVersion && !!selectedGroup && selectedGroup.saves.length > 0;

  const ownerInitials = "OW";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="flex gap-6">
          {/* ============ LEFT SIDEBAR ============ */}
          <aside className="w-72 shrink-0 space-y-4">
            {/* Versions panel */}
            <div className="glass-card rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-4 pb-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Versions
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    trackButtonClick("project_upload_version", "project_versions_panel", { project_id: project?.id });
                    setUploadOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="px-2 pb-2 space-y-1 max-h-[420px] overflow-y-auto">
                {versionGroups.map((group, groupIndex) => {
                  const v = group.main;
                  const isSelected = selectedVersion?.id === v.id;
                  const isCurrent = groupIndex === 0;
                  const title = v.change_note?.split("\n")[0] || `Version ${v.version_number}`;
                  const subtitle = group.saves.length > 0
                    ? `Saved ${formatRelative(v.created_at)} · ${group.saves.length + 1} saved versions`
                    : isCurrent
                      ? `Modified ${formatRelative(v.created_at)}`
                      : "Initial upload";
                  return (
                    <div key={group.versionNumber} className="space-y-1">
                      <button
                        onClick={() => setSelectedVersion(v)}
                        className={`w-full text-left rounded-xl px-3 py-2.5 transition-all border ${
                          isSelected
                            ? "bg-primary/10 border-primary/25"
                            : "bg-transparent border-transparent hover:bg-secondary/60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-semibold truncate ${isSelected ? "text-foreground" : "text-foreground/90"}`}>
                                V{v.version_number} - {title}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>
                          </div>
                          {isCurrent ? (
                            <span className="shrink-0 rounded-full bg-accent/15 text-accent text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5">
                              Current
                            </span>
                          ) : (
                            <span className="shrink-0 text-[10px] text-muted-foreground font-mono mt-0.5">
                              {new Date(v.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </span>
                          )}
                        </div>
                      </button>
                      {group.saves.length > 0 && (
                        <div className="ml-4 border-l border-border/70 pl-2 space-y-1">
                          {group.saves.map((save) => {
                            const saveSelected = selectedVersion?.id === save.id;
                            const saveTitle = save.change_note?.split("\n")[0] || "Saved version";
                            return (
                              <button
                                key={save.id}
                                onClick={() => setSelectedVersion(save)}
                                className={`w-full text-left rounded-lg px-2.5 py-2 transition-all border ${
                                  saveSelected
                                    ? "bg-primary/10 border-primary/25"
                                    : "bg-transparent border-transparent hover:bg-secondary/50"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className={`text-xs font-medium truncate ${saveSelected ? "text-foreground" : "text-foreground/80"}`}>
                                      {saveTitle}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                      Saved {formatRelative(save.created_at)}
                                    </p>
                                  </div>
                                  <span className="shrink-0 text-[10px] text-muted-foreground font-mono">
                                    V{save.version_number}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {versions.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">No versions yet.</p>
                )}
              </div>
            </div>

            {/* Collaborators panel */}
            <div className="glass-card rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-4 pb-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Collaborators
                </span>
                {project.owner_id === user?.id && (
                  <button
                    className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setAddCollabOpen(true)}
                  >
                    Manage
                  </button>
                )}
              </div>
              <div className="px-3 pb-3 space-y-2">
                {/* Owner row */}
                <CollaboratorRow
                  initials={ownerInitials}
                  name="Owner"
                  role="Owner"
                  online
                />
                {collaborators.map((c) => (
                  <CollaboratorRow
                    key={c.id}
                    initials={(c.profile?.display_name ?? "?").slice(0, 2).toUpperCase()}
                    name={c.profile?.display_name ?? "User"}
                    role={c.permission_level === "contributor" ? "Contributor" : "Viewer"}
                    online={false}
                  />
                ))}
                {project.owner_id === user?.id && pendingInvites.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
                    <Avatar className="h-8 w-8 opacity-60">
                      <AvatarFallback className="bg-secondary text-muted-foreground text-[10px] font-semibold">
                        {inv.email.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-muted-foreground" title={inv.email}>{inv.email}</p>
                      <p className="text-[10px] text-muted-foreground/70">
                        Invited — link shared · {inv.permission_level === "contributor" ? "Contributor" : "Viewer"}
                      </p>
                    </div>
                    <button
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title="Copy invite link"
                      onClick={() => copyInviteLink(`${window.location.origin}/invite/${inv.token}`)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="Revoke invite"
                      onClick={() => handleRevokeInvite(inv.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              {project.owner_id === user?.id && (
                <div className="px-3 pb-3">
                  <Button
                    variant="outline"
                    className="w-full h-9 rounded-xl border-dashed border-border/70 text-xs gap-2 bg-transparent hover:bg-secondary/50"
                    onClick={() => setAddCollabOpen(true)}
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Invite Collaborator
                  </Button>
                </div>
              )}
            </div>
          </aside>

          {/* ============ MAIN COLUMN ============ */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-full"
                  onClick={() => navigate("/dashboard")}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <h1 className="text-2xl font-bold truncate">{project.name}</h1>
                    {selectedVersion && (
                      <span className="text-base text-muted-foreground truncate">{currentVersionLabel}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {project.bpm && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/70 border border-border px-2.5 py-1 text-[11px] font-mono">
                        <Clock className="h-3 w-3 text-muted-foreground" /> {project.bpm} BPM
                      </span>
                    )}
                    {selectedVersion && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/70 border border-border px-2.5 py-1 text-[11px] font-mono">
                        <Music className="h-3 w-3 text-muted-foreground" /> {formatBytes(selectedVersion.file_size_bytes)}
                      </span>
                    )}
                    {pluginList.length > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/70 border border-border px-2.5 py-1 text-[11px] font-mono">
                        {pluginList.length} plugins
                      </span>
                    )}
                    {selectedVersion?.ableton_version && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/70 border border-border px-2.5 py-1 text-[11px] font-mono">
                        <Music className="h-3 w-3 text-muted-foreground" /> {selectedVersion.ableton_version}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {selectedCanPromote && (
                  <Button
                    variant="outline"
                    className="h-9 gap-2 rounded-xl bg-card/50 backdrop-blur-sm"
                    onClick={handlePromoteVersion}
                    disabled={promoting || !selectedVersion}
                  >
                    <Star className="h-4 w-4" />
                    {promoting ? "Promoting..." : "Promote to main"}
                  </Button>
                )}
                <OpenInAbletonButton
                  projectId={project.id}
                  versionId={selectedVersion?.id}
                  disabled={!selectedVersion}
                />
                <Button
                  variant="outline"
                  className="h-9 gap-2 rounded-xl bg-card/50 backdrop-blur-sm"
                  onClick={handleShare}
                >
                  <Share2 className="h-4 w-4" /> Share
                </Button>
                <Button
                  className="h-9 gap-2 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground"
                  onClick={handleDownload}
                  disabled={downloading || !selectedVersion}
                >
                  <Download className="h-4 w-4" /> Export
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl bg-card/50 backdrop-blur-sm">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {project.owner_id === user?.id && (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive gap-2"
                        onClick={() => setDeleteOpen(true)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete project
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Audio preview */}
            {selectedVersion?.audio_preview_url && (
              <div className="glass-card rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <Music className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Audio Preview</span>
                </div>
                <audio controls className="w-full h-8" src={selectedVersion.audio_preview_url} />
              </div>
            )}

            {/* Arrangement Timeline */}
            {trackList.length > 0 && (
              <div className="glass-card rounded-2xl overflow-hidden">
                <div className="px-4 py-2.5 flex items-center gap-2 border-b border-border/60">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Arrangement</span>
                  <span className="text-[10px] text-muted-foreground font-mono ml-auto">{trackList.length} tracks</span>
                </div>
                <ArrangementTimeline tracks={trackList} />
              </div>
            )}

            {/* Plugins */}
            <div className="glass-card rounded-2xl overflow-hidden">
              <PluginMatchSection pluginList={pluginList} showSubmit />
            </div>

            {/* Discussion */}
            <div className="glass-card rounded-2xl px-5 py-4">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-base font-semibold">Discussion</h2>
                <span className="inline-flex items-center justify-center rounded-full bg-secondary text-[10px] font-mono text-muted-foreground h-5 min-w-[20px] px-1.5">
                  {comments.length}
                </span>
              </div>

              {comments.length === 0 && (
                <p className="text-sm text-muted-foreground/70 mb-4">No comments yet. Be the first to leave feedback.</p>
              )}

              <div className="space-y-4 mb-4 max-h-[420px] overflow-y-auto pr-1">
                {comments.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="text-[11px] font-semibold bg-secondary text-muted-foreground">
                        {(c.profile?.display_name ?? "?").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{c.profile?.display_name ?? "User"}</span>
                        <span className="text-[11px] text-muted-foreground ml-auto font-mono">
                          {formatRelative(c.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/85 mt-1 leading-relaxed">{c.body}</p>
                      <div className="flex items-center gap-4 mt-2">
                        <button className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                          Reply
                        </button>
                        <button className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                          Like
                        </button>
                      </div>
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
                  className="glass-input h-10 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendComment(); }
                  }}
                />
                <Button
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground"
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

      <UploadModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        existingProjectId={project.id}
        existingProjectName={project.name}
        onVersionUploaded={() => {
          supabase
            .from("project_versions").select("*").eq("project_id", project.id)
            .order("version_number", { ascending: false })
            .order("created_at", { ascending: false })
            .then(({ data }) => {
              if (data) { setVersions(data); setSelectedVersion(data[0]); }
            });
        }}
      />

      <Dialog open={addCollabOpen} onOpenChange={(open) => { setAddCollabOpen(open); if (!open) setInviteLink(null); }}>
        <DialogContent className="sm:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle>Add Collaborator</DialogTitle>
            <DialogDescription>Invite someone to view or contribute to this project.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {(() => {
              const existingIds = new Set(collaborators.map((c) => c.user_id));
              const suggestions = frequentCollabs.filter((f) => !existingIds.has(f.user_id));
              if (suggestions.length === 0) return null;
              return (
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Frequent collaborators
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((s) => {
                      const name = s.display_name ?? s.email.split("@")[0];
                      const initials = (s.display_name ?? s.email).slice(0, 2).toUpperCase();
                      const selected = collabEmail.trim().toLowerCase() === s.email.toLowerCase();
                      return (
                        <button
                          key={s.user_id}
                          type="button"
                          onClick={() => setCollabEmail(s.email)}
                          className={`flex items-center gap-2 rounded-full border px-2 py-1 text-xs transition-colors ${
                            selected
                              ? "border-pastel-green/60 bg-pastel-green/15 text-pastel-green"
                              : "border-border bg-secondary hover:bg-secondary/70"
                          }`}
                          title={s.email}
                        >
                          <Avatar className="h-5 w-5">
                            {s.avatar_url && <AvatarImage src={s.avatar_url} alt="" />}
                            <AvatarFallback className="text-[9px]">{initials}</AvatarFallback>
                          </Avatar>
                          <span className="max-w-[120px] truncate">{name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            <div className="space-y-2">
              <label className="text-sm font-medium">Email address</label>
              <Input type="email" value={collabEmail} onChange={(e) => { setCollabEmail(e.target.value); setInviteLink(null); }} placeholder="name@example.com" className="bg-secondary border-border" autoComplete="off" />
              <p className="text-[11px] text-muted-foreground">Has an account? They're added right away. New to Tunesfork? You'll get an invite link to share.</p>
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
            {inviteLink ? (
              <div className="space-y-2 rounded-xl border border-pastel-purple/30 bg-pastel-purple/5 p-3">
                <p className="text-xs font-medium">No Tunesfork account yet for that email.</p>
                <p className="text-[11px] text-muted-foreground">
                  Share this personal link with them — it signs them up and drops them straight into this project. It works once and expires in 14 days.
                </p>
                <div className="flex items-center gap-2">
                  <Input readOnly value={inviteLink} className="bg-secondary border-border text-xs font-mono h-8" onFocus={(e) => e.currentTarget.select()} />
                  <Button size="sm" variant="outline" className="h-8 px-2.5 shrink-0" onClick={() => copyInviteLink(inviteLink)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <a
                  className="inline-flex items-center gap-1.5 text-[11px] text-pastel-purple hover:underline"
                  href={`mailto:${collabEmail.trim()}?subject=${encodeURIComponent(`Collaborate with me on ${project.name} (Tunesfork)`)}&body=${encodeURIComponent(`Hey,\n\nI'd like you to collaborate on my Ableton project "${project.name}" on Tunesfork. Use this link to join:\n\n${inviteLink}\n\nSee you there!`)}`}
                >
                  <Mail className="h-3 w-3" /> Send it from your email app
                </a>
              </div>
            ) : (
              <Button className="w-full bg-pastel-green/20 text-pastel-green border border-pastel-green/30 hover:bg-pastel-green/30" variant="outline" onClick={handleAddCollaborator} disabled={!collabEmail.trim() || addingCollab}>
                {addingCollab ? "Adding…" : "Add Collaborator"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{project.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the project, all versions, and comments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteProject}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
