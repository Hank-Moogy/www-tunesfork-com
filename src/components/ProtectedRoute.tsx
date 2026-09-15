import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, onboardingCompleted } = useAuth();
  const progress = useOnboardingProgress();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/auth?redirect=${encodeURIComponent(returnTo)}`} replace />;
  }

  const canSkipOnboarding = location.pathname === "/onboarding"
    || location.pathname === "/desktop-pair"
    || location.pathname === "/desktop-app"
    || location.pathname.startsWith("/checkout");

  // Wait for the derived signals before deciding, or a returning user is
  // bounced into onboarding for a frame on every page load.
  if (progress.loading && !canSkipOnboarding) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // The gate is real work, not a flag: the app opens once the desktop app is
  // paired and at least one project is backed up. `unlocked` already accounts
  // for platforms where Sync does not ship, so a Windows user is never held
  // behind a door that has no key. `onboarding_completed` still lets someone
  // who finished (or deliberately skipped out) past it.
  const mustOnboard = !progress.unlocked && !onboardingCompleted;

  if (mustOnboard && !canSkipOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
