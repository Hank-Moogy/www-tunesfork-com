import type { UserStats } from "@/pages/ProfilePage";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sprout, Save, Flame, HardDrive, FolderKanban, Users, Moon, Music2, Sparkles, Trophy } from "lucide-react";

type Badge = {
  key: string;
  label: string;
  desc: string;
  icon: typeof Sprout;
  unlocked: boolean;
};

export default function Milestones({ stats }: { stats: UserStats }) {
  const nightSaves = stats.hour_histogram
    .filter((h) => h.hour >= 22 || h.hour <= 4)
    .reduce((s, h) => s + h.count, 0);

  const badges: Badge[] = [
    { key: "first", label: "First save", desc: "Sync your first Ableton save", icon: Sprout, unlocked: stats.total_saves >= 1 },
    { key: "ten", label: "10 saves", desc: "Reach 10 saves", icon: Save, unlocked: stats.total_saves >= 10 },
    { key: "hundred", label: "Century", desc: "Reach 100 saves", icon: Trophy, unlocked: stats.total_saves >= 100 },
    { key: "streak7", label: "7-day streak", desc: "Save 7 days in a row", icon: Flame, unlocked: stats.longest_streak >= 7 },
    { key: "streak30", label: "30-day streak", desc: "Save 30 days in a row", icon: Flame, unlocked: stats.longest_streak >= 30 },
    { key: "gig", label: "1 GB synced", desc: "Sync 1 GB to the cloud", icon: HardDrive, unlocked: stats.total_bytes >= 1024 ** 3 },
    { key: "tenproj", label: "10 projects", desc: "Work on 10 projects", icon: FolderKanban, unlocked: stats.total_projects >= 10 },
    { key: "collab", label: "Collaborator", desc: "Contribute to a friend's project", icon: Users, unlocked: stats.collab_projects >= 1 },
    { key: "owl", label: "Night owl", desc: "20+ saves between 10PM and 4AM", icon: Moon, unlocked: nightSaves >= 20 },
    { key: "diverse", label: "Plugin nerd", desc: "Use 25+ different plugins", icon: Music2, unlocked: stats.distinct_plugins >= 25 },
    { key: "iter", label: "Perfectionist", desc: "10+ versions on a single project", icon: Sparkles, unlocked: stats.avg_versions_per_project >= 10 },
  ];

  const unlocked = badges.filter((b) => b.unlocked).length;

  return (
    <section className="glass-card p-6">
      <div className="mb-4 flex items-end justify-between">
        <h2 className="text-lg font-semibold">Milestones</h2>
        <span className="font-mono text-sm text-muted-foreground">
          {unlocked} / {badges.length}
        </span>
      </div>
      <TooltipProvider delayDuration={100}>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-11">
          {badges.map((b) => (
            <Tooltip key={b.key}>
              <TooltipTrigger asChild>
                <div
                  className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border p-2 transition ${
                    b.unlocked
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-white/40 bg-white/30 text-muted-foreground/50 grayscale"
                  }`}
                >
                  <b.icon className="h-5 w-5" />
                  <span className="text-center text-[10px] font-medium leading-tight">{b.label}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {b.unlocked ? "✓ " : "🔒 "} {b.desc}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </section>
  );
}
