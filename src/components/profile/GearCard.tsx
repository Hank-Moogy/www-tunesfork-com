import type { UserStats } from "@/pages/ProfilePage";
import { Music2 } from "lucide-react";

export default function GearCard({ stats }: { stats: UserStats }) {
  const topPlugins = stats.top_plugins.slice(0, 6);
  const maxPluginCount = Math.max(1, ...topPlugins.map((p) => p.count));
  const favoriteBpm = stats.bpm_histogram[0];

  return (
    <section className="glass-card p-6">
      <h2 className="mb-4 text-lg font-semibold">Your sound</h2>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white/40 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Favorite BPM</p>
          <p className="mt-1 font-mono text-lg font-bold">{favoriteBpm ? favoriteBpm.bpm : "—"}</p>
        </div>
        <div className="rounded-xl bg-white/40 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Avg tracks</p>
          <p className="mt-1 font-mono text-lg font-bold">{stats.avg_tracks_per_save.toFixed(0)}</p>
        </div>
        <div className="rounded-xl bg-white/40 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Plugins used</p>
          <p className="mt-1 font-mono text-lg font-bold">{stats.distinct_plugins}</p>
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Top plugins
        </p>
        {topPlugins.length === 0 ? (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Music2 className="h-4 w-4" /> Save a project to start tracking your gear.
          </p>
        ) : (
          <div className="space-y-2">
            {topPlugins.map((p) => (
              <div key={p.name} className="flex items-center gap-3">
                <span className="w-32 truncate text-sm font-medium">{p.name}</span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted/50">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-pastel-purple/80"
                    style={{ width: `${(p.count / maxPluginCount) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right font-mono text-xs text-muted-foreground">{p.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
