import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { identifyUser, resetAnalyticsIdentity, trackSignupCompleted, trackSigninCompleted } from "@/lib/analytics";
import type { User, Session } from "@supabase/supabase-js";
import { supabaseDynamic } from "@/lib/supabaseDynamic";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  onboardingCompleted: boolean;
  setOnboardingCompleted: (v: boolean) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  onboardingCompleted: false,
  setOnboardingCompleted: () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

function fireAuthLifecycle(user: User) {
  try {
    const flagKey = `tf_signup_fired_${user.id}`;
    if (sessionStorage.getItem(flagKey) === "1") return;
    const provider = (user.app_metadata?.provider as string) ?? "email";
    const method: "email" | "google" = provider === "google" ? "google" : "email";
    const createdAt = user.created_at ? new Date(user.created_at).getTime() : 0;
    const isNewUser = createdAt > 0 && Date.now() - createdAt < 60_000;
    if (isNewUser) trackSignupCompleted(method);
    else trackSigninCompleted(method);
    sessionStorage.setItem(flagKey, "1");
  } catch (e) {
    console.warn("[auth] fireAuthLifecycle failed", e);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user && event === "SIGNED_IN") {
        fireAuthLifecycle(session.user);
      }
      if (!session?.user) {
        setOnboardingCompleted(false);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session?.user) {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch onboarding status when user changes
  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("profiles").select("onboarding_completed").eq("user_id", user.id).single(),
      supabaseDynamic.rpc("get_account_storage_usage", { _user_id: user.id }),
      supabase.rpc("get_user_stats", { p_user_id: user.id }),
    ]).then(([profileResult, storageResult, statsResult]) => {
        const completed = profileResult.data?.onboarding_completed ?? false;
        setOnboardingCompleted(completed);
        identifyUser(user.id, user.email, {
          auth_provider: user.app_metadata?.provider ?? "email",
          account_created_at: user.created_at,
          onboarding_completed: completed,
          plan: storageResult.data?.plan ?? "free",
          storage_used_bytes: storageResult.data?.used_bytes ?? 0,
          storage_limit_bytes: storageResult.data?.limit_bytes ?? null,
          project_count: statsResult.data?.total_projects ?? 0,
          collaborator_project_count: statsResult.data?.collab_projects ?? 0,
        });
        setLoading(false);
      });
  }, [user]);

  const signOut = async () => {
    await supabase.auth.signOut();
    resetAnalyticsIdentity();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, onboardingCompleted, setOnboardingCompleted, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
