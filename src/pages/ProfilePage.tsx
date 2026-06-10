import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import PageContainer from "@/components/PageContainer";
import { usePageView } from "@/hooks/usePageView";
import HeroStats from "@/components/profile/HeroStats";
import ContributionHeatmap from "@/components/profile/ContributionHeatmap";
import RhythmCard from "@/components/profile/RhythmCard";
import GearCard from "@/components/profile/GearCard";
import Milestones from "@/components/profile/Milestones";
import StorageCard from "@/components/profile/StorageCard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Flame, RefreshCw } from "lucide-react";

export type UserStats = {
  user_id: string;
  total_saves: number;
  total_projects: number;
  total_bytes: number;
  biggest_save_bytes: number;
  first_save: string | null;
  collab_projects: number;
  avg_versions_per_project: number;
  current_streak: number;
  longest_streak: number;
  distinct_plugins: number;
  avg_tracks_per_save: number;
  heatmap: { d: string; c: number }[];
  top_plugins: { name: string; count: number }[];
  bpm_histogram: { bpm: number; count: number }[];
  dow_histogram: { dow: number; count: number }[];
  hour_histogram: { hour: number; count: number }[];
  recent: {
    id: string;
    project_id: string;
    project_name: string;
    version_number: number;
    created_at: string;
    file_size_bytes: number;
  }[];
  storage_by_project: {
    project_id: string;
    project_name: string;
    bytes: number;
    version_count: number;
  }[];
};

export default function ProfilePage() {
  usePageView("dashboard"); // reuse until "profile" added to PageName enum
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [profile, setProfile] = useState<{ display_name: string | null; avatar_url: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!user) return;
      if (opts.silent) setRefreshing(true);
      const [statsRes, profRes] = await Promise.all([
        supabase.rpc("get_user_stats", { p_user_id: user.id }),
        supabase.from("profiles").select("display_name, avatar_url").eq("user_id", user.id).maybeSingle(),
      ]);
      if (statsRes.error) console.error("get_user_stats", statsRes.error);
      else setStats(statsRes.data as UserStats);
      if (profRes.data) setProfile(profRes.data);
      setLastUpdated(new Date());
      setLoading(false);
      setRefreshing(false);
    },
    [user]
  );

  // Initial load
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    refresh();
  }, [user, refresh]);

  // Refetch when the tab regains focus / becomes visible (covers desktop saves
  // happening while this tab was in the background or behind Ableton).
  useEffect(() => {
    const onFocus = () => refresh({ silent: true });
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh({ silent: true });
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Realtime: bump stats a moment after any new save by this user lands.
  // Debounced so a multi-row insert only triggers one refetch.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`stats-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "project_versions",
          filter: `uploader_id=eq.${user.id}`,
        },
        () => {
          if (refetchTimer.current) clearTimeout(refetchTimer.current);
          refetchTimer.current = setTimeout(() => refresh({ silent: true }), 800);
        }
      )
      .subscribe();
    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  const memberSince = useMemo(() => {
    if (!stats?.first_save) return null;
    return new Date(stats.first_save).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [stats]);

  const initials = (profile?.display_name ?? user?.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen">
      <Navbar />
      <PageContainer>
        {/* Header */}
        <header className="glass-card flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 ring-2 ring-white/70">
              {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
              <AvatarFallback className="bg-accent/20 text-accent text-lg font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {profile?.display_name ?? user?.email?.split("@")[0] ?? "Producer"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {memberSince ? `Producing since ${memberSince}` : "Your producer activity"}
                {stats && stats.current_streak > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-medium text-orange-600">
                    <Flame className="h-3 w-3" /> {stats.current_streak}-day streak
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {lastUpdated && (
              <span className="font-mono">
                Updated {lastUpdated.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refresh({ silent: true })}
              disabled={refreshing}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </header>

        {loading || !stats ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        ) : (
          <>
            <HeroStats stats={stats} />
            <StorageCard stats={stats} />
            <ContributionHeatmap heatmap={stats.heatmap} />
            <div className="grid gap-6 lg:grid-cols-2">
              <RhythmCard stats={stats} />
              <GearCard stats={stats} />
            </div>
            <Milestones stats={stats} />
          </>
        )}
      </PageContainer>
    </div>
  );
}
