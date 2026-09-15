import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Apple, ArrowRight, Check, Copy, Loader2, Monitor } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOnboardingProgress, STEP_ORDER, type StepId } from "@/hooks/useOnboardingProgress";
import { usePageView } from "@/hooks/usePageView";
import { trackButtonClick } from "@/lib/analytics";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TfParticleField from "@/components/TfParticleField";
import Stage from "@/components/onboarding/Stage";
import StepRail, { type RailStep } from "@/components/onboarding/StepRail";
import SuccessBurst from "@/components/onboarding/SuccessBurst";
import {
  AppObject,
  LibraryObject,
  NameplateObject,
  PairObject,
  ProjectObject,
  ShareObject,
} from "@/components/onboarding/StageObjects";

const STEPS: RailStep[] = [
  { id: "name", label: "Your name", hint: "What should we call you?" },
  { id: "install", label: "Install Sync", hint: "The app that does the saving." },
  { id: "pair", label: "Pair the app", hint: "Connect it to this account." },
  { id: "backup", label: "Back up a project", hint: "Open Ableton and hit save." },
  { id: "share", label: "Share a project", hint: "Send it to someone." },
  { id: "watch", label: "Watch everything", hint: "Point Sync at your whole folder." },
];

const DOWNLOAD_MAC = "/desktop-app";

/**
 * First run, shaped like a character-setup screen rather than a form: one
 * decision per page, the object you are configuring lit at the centre, and
 * progress as a column of lamps down the left that never reorders.
 *
 * Progress is *derived* (see useOnboardingProgress), not counted, because most
 * of these steps are completed outside this app — pairing happens in the tray
 * app, a backup happens in Ableton. While the user is on one of those steps
 * this page quietly polls for the real signal, so the screen completes itself
 * the moment the thing actually happens rather than asking them to confirm it.
 */
export default function Onboarding() {
  usePageView("onboarding");
  const { user, setOnboardingCompleted } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const reduceMotion = useReducedMotion();
  const progress = useOnboardingProgress();

  const [viewing, setViewing] = useState<StepId | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [burst, setBurst] = useState<string | null>(null);
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistDone, setWaitlistDone] = useState(false);
  const [firstProject, setFirstProject] = useState<{ id: string; name: string } | null>(null);

  // Dev-only: ?tf_step=share jumps straight to a screen, so the six stages can
  // be reviewed without first faking six steps of real data. Compiled out of
  // production builds.
  const forcedStep =
    import.meta.env.DEV && typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("tf_step") as StepId | null)
      : null;

  const step =
    forcedStep && STEP_ORDER.includes(forcedStep)
      ? forcedStep
      : (viewing ?? progress.currentStep);
  const stepIndex = STEP_ORDER.indexOf(step);

  // Seed the name field from the profile so returning here is not a blank slate.
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setName((v) => v || data?.display_name || ""));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("projects")
      .select("id, name")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .then(({ data }) => setFirstProject(data?.[0] ?? null));
  }, [user, progress.projectCount]);

  // Steps 3-4 complete elsewhere, so watch for them instead of asking.
  const watching = step === "pair" || step === "backup";
  const prevDone = useRef(progress.done);
  useEffect(() => {
    if (!watching) return;
    const t = setInterval(() => void progress.refresh(), 4000);
    return () => clearInterval(t);
  }, [watching, progress]);

  // Fire the success moment when a step flips to done.
  useEffect(() => {
    const before = prevDone.current;
    const after = progress.done;
    const justDone = STEP_ORDER.find((s) => !before[s] && after[s]);
    prevDone.current = after;
    if (!justDone) return;
    const labels: Record<StepId, string> = {
      name: "Nice to meet you",
      install: "Sync downloaded",
      pair: "App paired",
      backup: "First project backed up",
      share: "Project shared",
      watch: "Library watched",
    };
    setBurst(labels[justDone]);
    setViewing(null);
  }, [progress.done]);

  const saveName = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);
    trackButtonClick("onboarding_name", "onboarding");
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name.trim() })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast({ title: "Could not save that name", description: error.message, variant: "destructive" });
      return;
    }
    await progress.refresh();
  };

  const joinWaitlist = async () => {
    const email = (waitlistEmail || user?.email || "").trim();
    if (!email) return;
    trackButtonClick("onboarding_windows_waitlist", "onboarding");
    const { error } = await supabase
      .from("sync_waitlist")
      .upsert({ email, user_id: user?.id ?? null, platform: "windows" }, { onConflict: "email" });
    if (error) {
      toast({ title: "Could not join the waitlist", description: error.message, variant: "destructive" });
      return;
    }
    setWaitlistDone(true);
  };

  const shareFirstProject = async () => {
    if (!firstProject) return;
    trackButtonClick("onboarding_share", "onboarding");
    const { data: token, error } = await supabase.rpc("ensure_project_share_token", {
      _project_id: firstProject.id,
    });
    if (error || !token) {
      toast({ title: "Could not create a share link", variant: "destructive" });
      return;
    }
    const url = `${window.location.origin}/share/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Share link copied", description: url });
    } catch {
      toast({ title: "Share link ready", description: url });
    }
    await progress.refresh();
  };

  const finish = useCallback(() => {
    if (!user) return;
    trackButtonClick("onboarding_finish", "onboarding");
    void supabase.from("profiles").update({ onboarding_completed: true }).eq("user_id", user.id);
    setOnboardingCompleted(true);
    navigate("/dashboard");
  }, [user, navigate, setOnboardingCompleted]);

  if (progress.loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <TfParticleField accentRatio={0.04} className="pointer-events-none absolute inset-0 h-full w-full opacity-40" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(75% 55% at 50% 40%, transparent 30%, hsl(var(--background) / 0.85) 100%)" }}
      />

      <div className="relative mx-auto grid min-h-screen max-w-6xl grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-[260px_1fr] lg:gap-16 lg:px-10">
        {/* Progress rail */}
        <aside className="lg:py-6">
          <div className="mb-8 flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="tf-mark h-[18px] w-auto" />
            <span className="text-[15px] font-semibold tracking-tight">Tunesfork</span>
          </div>
          <StepRail steps={STEPS} activeId={step} done={progress.done} onJump={setViewing} />
          {progress.unlocked && (
            <button
              onClick={finish}
              className="mt-8 text-xs font-medium text-subtle-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Skip the rest for now
            </button>
          )}
        </aside>

        {/* Stage */}
        <main className="relative flex min-h-[560px] flex-col items-center justify-center">
          <AnimatePresence mode="wait">
            {burst ? (
              <SuccessBurst key="burst" label={burst} onDone={() => setBurst(null)} />
            ) : (
              <motion.div
                key={step}
                initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -14, scale: 0.98 }}
                transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                className="flex w-full max-w-lg flex-col items-center"
              >
                <p className="tf-label mb-6">
                  Step {stepIndex + 1} of {STEPS.length}
                </p>

                <Stage className="mb-10 h-[250px] w-full">
                  {step === "name" && <NameplateObject value={name} />}
                  {step === "install" && <AppObject />}
                  {step === "pair" && <PairObject paired={progress.hasDevice} />}
                  {step === "backup" && <ProjectObject name={firstProject?.name} />}
                  {step === "share" && <ShareObject />}
                  {step === "watch" && <LibraryObject count={progress.projectCount} />}
                </Stage>

                <StepBody
                  step={step}
                  progress={progress}
                  name={name}
                  setName={setName}
                  saving={saving}
                  saveName={saveName}
                  waitlistEmail={waitlistEmail}
                  setWaitlistEmail={setWaitlistEmail}
                  waitlistDone={waitlistDone}
                  joinWaitlist={joinWaitlist}
                  userEmail={user?.email ?? ""}
                  firstProject={firstProject}
                  shareFirstProject={shareFirstProject}
                  finish={finish}
                  goNext={() => setViewing(STEP_ORDER[Math.min(stepIndex + 1, STEP_ORDER.length - 1)])}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

type BodyProps = {
  step: StepId;
  progress: ReturnType<typeof useOnboardingProgress>;
  name: string;
  setName: (v: string) => void;
  saving: boolean;
  saveName: () => void;
  waitlistEmail: string;
  setWaitlistEmail: (v: string) => void;
  waitlistDone: boolean;
  joinWaitlist: () => void;
  userEmail: string;
  firstProject: { id: string; name: string } | null;
  shareFirstProject: () => void;
  finish: () => void;
  goNext: () => void;
};

function Heading({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-7 text-center">
      <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[34px]">{title}</h1>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function Waiting({ text }: { text: string }) {
  return (
    <p className="mt-5 flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
      <i className="tf-lamp" data-state="syncing" />
      {text}
    </p>
  );
}

function StepBody(p: BodyProps) {
  const { step, progress } = p;

  if (step === "name") {
    return (
      <>
        <Heading title="What should we call you?" body="Your artist name, your real name — whatever collaborators will recognise." />
        <div className="flex w-full max-w-sm gap-2">
          <Input
            value={p.name}
            onChange={(e) => p.setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && p.saveName()}
            placeholder="e.g. Moogy"
            className="h-11 text-center text-base"
            autoFocus
          />
          <Button onClick={p.saveName} disabled={!p.name.trim() || p.saving} className="h-11 shrink-0 gap-2">
            {p.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </>
    );
  }

  if (step === "install") {
    // The Sync app is macOS-only. A Windows user cannot complete this step, so
    // they are offered the waitlist and let through rather than trapped behind
    // a door that does not exist for them yet.
    if (!progress.canInstall) {
      return (
        <>
          <Heading
            title="Sync is macOS only, for now"
            body="The desktop app that backs up your sessions automatically ships for macOS today. Windows is next — leave your email and we'll tell you the day it lands."
          />
          {p.waitlistDone ? (
            <p className="flex items-center gap-2 text-sm font-medium text-status-synced">
              <Check className="h-4 w-4" /> You're on the list.
            </p>
          ) : (
            <div className="flex w-full max-w-sm gap-2">
              <Input
                type="email"
                value={p.waitlistEmail || p.userEmail}
                onChange={(e) => p.setWaitlistEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11 text-center text-base"
              />
              <Button onClick={p.joinWaitlist} className="h-11 shrink-0 gap-2">
                <Monitor className="h-4 w-4" /> Join
              </Button>
            </div>
          )}
          <button onClick={p.finish} className="mt-6 text-xs text-subtle-foreground underline-offset-4 hover:text-foreground hover:underline">
            Continue to Tunesfork
          </button>
        </>
      );
    }
    return (
      <>
        <Heading
          title="Install Tunesfork Sync"
          body="Sync sits quietly in your menu bar and captures every save as a cloud version. You keep working in Ableton exactly as you do now — no zipping, no uploading, nothing to remember."
        />
        <Button asChild size="lg" className="h-11 gap-2" onClick={() => progress.markInstallClicked()}>
          <a href={DOWNLOAD_MAC}>
            <Apple className="h-4 w-4" /> Download for macOS
          </a>
        </Button>
        <button onClick={p.goNext} className="mt-5 text-xs text-subtle-foreground underline-offset-4 hover:text-foreground hover:underline">
          Already installed it
        </button>
      </>
    );
  }

  if (step === "pair") {
    return (
      <>
        <Heading
          title="Pair Sync with your account"
          body="Open the app you just installed and follow its setup. It will ask to connect to this account — once it does, this page moves on by itself."
        />
        <Waiting text="Waiting for the app" />
      </>
    );
  }

  if (step === "backup") {
    return (
      <>
        <Heading
          title="Back up your first project"
          body="In Sync, add the folder holding an Ableton project. Then open that project and hit save — Tunesfork captures it as version one."
        />
        <Waiting text="Watching for a save" />
      </>
    );
  }

  if (step === "share") {
    return (
      <>
        <Heading
          title="Share it with someone"
          body="A share link lets anyone preview the project and its versions — no account needed. This is the part your collaborators will actually feel."
        />
        <Button onClick={p.shareFirstProject} disabled={!p.firstProject} size="lg" className="h-11 gap-2">
          <Copy className="h-4 w-4" />
          Copy a link to {p.firstProject?.name ?? "your project"}
        </Button>
        <button onClick={p.goNext} className="mt-5 text-xs text-subtle-foreground underline-offset-4 hover:text-foreground hover:underline">
          Maybe later
        </button>
      </>
    );
  }

  return (
    <>
      <Heading
        title="Back up everything at once"
        body="If all your Ableton projects live under one folder, point Sync at that folder instead of at a single project. Every session inside it gets versioned from then on, including the ones you make next year."
      />
      <Button onClick={p.finish} size="lg" className="h-11 gap-2">
        Go to my projects <ArrowRight className="h-4 w-4" />
      </Button>
    </>
  );
}
