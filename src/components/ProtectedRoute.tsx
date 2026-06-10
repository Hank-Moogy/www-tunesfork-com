import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, onboardingCompleted } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const canSkipOnboarding = location.pathname === "/onboarding" || location.pathname === "/desktop-pair";

  if (!onboardingCompleted && !canSkipOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
