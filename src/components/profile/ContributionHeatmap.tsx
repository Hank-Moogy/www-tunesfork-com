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

export default function ContributionHeatmap({
  heatmap,
  title = "Activity",
  weeks: weekCount = 53,
}: {
  heatmap: Entry[];
  title?: string;
  weeks?: number;
}) {
  const { weeks, monthLabels, windowTotal, windowLabel } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of heatmap) {
      counts.set(e.d, e.c);
    }
    // Build weekCount weeks ending today (Sunday-start columns)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    // end of week (Saturday)
    end.setDate(end.getDate() + (6 - end.getDay()));
    const start = new Date(end);
    start.setDate(end.getDate() - weekCount * 7 + 1);

    let total = 0;
    const weeksArr: { date: Date; count: number; isFuture: boolean }[][] = [];
    const monthSeen: { col: number; label: string }[] = [];
    let cursor = new Date(start);
    for (let w = 0; w < weekCount; w++) {
      const week: { date: Date; count: number; isFuture: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        // Key by the cell's local calendar date — toISOString() shifts to UTC,
        // which mislabels every cell for users east/west of UTC and pushed
        // "today" onto an invisible future cell.
        const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
        const count = counts.get(iso) ?? 0;
        const isFuture = cursor > today;
        if (!isFuture) total += count;
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
    const label = weekCount >= 52 ? "in the last year" : `in the last ${Math.round(weekCount / 4.345)} months`;
    return { weeks: weeksArr, monthLabels: monthSeen, windowTotal: total, windowLabel: label };
  }, [heatmap, weekCount]);

  return (
    <section className="glass-card p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">
          <span className="font-mono font-semibold text-foreground">{windowTotal}</span> saves {windowLabel}
        </p>
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
            {/* Legend */}
            <div className="mt-2 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
              <span>Less</span>
              <span className="h-3 w-3 rounded-sm bg-muted/50" />
              <span className="h-3 w-3 rounded-sm bg-accent/30" />
              <span className="h-3 w-3 rounded-sm bg-accent/55" />
              <span className="h-3 w-3 rounded-sm bg-accent/80" />
              <span className="h-3 w-3 rounded-sm bg-accent" />
              <span>More</span>
            </div>
          </div>
        </div>
      </TooltipProvider>
    </section>
  );
}
