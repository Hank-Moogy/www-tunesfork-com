import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import PageContainer from "@/components/PageContainer";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Upload, Download, ChevronDown, FolderOpen } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import ContributionHeatmap from "@/components/profile/ContributionHeatmap";
import SetupReminders, { type ReminderId } from "@/components/onboarding/SetupReminders";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import type { Tables } from "@/integrations/supabase/types";
import ProjectCard, { type ProjectCardCollaborator } from "@/components/ProjectCard";
import NewProjectCard from "@/components/NewProjectCard";
import { usePageView } from "@/hooks/usePageView";
import { trackButtonClick } from "@/lib/analytics";

type Project = Tables<"projects">;
type Tab = "all" | "my" | "shared";

interface DashboardStats {
  heatmap: { d: string; c: number }[];
  current_streak: number;
}

const PAGE_SIZE = 12;
const PROJECT_COLS =
  "id,name,bpm,owner_id,handoff_status,handoff_locked_by,created_at,updated_at,archived,share_token";

function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function Dashboard() {
  usePageView("dashboard");
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>("all");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const onboarding = useOnboardingProgress();
  const [dismissedReminders, setDismissedReminders] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("tf_dismissed_reminders") ?? "[]");
    } catch {
      return [];
    }
  });
  const [firstName, setFirstName] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const name = data?.display_name?.trim();
        setFirstName(name ? name.split(" ")[0] : null);
      });
  }, [user]);

  const greeting = useMemo(() => {
    const now = new Date();
    const h = now.getHours();
    const d = now.getDay();
    const n = firstName ? `, ${firstName}` : "";
    if (h >= 23 || h < 5) return `Late-night session${n}?`;
    if (h < 12) return d === 0 || d === 6 ? `Weekend sounds incoming${n}` : `Good morning${n}`;
    if (h < 18) return `Good afternoon${n}`;
    if (d === 5) return `Friday night${n} — make it count`;
    return `Good evening${n}`;
  }, [firstName]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 250);
  const [showArchived, setShowArchived] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [appending, setAppending] = useState(false);

  const [collabsByProject, setCollabsByProject] = useState<
    Record<string, ProjectCardCollaborator[]>
  >({});

  const [hasAnyProjectsEver, setHasAnyProjectsEver] = useState<boolean | null>(null);

  const sharedIdsRef = useRef<string[] | null>(null);

  // Track search for analytics (length only — no PII)
  useEffect(() => {
    if (debouncedSearch.trim().length > 0) {
      trackButtonClick("dashboard_search", "dashboard", {
        query_length: debouncedSearch.trim().length,
        tab,
      });
    }
  }, [debouncedSearch, tab]);

  // For "shared" tab — fetch ids of projects user collaborates on once per user
  const ensureSharedIds = async (): Promise<string[]> => {
    if (sharedIdsRef.current) return sharedIdsRef.current;
    const { data } = await supabase
      .from("collaborators")
      .select("project_id")
      .eq("user_id", user!.id);
    const ids = (data ?? []).map((c) => c.project_id);
    sharedIdsRef.current = ids;
    return ids;
  };

  const fetchPage = async (opts: { append: boolean; pageIndex: number }) => {
    if (!user) return;
    const { append, pageIndex } = opts;
    if (append) setAppending(true);
    else setLoading(true);

    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const term = debouncedSearch.trim();

    let query = supabase
      .from("projects")
      .select(PROJECT_COLS, { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (tab === "my") {
      query = query.eq("owner_id", user.id);
    } else if (tab === "shared") {
      const ids = await ensureSharedIds();
      if (ids.length === 0) {
        setProjects([]);
        setTotalCount(0);
        setLoading(false);
        setAppending(false);
        return;
      }
      query = query.in("id", ids);
    } else {
      // "all" — owned plus shared-with-me
      const ids = await ensureSharedIds();
      query = ids.length > 0
        ? query.or(`owner_id.eq.${user.id},id.in.(${ids.join(",")})`)
        : query.eq("owner_id", user.id);
    }

    if (!showArchived) query = query.eq("archived", false);
    if (term.length > 0) query = query.ilike("name", `%${term}%`);

    const { data, count, error } = await query;
    if (error) {
      console.error("[dashboard] fetch error", error);
      setLoading(false);
      setAppending(false);
      return;
    }

    const fetched = (data ?? []) as unknown as Project[];
    setProjects((prev) => (append ? [...prev, ...fetched] : fetched));
    setTotalCount(count ?? 0);
    setLoading(false);
    setAppending(false);

    // Fetch collaborators for these projects
    if (fetched.length > 0) {
      void fetchCollaboratorsFor(fetched.map((p) => p.id));
    }
  };

  const fetchCollaboratorsFor = async (projectIds: string[]) => {
    const missing = projectIds.filter((id) => !collabsByProject[id]);
    if (missing.length === 0) return;

    // Build owner map from currently-loaded projects
    const ownerByProject = new Map<string, string>();
    setProjects((prev) => {
      prev.forEach((p) => {
        if (missing.includes(p.id)) ownerByProject.set(p.id, p.owner_id);
      });
      return prev;
    });

    const { data: collabRows } = await supabase
      .from("collaborators")
      .select("project_id,user_id")
      .in("project_id", missing);

    // Combine owners + collaborators
    const userIds = new Set<string>();
    ownerByProject.forEach((uid) => userIds.add(uid));
    (collabRows ?? []).forEach((c) => userIds.add(c.user_id));

    let profileMap = new Map<string, ProjectCardCollaborator>();
    if (userIds.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id,display_name,avatar_url")
        .in("user_id", Array.from(userIds));
      profileMap = new Map(
        (profiles ?? []).map((p) => [p.user_id, p as ProjectCardCollaborator])
      );
    }

    const grouped: Record<string, ProjectCardCollaborator[]> = {};
    missing.forEach((id) => {
      const seen = new Set<string>();
      const list: ProjectCardCollaborator[] = [];
      const ownerId = ownerByProject.get(id);
      if (ownerId) {
        const op = profileMap.get(ownerId) ?? { user_id: ownerId, display_name: null, avatar_url: null };
        list.push(op);
        seen.add(ownerId);
      }
      (collabRows ?? [])
        .filter((c) => c.project_id === id)
        .forEach((c) => {
          if (seen.has(c.user_id)) return;
          const p = profileMap.get(c.user_id) ?? { user_id: c.user_id, display_name: null, avatar_url: null };
          list.push(p);
          seen.add(c.user_id);
        });
      grouped[id] = list;
    });

    setCollabsByProject((prev) => ({ ...prev, ...grouped }));
  };

  // Detect "no projects ever" state for first-time empty UI (independent of search/tab)
  useEffect(() => {
    if (!user) return;
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .then(({ count }) => setHasAnyProjectsEver((count ?? 0) > 0));
  }, [user]);

  // Activity heatmap data
  useEffect(() => {
    if (!user) return;
    supabase.rpc("get_user_stats", { p_user_id: user.id }).then(({ data, error }) => {
      if (error) {
        console.warn("get_user_stats", error);
        return;
      }
      setStats(data as unknown as DashboardStats);
    });
  }, [user]);

  const heatmapTitle = (() => {
    if (!stats) return "Activity";
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const todayCount = stats.heatmap?.find((e) => e.d === todayKey)?.c ?? 0;
    if (stats.current_streak >= 2) return `You're on a ${stats.current_streak}-day streak — keep it rolling 🔥`;
    if (todayCount > 0) return `${todayCount} ${todayCount === 1 ? "save" : "saves"} today — nice work 🎧`;
    return "Every save builds your story 🎵";
  })();

  // Reset & refetch when filters change
  useEffect(() => {
    if (!user) return;
    setPage(0);
    setProjects([]);
    sharedIdsRef.current = null; // re-derive on tab change
    void fetchPage({ append: false, pageIndex: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tab, debouncedSearch, showArchived]);

  // Only surface a reminder that is still outstanding and has not been waved
  // away. A dismissed row never comes back; a completed one ticks and then
  // retires with the panel.
  const reminders = ([
    { id: "share" as ReminderId, done: onboarding.hasShared },
    { id: "watch" as ReminderId, done: onboarding.done.watch },
  ]).filter((r) => !dismissedReminders.includes(r.id) && !(r.done && dismissedReminders.includes(r.id)));

  const dismissReminder = (id: ReminderId) => {
    trackButtonClick("dashboard_dismiss_reminder", "dashboard", { reminder: id });
    const next = [...dismissedReminders, id];
    setDismissedReminders(next);
    try {
      localStorage.setItem("tf_dismissed_reminders", JSON.stringify(next));
    } catch {
      /* private mode — the row simply returns next visit */
    }
  };

  const handleReminderAct = (id: ReminderId) => {
    trackButtonClick("dashboard_reminder_act", "dashboard", { reminder: id });
    if (id === "share") {
      // Teach sharing on the real control rather than describing it here.
      const target = projects.find((p) => !p.archived) ?? projects[0];
      if (target) navigate(`/project/${target.id}?onboard=share`);
      return;
    }
    navigate("/desktop-app#watch-a-folder");
  };

  const hasMore = projects.length < totalCount;

  const handleShowMore = () => {
    trackButtonClick("dashboard_show_more", "dashboard", { current_count: projects.length });
    const next = page + 1;
    setPage(next);
    void fetchPage({ append: true, pageIndex: next });
  };

  const openUpload = () => navigate("/desktop-app");

  // Only show the first-time empty state when we're certain the user has zero projects.
  // Guard against races where the standalone count query resolves with 0 even though
  // the main fetch returns projects (e.g. transient RLS/auth timing on reload).
  const isFirstTime =
    hasAnyProjectsEver === false &&
    tab !== "shared" &&
    !debouncedSearch &&
    !loading &&
    projects.length === 0 &&
    totalCount === 0;

  return (
    <div className="min-h-screen">
      <Navbar />
      <PageContainer>
        {isFirstTime ? (
          <FirstTimeEmpty onUpload={openUpload} />
        ) : (
          <>
            {/* Masthead. One welcome, not two competing headings -- the
                greeting carries the page and the activity field sits beside
                it as ambience rather than as a second card demanding a title. */}
            <header className="flex flex-col gap-8 pb-2 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0 space-y-3">
                <p className="tf-label">Your workspace</p>
                <h1 className="text-[2.5rem] font-bold leading-[1.05] tracking-tight sm:text-5xl">
                  {greeting}
                </h1>
                <p className="max-w-md text-[15px] leading-relaxed text-muted-foreground">
                  {heatmapTitle}
                </p>

                {/* What is left after setup. Sits beside the activity field —
                    seen without being shouted, and removable, because these
                    are improvements on a working setup rather than setup. */}
                {reminders.length > 0 && (
                  <div className="max-w-md pt-2">
                    <SetupReminders
                      items={reminders}
                      onAct={handleReminderAct}
                      onDismiss={dismissReminder}
                    />
                  </div>
                )}
              </div>

              {stats?.heatmap && (
                <div className="w-full min-w-0 xl:max-w-xl">
                  <ContributionHeatmap heatmap={stats.heatmap} title="Activity" weeks={26} />
                </div>
              )}
            </header>

            {/* One toolbar. Filter, search and scope read as a single row of
                controls rather than a heading stacked above a second bar. */}
            <div className="flex flex-col gap-4 border-t border-border pt-6 lg:flex-row lg:items-center lg:justify-between">
              <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
                <TabsList className="h-10">
                  <TabsTrigger value="all" className="px-4">All</TabsTrigger>
                  <TabsTrigger value="my" className="px-4">Mine</TabsTrigger>
                  <TabsTrigger value="shared" className="px-4">Shared</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search projects…"
                    className="h-10 w-full pl-9 sm:w-64"
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <Switch
                    checked={showArchived}
                    onCheckedChange={setShowArchived}
                    aria-label="Show archived projects"
                  />
                  Archived
                </label>
                <Button
                  onClick={() => {
                    trackButtonClick("dashboard_new_project", "dashboard");
                    openUpload();
                  }}
                  className="h-10 gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Upload
                </Button>
              </div>
            </div>

            {/* Grid */}
            <ProjectGrid
              projects={projects}
              loading={loading}
              collabsByProject={collabsByProject}
              search={debouncedSearch}
              onNewProject={openUpload}
              onFilesDropped={(files) => {
                trackButtonClick("dashboard_drop_redirect_to_sync", "dashboard", { file_count: files.length });
                openUpload();
              }}
              showNewTile={tab !== "shared"}
            />

            {/* Show more */}
            {hasMore && !loading && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={handleShowMore}
                  disabled={appending}
                  className="gap-2 px-6"
                >
                  {appending ? "Loading…" : "Show more projects"}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
            )}

          </>
        )}

      </PageContainer>
    </div>
  );
}

/* ---------------- Subcomponents ---------------- */

function FirstTimeEmpty({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="tf-surface flex flex-col items-center justify-center rounded-xl p-12 text-center">
      <div className="tf-lit tf-breathe mb-6 rounded-2xl p-6">
        <Download className="h-12 w-12 text-brand" />
      </div>
      <h1 className="text-2xl font-bold mb-2">Welcome to Tunesfork 👋</h1>
      <p className="text-muted-foreground mb-8 max-w-md">
        The best way to start: install <strong>Tunesfork Sync</strong>, point it at your Ableton
        project folders, and every save backs up here automatically — no zipping, no uploading.
      </p>
      <Button asChild size="lg" className="gap-2">
        <Link
          to="/desktop-app"
          onClick={() => trackButtonClick("dashboard_first_download_app", "dashboard_empty")}
        >
          <Download className="h-5 w-5" />
          Download Tunesfork Sync
        </Link>
      </Button>
      <button
        onClick={() => {
          trackButtonClick("dashboard_first_upload", "dashboard_empty");
          onUpload();
        }}
        className="mt-4 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        or upload a project manually
      </button>
    </div>
  );
}

function ProjectGrid({
  projects,
  loading,
  collabsByProject,
  search,
  onNewProject,
  onFilesDropped,
  showNewTile,
}: {
  projects: Project[];
  loading: boolean;
  collabsByProject: Record<string, ProjectCardCollaborator[]>;
  search: string;
  onNewProject: () => void;
  onFilesDropped: (files: FileList) => void;
  showNewTile: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="tf-pending aspect-square rounded-xl border border-border"
            style={{ "--tf-delay": `${i * 90}ms` } as CSSProperties}
          />
        ))}
      </div>
    );
  }

  if (projects.length === 0 && search) {
    return (
      <div className="tf-surface flex flex-col items-center justify-center rounded-xl py-16 text-center">
        <FolderOpen className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-muted-foreground">No projects match "{search}".</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
      {projects.map((p, i) => (
        <ProjectCard
          key={p.id}
          project={p}
          collaborators={collabsByProject[p.id] ?? []}
          index={i}
        />
      ))}
      {showNewTile && (
        <NewProjectCard onClick={onNewProject} onFilesDropped={onFilesDropped} />
      )}
    </div>
  );
}
