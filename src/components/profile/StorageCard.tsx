import { useState } from "react";
import { Link } from "react-router-dom";
import { HardDrive } from "lucide-react";
import type { UserStats } from "@/pages/ProfilePage";

function formatBytes(b: number) {
  if (!b) return "0 B";
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

const SEGMENT_COLORS = [
  "bg-pastel-blue",
  "bg-pastel-purple",
  "bg-pastel-green",
  "bg-pastel-orange",
  "bg-pastel-pink",
  "bg-pastel-yellow",
  "bg-accent",
  "bg-primary",
];

const TOP_N = 8;

export default function StorageCard({ stats }: { stats: UserStats }) {
  const [expanded, setExpanded] = useState(false);
  const items = stats.storage_by_project ?? [];
  const total = stats.total_bytes || items.reduce((s, p) => s + p.bytes, 0);

  if (items.length === 0) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-pastel-green" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Storage</h2>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">No projects synced yet.</p>
      </div>
    );
  }

  const top = items.slice(0, TOP_N);
  const rest = items.slice(TOP_N);
  const restBytes = rest.reduce((s, p) => s + p.bytes, 0);
  const segments = [
    ...top.map((p, i) => ({
      key: p.project_id,
      label: p.project_name,
      bytes: p.bytes,
      color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
    })),
    ...(rest.length > 0
      ? [{ key: "__other__", label: `${rest.length} other`, bytes: restBytes, color: "bg-muted" }]
      : []),
  ];

  const visible = expanded ? items : top;

  return (
    <div className="glass-card p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-pastel-green" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Storage</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-mono font-semibold text-foreground">{formatBytes(total)}</span>{" "}
          across {items.length} {items.length === 1 ? "project" : "projects"}
          <span className="ml-2 text-xs">· No storage limit during alpha</span>
        </p>
      </header>

      {/* Segmented bar */}
      <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-muted/40">
        {segments.map((s) => {
          const pct = total > 0 ? (s.bytes / total) * 100 : 0;
          if (pct < 0.5) return null;
          return (
            <div
              key={s.key}
              className={`${s.color} h-full transition-opacity hover:opacity-80`}
              style={{ width: `${pct}%` }}
              title={`${s.label} — ${formatBytes(s.bytes)} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* Breakdown list */}
      <ul className="mt-5 space-y-3">
        {visible.map((p, i) => {
          const pct = total > 0 ? (p.bytes / total) * 100 : 0;
          const color = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
          return (
            <li key={p.project_id} className="flex items-center gap-3">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />
              <Link
                to={`/project/${p.project_id}`}
                className="min-w-0 flex-1 truncate text-sm font-medium hover:text-accent"
              >
                {p.project_name}
              </Link>
              <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-muted/40 sm:block">
                <div className={`h-full ${color}`} style={{ width: `${Math.max(pct, 1)}%` }} />
              </div>
              <span className="w-20 text-right font-mono text-xs text-muted-foreground">
                {formatBytes(p.bytes)}
              </span>
              <span className="hidden w-20 text-right text-xs text-muted-foreground sm:inline">
                {p.version_count} {p.version_count === 1 ? "ver" : "vers"}
              </span>
            </li>
          );
        })}
      </ul>

      {items.length > TOP_N && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 text-xs font-medium text-accent hover:underline"
        >
          {expanded ? "Show less" : `Show all ${items.length} projects`}
        </button>
      )}
    </div>
  );
}
