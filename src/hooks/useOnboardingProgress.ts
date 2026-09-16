import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type StepId = "name" | "install" | "pair" | "backup" | "share" | "watch";

export type OnboardingProgress = {
  loading: boolean;
  /** True when progress could not be read. Callers must fail open. */
  failed: boolean;
  /** Real-world signals, each derived rather than self-reported. */
  hasName: boolean;
  clickedInstall: boolean;
  hasDevice: boolean;
  projectCount: number;
  hasShared: boolean;
  /** Platform gate: the Sync app ships for macOS only. */
  canInstall: boolean;
  done: Record<StepId, boolean>;
  /** First incomplete step — where the user is returned to. */
  currentStep: StepId;
  /** True once the app may be entered. */
  unlocked: boolean;
  refresh: () => Promise<void>;
  markInstallClicked: () => void;
};

export const STEP_ORDER: StepId[] = ["name", "install", "pair", "backup", "share", "watch"];

/** Backing up all folders at once only reads as an achievement with a few. */
const WATCHING_THRESHOLD = 3;

const INSTALL_CLICKED_KEY = "tf_onboarding_install_clicked";

function isMac() {
  // Dev-only override. The Windows path cannot otherwise be tested from a Mac:
  // navigator.platform stays "MacIntel" even under a DevTools user-agent
  // override, so there is no way to reach that branch by hand. Compiled out of
  // production builds by import.meta.env.DEV.
  if (import.meta.env.DEV && typeof window !== "undefined") {
    const forced = new URLSearchParams(window.location.search).get("tf_platform");
    if (forced) return forced === "mac";
  }
  if (typeof navigator === "undefined") return true;
  const p = `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`.toLowerCase();
  // Treat unknown platforms as capable rather than locking someone out of a
  // flow they cannot otherwise escape.
  if (!p.trim()) return true;
  return p.includes("mac") && !p.includes("iphone") && !p.includes("ipad");
}

/**
 * Onboarding progress is derived from what the user has actually done, not
 * from a stored step counter. That matters because most of these steps are
 * completed *outside* the web app — pairing happens in the tray app's own
 * onboarding, and a backup happens in Ableton. A counter would immediately
 * disagree with reality; a derived signal cannot.
 *
 * The one exception is the install click, which is genuinely unobservable
 * from a browser. It is remembered locally and superseded the moment a device
 * actually pairs, since you cannot pair without having installed.
 */
export function useOnboardingProgress(): OnboardingProgress {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hasName, setHasName] = useState(false);
  const [hasDevice, setHasDevice] = useState(false);
  const [projectCount, setProjectCount] = useState(0);
  const [hasShared, setHasShared] = useState(false);
  const [clickedInstall, setClickedInstall] = useState(() => {
    try {
      return localStorage.getItem(INSTALL_CLICKED_KEY) === "1";
    } catch {
      return false;
    }
  });

  const canInstall = isMac();

  const load = useCallback(async () => {
    if (!user) return;
    const [profile, devices, projects, collabs] = await Promise.all([
      supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("device_tokens")
        .select("id")
        .eq("user_id", user.id)
        .is("revoked_at", null)
        .limit(1),
      supabase.from("projects").select("id, share_token").eq("owner_id", user.id),
      // A project counts as shared if a link exists OR someone was invited.
      supabase.from("collaborators").select("project_id").limit(1),
    ]);

    setHasName(Boolean(profile.data?.display_name?.trim()));
    setHasDevice((devices.data?.length ?? 0) > 0);
    const owned = projects.data ?? [];
    setProjectCount(owned.length);
    setHasShared(
      owned.some((p) => Boolean(p.share_token)) || (collabs.data?.length ?? 0) > 0,
    );
    setLoading(false);
  }, [user]);

  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      await load();
    } catch (e) {
      // Never leave the caller waiting. A user whose progress cannot be read
      // is let through rather than held on a screen that will not resolve.
      console.warn("[onboarding] could not read progress", e);
      setFailed(true);
      setLoading(false);
    }
  }, [user, load]);


  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [user, refresh]);

  const markInstallClicked = useCallback(() => {
    setClickedInstall(true);
    try {
      localStorage.setItem(INSTALL_CLICKED_KEY, "1");
    } catch {
      /* private mode — the derived pairing signal still carries the step */
    }
  }, []);

  const done: Record<StepId, boolean> = {
    name: hasName,
    // Pairing proves installation, so it supersedes the local flag.
    install: !canInstall || hasDevice || clickedInstall,
    pair: !canInstall || hasDevice,
    backup: projectCount > 0,
    share: hasShared,
    watch: projectCount >= WATCHING_THRESHOLD,
  };

  const currentStep = STEP_ORDER.find((s) => !done[s]) ?? "watch";

  // The app opens once a real backup exists. Sharing and watching a folder are
  // strongly encouraged but never trap someone. Non-macOS users cannot install
  // the Sync app at all and must not be held behind a door they cannot open.
  const unlocked = failed || !canInstall || (hasDevice && projectCount > 0);

  return {
    loading,
    failed,
    hasName,
    clickedInstall,
    hasDevice,
    projectCount,
    hasShared,
    canInstall,
    done,
    currentStep,
    unlocked,
    refresh,
    markInstallClicked,
  };
}
