import type { UserStats } from "@/pages/ProfilePage";
import { Save, FolderKanban, HardDrive, Flame } from "lucide-react";

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

export default function HeroStats({ stats }: { stats: UserStats }) {
  const cards = [
    { label: "Total saves", value: stats.total_saves.toLocaleString(), icon: Save, tint: "text-pastel-blue" },
    { label: "Projects", value: stats.total_projects.toLocaleString(), icon: FolderKanban, tint: "text-pastel-purple" },
    { label: "Synced", value: formatBytes(stats.total_bytes), icon: HardDrive, tint: "text-pastel-green" },
    { label: "Longest streak", value: `${stats.longest_streak}d`, icon: Flame, tint: "text-pastel-orange" },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="glass-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{c.label}</span>
            <c.icon className={`h-4 w-4 ${c.tint}`} />
          </div>
          <p className="mt-3 font-mono text-3xl font-bold tracking-tight">{c.value}</p>
        </div>
      ))}
    </div>
  );
}
