import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Cloud, GitFork, Users, Music, Headphones, Radio, Mic2, Drum, Piano, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const PRODUCER_LEVELS = [
  { value: "amateur", label: "Amateur", desc: "Just getting started with music production" },
  { value: "semi-pro", label: "Semi-Pro", desc: "Releasing music, growing my craft" },
  { value: "pro", label: "Pro", desc: "Music is my career" },
];

const USAGE_MODES = [
  { value: "solo", label: "Solo", desc: "Save my projects in the cloud", icon: Cloud },
  { value: "multiplayer", label: "Multiplayer", desc: "Collaborate with other artists", icon: Users },
];

const GENRES = [
  "Electronic", "Hip-Hop", "Band", "Sound Design", "Sound Art", "Traditional", "Other",
];

const REFERRAL_SOURCES = [
  "Instagram", "YouTube", "TikTok", "Google", "AI Chat", "From a Friend", "Other",
];

const TOUR_CARDS = [
  {
    title: "Hey 👋",
    body: "I built TunesFork because I was sick of making music alone in my room and I wanted to secure my projects after I lost all my music when my computer died last year.",
    gradient: "from-orange-900/60 to-amber-900/40",
  },
  {
    title: "The GitHub of music production",
    body: "Version-control your sessions, collaborate in real time, and never lose a beat.",
    gradient: "from-blue-900/60 to-indigo-900/40",
  },
  {
    title: "What you can do",
    body: null,
    features: [
      { icon: Cloud, text: "Automatically save all your Ableton projects in the cloud" },
      { icon: GitFork, text: "Collaborate, comment on versions, track iterations, plan releases, and fork to other versions" },
      { icon: Music, text: "Open-source your music and get remixes by other producers" },
    ],
    gradient: "from-emerald-900/60 to-teal-900/40",
  },
];

export default function Onboarding() {
  const { user, setOnboardingCompleted } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0); // 0-3 survey, 4-6 tour
  const [producerLevel, setProducerLevel] = useState("");
  const [usageMode, setUsageMode] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [referral, setReferral] = useState("");
  const [saving, setSaving] = useState(false);

  const totalSteps = 4 + TOUR_CARDS.length;
  const isSurvey = step < 4;
  const tourIndex = step - 4;
  const isLastStep = step === totalSteps - 1;

  const canProceed = () => {
    if (step === 0) return !!producerLevel;
    if (step === 1) return !!usageMode;
    if (step === 2) return genres.length > 0;
    if (step === 3) return !!referral;
    return true;
  };

  const toggleGenre = (g: string) => {
    setGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  };

  const handleFinish = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase.from("onboarding_responses").insert({
        user_id: user.id,
        producer_level: producerLevel,
        usage_mode: usageMode,
        music_genres: genres,
        referral_source: referral,
      });
      await supabase.from("profiles").update({ onboarding_completed: true }).eq("user_id", user.id);
      setOnboardingCompleted(true);
      navigate("/dashboard", { replace: true });
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      {/* Progress dots */}
      <div className="mb-8 flex gap-1.5">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
            )}
          />
        ))}
      </div>

      {/* Card container */}
      <div className="w-full max-w-md">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 min-h-[380px] flex flex-col">
          {/* Survey steps */}
          {step === 0 && (
            <SurveyStep title="What kind of producer are you?">
              <div className="space-y-3">
                {PRODUCER_LEVELS.map((l) => (
                  <button
                    key={l.value}
                    onClick={() => setProducerLevel(l.value)}
                    className={cn(
                      "w-full rounded-xl border p-4 text-left transition-all hover:scale-[1.02]",
                      producerLevel === l.value
                        ? "border-primary bg-primary/10 shadow-md"
                        : "border-border hover:border-muted-foreground/40"
                    )}
                  >
                    <p className="font-medium">{l.label}</p>
                    <p className="text-sm text-muted-foreground">{l.desc}</p>
                  </button>
                ))}
              </div>
            </SurveyStep>
          )}

          {step === 1 && (
            <SurveyStep title="How do you want to use TunesFork?">
              <div className="grid grid-cols-2 gap-3">
                {USAGE_MODES.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.value}
                      onClick={() => setUsageMode(m.value)}
                      className={cn(
                        "flex flex-col items-center gap-3 rounded-xl border p-6 transition-all hover:scale-[1.02]",
                        usageMode === m.value
                          ? "border-primary bg-primary/10 shadow-md"
                          : "border-border hover:border-muted-foreground/40"
                      )}
                    >
                      <Icon className="h-8 w-8 text-primary" />
                      <div className="text-center">
                        <p className="font-medium">{m.label}</p>
                        <p className="text-xs text-muted-foreground mt-1">{m.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </SurveyStep>
          )}

          {step === 2 && (
            <SurveyStep title="What kind of music do you make?">
              <p className="text-sm text-muted-foreground mb-4">Select all that apply</p>
              <div className="flex flex-wrap gap-2">
                {GENRES.map((g) => (
                  <button
                    key={g}
                    onClick={() => toggleGenre(g)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm font-medium transition-all",
                      genres.includes(g)
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border hover:border-muted-foreground/40"
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </SurveyStep>
          )}

          {step === 3 && (
            <SurveyStep title="How did you hear about us?">
              <div className="flex flex-wrap gap-2">
                {REFERRAL_SOURCES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setReferral(s)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm font-medium transition-all",
                      referral === s
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border hover:border-muted-foreground/40"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </SurveyStep>
          )}

          {/* Tour cards */}
          {!isSurvey && (
            <div className={cn("flex flex-1 flex-col rounded-xl bg-gradient-to-br p-2", TOUR_CARDS[tourIndex].gradient)}>
              <h2 className="text-xl font-bold mb-4">{TOUR_CARDS[tourIndex].title}</h2>
              {TOUR_CARDS[tourIndex].body && (
                <p className="text-muted-foreground leading-relaxed">{TOUR_CARDS[tourIndex].body}</p>
              )}
              {TOUR_CARDS[tourIndex].features && (
                <div className="space-y-4 mt-2">
                  {TOUR_CARDS[tourIndex].features!.map((f, i) => {
                    const Icon = f.icon;
                    return (
                      <div key={i} className="flex items-start gap-3">
                        <Icon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                        <p className="text-sm leading-relaxed">{f.text}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>

          {isLastStep ? (
            <Button onClick={handleFinish} disabled={saving} className="bg-accent hover:bg-accent/90 text-accent-foreground gap-2">
              <Sparkles className="h-4 w-4" />
              {saving ? "Setting up..." : "Let's go"}
            </Button>
          ) : (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed()}
              className="gap-1"
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function SurveyStep({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <h2 className="text-xl font-bold mb-6">{title}</h2>
      {children}
    </div>
  );
}
