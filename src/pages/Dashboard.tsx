import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, FolderOpen } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import UploadModal from "@/components/UploadModal";

type Project = Tables<"projects">;

export default function Dashboard() {
  const { user } = useAuth();
  const [myProjects, setMyProjects] = useState<Project[]>([]);
  const [sharedProjects, setSharedProjects] = useState<Project[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchProjects = async () => {
      setLoading(true);

      const { data: owned } = await supabase
        .from("projects")
        .select("*")
        .eq("owner_id", user.id)
        .order("updated_at", { ascending: false });

      const { data: collabs } = await supabase
        .from("collaborators")
        .select("project_id")
        .eq("user_id", user.id);

      if (collabs && collabs.length > 0) {
        const ids = collabs.map((c) => c.project_id);
        const { data: shared } = await supabase
          .from("projects")
          .select("*")
          .in("id", ids)
          .order("updated_at", { ascending: false });
        setSharedProjects(shared ?? []);
      }

      setMyProjects(owned ?? []);
      setLoading(false);
    };

    fetchProjects();
  }, [user]);

  const filterArchived = (projects: Project[]) =>
    showArchived ? projects : projects.filter((p) => !p.archived);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Projects</h1>
          <Button className="bg-accent hover:bg-accent/90 text-accent-foreground gap-2">
            <Plus className="h-4 w-4" />
            Upload Project
          </Button>
        </div>

        <Tabs defaultValue="my" className="space-y-6">
          <div className="flex items-center justify-between">
            <TabsList className="bg-secondary">
              <TabsTrigger value="my">My Projects</TabsTrigger>
              <TabsTrigger value="shared">Shared With Me</TabsTrigger>
            </TabsList>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded"
              />
              Show archived
            </label>
          </div>

          <TabsContent value="my">
            <ProjectGrid projects={filterArchived(myProjects)} loading={loading} />
          </TabsContent>
          <TabsContent value="shared">
            <ProjectGrid projects={filterArchived(sharedProjects)} loading={loading} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function ProjectGrid({ projects, loading }: { projects: Project[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 rounded-lg bg-card animate-pulse" />
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">
          No projects yet. Upload your first Ableton project to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const statusColor = project.handoff_status === "ready" ? "bg-accent" : "bg-destructive";
  const statusLabel = project.handoff_status === "ready" ? "Ready" : "In Progress";

  // Generate a gradient from the project name
  const hash = project.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue1 = hash % 360;
  const hue2 = (hash * 7) % 360;

  return (
    <a
      href={`/project/${project.id}`}
      className="group block rounded-lg border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors"
    >
      {/* Cover gradient */}
      <div
        className="h-20"
        style={{
          background: `linear-gradient(135deg, hsl(${hue1}, 60%, 30%), hsl(${hue2}, 50%, 20%))`,
        }}
      />
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-medium truncate group-hover:text-primary transition-colors">
            {project.name}
          </h3>
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${statusColor} text-foreground`}>
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {project.bpm && <span className="font-mono">{project.bpm} BPM</span>}
          <span>{new Date(project.updated_at).toLocaleDateString()}</span>
        </div>
      </div>
    </a>
  );
}
