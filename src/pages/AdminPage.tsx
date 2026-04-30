import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminRole } from "@/hooks/useAdminRole";
import { Users, FolderGit2, UserCheck, Loader2, ShieldAlert, Mail } from "lucide-react";
import Navbar from "@/components/Navbar";
import { usePageView } from "@/hooks/usePageView";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AdminMetrics {
  total_users: number;
  total_projects: number;
  users_with_collaborators: number;
  collaboration_percentage: number;
}

interface AdminUser {
  user_email: string;
  display_name: string | null;
  project_count: number;
  collaborator_count: number;
  created_at: string;
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

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["admin-user-list"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_user_list");
      if (error) throw error;
      return data as unknown as AdminUser[];
    },
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const { data: waitlist, isLoading: waitlistLoading } = useQuery({
    queryKey: ["admin-sync-waitlist"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_waitlist")
        .select("id, email, platform, user_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
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

        <h2 className="text-xl font-bold mt-10 mb-4">Users</h2>
        {usersLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Display Name</TableHead>
                  <TableHead className="text-right">Projects</TableHead>
                  <TableHead className="text-right">Collaborators</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users && users.length > 0 ? (
                  users.map((u) => (
                    <TableRow key={u.user_email}>
                      <TableCell className="font-medium">{u.user_email}</TableCell>
                      <TableCell>{u.display_name ?? "—"}</TableCell>
                      <TableCell className="text-right">{u.project_count}</TableCell>
                      <TableCell className="text-right">{u.collaborator_count}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No users found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="mt-10 mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Tunesfork Sync waitlist
            {waitlist && (
              <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                {waitlist.length}
              </span>
            )}
          </h2>
        </div>
        {waitlistLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Existing user</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waitlist && waitlist.length > 0 ? (
                  waitlist.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="font-medium">{w.email}</TableCell>
                      <TableCell className="capitalize">{w.platform ?? "—"}</TableCell>
                      <TableCell>
                        {w.user_id ? (
                          <span className="text-xs text-[hsl(var(--pastel-green))]">Yes</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">No</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(w.created_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No signups yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}