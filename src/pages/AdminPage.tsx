import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminRole } from "@/hooks/useAdminRole";
import { Users, FolderGit2, UserCheck, Loader2, ShieldAlert } from "lucide-react";
import Navbar from "@/components/Navbar";
import { usePageView } from "@/hooks/usePageView";

interface AdminMetrics {
  total_users: number;
  total_projects: number;
  users_with_collaborators: number;
  collaboration_percentage: number;
}

export default function AdminPage() {
  usePageView("admin");
  const { isAdmin, isLoading: roleLoading } = useAdminRole();

  const { data: metrics, isLoading } = useQuery({
    queryKey: ["admin-metrics"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_metrics");
      if (error) throw error;
      return data as unknown as AdminMetrics;
    },
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-32 text-center gap-4">
          <ShieldAlert className="h-12 w-12 text-destructive" />
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  const cards = [
    {
      label: "Total Users",
      value: metrics?.total_users ?? "—",
      icon: Users,
      color: "text-[hsl(var(--pastel-blue))]",
      bg: "bg-[hsl(var(--pastel-blue)/0.1)]",
    },
    {
      label: "Projects Hosted",
      value: metrics?.total_projects ?? "—",
      icon: FolderGit2,
      color: "text-[hsl(var(--pastel-green))]",
      bg: "bg-[hsl(var(--pastel-green)/0.1)]",
    },
    {
      label: "Users w/ Collaborators",
      value: metrics
        ? `${metrics.users_with_collaborators} (${metrics.collaboration_percentage}%)`
        : "—",
      icon: UserCheck,
      color: "text-[hsl(var(--pastel-purple))]",
      bg: "bg-[hsl(var(--pastel-purple)/0.1)]",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Backoffice</h1>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {cards.map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-border bg-card p-6 flex items-start gap-4"
              >
                <div className={`rounded-xl p-3 ${card.bg}`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-2xl font-bold mt-1">{card.value}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
