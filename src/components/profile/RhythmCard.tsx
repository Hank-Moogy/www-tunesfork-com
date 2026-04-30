import type { UserStats } from "@/pages/ProfilePage";
import { Calendar, Clock, Repeat } from "lucide-react";

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function fmtHour(h: number) {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

export default function RhythmCard({ stats }: { stats: UserStats }) {
  const bestDay = [...stats.dow_histogram].sort((a, b) => b.count - a.count)[0];
  const peakHour = [...stats.hour_histogram].sort((a, b) => b.count - a.count)[0];
  const maxHour = Math.max(1, ...stats.hour_histogram.map((h) => h.count));

  return (
    <section className="glass-card p-6">
      <h2 className="mb-4 text-lg font-semibold">Your rhythm</h2>

      <div className="grid grid-cols-3 gap-3">
        <Stat icon={Calendar} label="Best day" value={bestDay ? DOW[bestDay.dow] : "—"} />
        <Stat icon={Clock} label="Peak hour" value={peakHour ? fmtHour(peakHour.hour) : "—"} />
        <Stat icon={Repeat} label="Avg versions" value={stats.avg_versions_per_project.toFixed(1)} />
      </div>

      {/* 24h histogram */}
      <div className="mt-6">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Saves by hour
        </p>
        <div className="flex h-20 items-end gap-[2px]">
          {Array.from({ length: 24 }).map((_, h) => {
            const c = stats.hour_histogram.find((x) => x.hour === h)?.count ?? 0;
            const pct = (c / maxHour) * 100;
            return (
              <div
                key={h}
                className="group relative flex-1 rounded-sm bg-pastel-blue/70 transition hover:bg-pastel-blue"
                style={{ height: `${Math.max(pct, 2)}%`, minHeight: 2 }}
                title={`${fmtHour(h)} · ${c} saves`}
              />
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>12 AM</span>
          <span>6 AM</span>
          <span>12 PM</span>
          <span>6 PM</span>
          <span>12 AM</span>
        </div>
      </div>
    </section>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/40 p-3">
      <Icon className="mb-2 h-4 w-4 text-muted-foreground" />
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-base font-semibold">{value}</p>
    </div>
  );
}
