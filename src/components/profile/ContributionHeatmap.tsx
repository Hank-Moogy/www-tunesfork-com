import { useMemo } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Entry = { d: string; c: number };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Mon", "Wed", "Fri"];

function intensity(c: number): string {
  if (c === 0) return "bg-muted/50";
  if (c === 1) return "bg-accent/30";
  if (c <= 3) return "bg-accent/55";
  if (c <= 6) return "bg-accent/80";
  return "bg-accent";
}

export default function ContributionHeatmap({ heatmap }: { heatmap: Entry[] }) {
  const { weeks, monthLabels, totalThisYear } = useMemo(() => {
    const counts = new Map<string, number>();
    let total = 0;
    for (const e of heatmap) {
      counts.set(e.d, e.c);
      total += e.c;
    }
    // Build 53 weeks ending today (Sunday-start columns)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    // end of week (Saturday)
    end.setDate(end.getDate() + (6 - end.getDay()));
    const start = new Date(end);
    start.setDate(end.getDate() - 53 * 7 + 1);

    const weeksArr: { date: Date; count: number; isFuture: boolean }[][] = [];
    const monthSeen: { col: number; label: string }[] = [];
    let cursor = new Date(start);
    for (let w = 0; w < 53; w++) {
      const week: { date: Date; count: number; isFuture: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const iso = cursor.toISOString().slice(0, 10);
        const count = counts.get(iso) ?? 0;
        const isFuture = cursor > today;
        week.push({ date: new Date(cursor), count, isFuture });
        if (d === 0) {
          // First day of column — record month change
          const lbl = MONTHS[cursor.getMonth()];
          if (monthSeen.length === 0 || monthSeen[monthSeen.length - 1].label !== lbl) {
            monthSeen.push({ col: w, label: lbl });
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      weeksArr.push(week);
    }
    return { weeks: weeksArr, monthLabels: monthSeen, totalThisYear: total };
  }, [heatmap]);

  return (
    <section className="glass-card p-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold">Activity</h2>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">{totalThisYear}</span> saves in the last year
          </p>
        </div>
        <div className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <span>Less</span>
          <span className="h-3 w-3 rounded-sm bg-muted/50" />
          <span className="h-3 w-3 rounded-sm bg-accent/30" />
          <span className="h-3 w-3 rounded-sm bg-accent/55" />
          <span className="h-3 w-3 rounded-sm bg-accent/80" />
          <span className="h-3 w-3 rounded-sm bg-accent" />
          <span>More</span>
        </div>
      </div>

      <TooltipProvider delayDuration={50}>
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            {/* Month labels */}
            <div className="relative ml-8 mb-1 h-4">
              {monthLabels.map((m) => (
                <span
                  key={`${m.col}-${m.label}`}
                  className="absolute text-[10px] text-muted-foreground"
                  style={{ left: `${m.col * 14}px` }}
                >
                  {m.label}
                </span>
              ))}
            </div>
            <div className="flex gap-[2px]">
              {/* Day labels */}
              <div className="mr-1 flex w-7 flex-col gap-[2px] text-[10px] text-muted-foreground">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="h-3 leading-3">
                    {i === 1 ? DAYS[0] : i === 3 ? DAYS[1] : i === 5 ? DAYS[2] : ""}
                  </div>
                ))}
              </div>
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[2px]">
                  {week.map((day, di) => (
                    <Tooltip key={di}>
                      <TooltipTrigger asChild>
                        <div
                          className={`h-3 w-3 rounded-sm ${
                            day.isFuture ? "bg-transparent" : intensity(day.count)
                          }`}
                        />
                      </TooltipTrigger>
                      {!day.isFuture && (
                        <TooltipContent side="top" className="text-xs">
                          <span className="font-mono">{day.count}</span>{" "}
                          {day.count === 1 ? "save" : "saves"} on{" "}
                          {day.date.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </TooltipProvider>
    </section>
  );
}
