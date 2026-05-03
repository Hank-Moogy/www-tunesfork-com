import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function AuthRedirect() {
  const { user, loading, onboardingCompleted } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/welcome" replace />;

  // If the user came from an invite link, send them back so the invite
  // can be auto-accepted (handled in SharePage).
  let pendingInvite: string | null = null;
  try { pendingInvite = sessionStorage.getItem("tf_pending_invite"); } catch {}
  if (pendingInvite) {
    return <Navigate to={`/share/${pendingInvite}`} replace />;
  }

  if (!onboardingCompleted) return <Navigate to="/onboarding" replace />;
  return <Navigate to="/dashboard" replace />;
}
