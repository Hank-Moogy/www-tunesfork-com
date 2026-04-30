import { Link } from "react-router-dom";
import type { UserStats } from "@/pages/ProfilePage";

function fmtBytes(b: number) {
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function RecentSaves({ recent }: { recent: UserStats["recent"] }) {
  return (
    <section className="glass-card p-6">
      <h2 className="mb-4 text-lg font-semibold">Recent saves</h2>
      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">No saves yet — pair your Mac to start tracking activity.</p>
      ) : (
        <ul className="divide-y divide-white/40">
          {recent.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-3">
              <Link
                to={`/project/${r.project_id}`}
                className="min-w-0 flex-1 truncate font-medium hover:text-accent"
              >
                {r.project_name}{" "}
                <span className="font-mono text-xs text-muted-foreground">v{r.version_number}</span>
              </Link>
              <div className="ml-4 flex shrink-0 items-center gap-4 font-mono text-xs text-muted-foreground">
                <span>{fmtBytes(r.file_size_bytes)}</span>
                <span>{timeAgo(r.created_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
