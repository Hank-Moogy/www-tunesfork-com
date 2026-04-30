import { useEffect, useMemo, useState } from "react";
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
import RecentSaves from "@/components/profile/RecentSaves";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Flame } from "lucide-react";

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
};

export default function ProfilePage() {
  usePageView("dashboard"); // reuse until "profile" added to PageName enum
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [profile, setProfile] = useState<{ display_name: string | null; avatar_url: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [statsRes, profRes] = await Promise.all([
        // @ts-expect-error – RPC type generation lags behind migration
        supabase.rpc("get_user_stats", { p_user_id: user.id }),
        supabase.from("profiles").select("display_name, avatar_url").eq("user_id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      if (statsRes.error) console.error("get_user_stats", statsRes.error);
      else setStats(statsRes.data as UserStats);
      if (profRes.data) setProfile(profRes.data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

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
            <ContributionHeatmap heatmap={stats.heatmap} />
            <div className="grid gap-6 lg:grid-cols-2">
              <RhythmCard stats={stats} />
              <GearCard stats={stats} />
            </div>
            <Milestones stats={stats} />
            <RecentSaves recent={stats.recent} />
          </>
        )}
      </PageContainer>
    </div>
  );
}
