import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Cloud, Music2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { trackButtonClick } from "@/lib/analytics";
import { usePageView } from "@/hooks/usePageView";

const VALUE_POINTS = [
  {
    icon: Cloud,
    label: "Auto backup",
    copy: "Tunesfork Sync watches your Ableton project folders and backs up every save.",
  },
  {
    icon: Music2,
    label: "Version memory",
    copy: "Keep clean snapshots of your sessions without renaming files or losing ideas.",
  },
  {
    icon: Users,
    label: "Collaboration ready",
    copy: "Share project versions with collaborators when a track is ready to leave your laptop.",
  },
];

const SIGNALS = ["SAVE", "ZIP", "UPLOAD", "VERSION", "SHARE"];

export default function LandingPage() {
  usePageView("landing");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const joinWaitlist = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    setSubmitting(true);
    setMessage(null);
    trackButtonClick("landing_waitlist_submit", "landing_waitlist", { platform: "mac" });

    const { error } = await supabase
      .from("sync_waitlist")
      .insert({ email: normalizedEmail, platform: "mac" });

    if (error) {
      const duplicate = error.code === "23505" || /duplicate|unique/i.test(error.message);
      setMessage({
        tone: duplicate ? "success" : "error",
        text: duplicate
          ? "You are already on the waitlist. I will keep you posted."
          : "Could not join the waitlist. Try again in a minute.",
      });
    } else {
      setEmail("");
      setMessage({ tone: "success", text: "You are on the list. We will send launch access when it is ready." });
    }

    setSubmitting(false);
  };

  return (
    <div className="tf-landing min-h-screen overflow-hidden bg-[#0d0f10] text-[#f1eadc]">
      <nav className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
        <Link
          to="/welcome"
          className="flex items-center gap-3"
          onClick={() => trackButtonClick("landing_nav_home", "landing_nav")}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#383b3c] bg-[#191b1d] shadow-[inset_0_1px_0_rgba(255,255,255,.12)]">
            <img src="/logo.png" alt="Tunesfork" className="h-6 w-6 object-contain" />
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#d8d0bf]">
            Tunesfork
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            asChild
            className="h-9 rounded-md px-3 text-xs font-semibold text-[#b7b0a3] hover:bg-white/5 hover:text-[#f1eadc]"
          >
            <Link to="/auth" onClick={() => trackButtonClick("landing_nav_signin", "landing_nav")}>
              Sign in
            </Link>
          </Button>
          <Button
            asChild
            className="h-9 rounded-md bg-[#ff6534] px-4 text-xs font-bold text-[#100f0d] shadow-[0_0_22px_rgba(255,101,52,.28)] hover:bg-[#ff7a4f]"
          >
            <a href="#waitlist" onClick={() => trackButtonClick("landing_nav_waitlist", "landing_nav")}>
              Join waitlist
            </a>
          </Button>
        </div>
      </nav>

      <main>
        <section className="relative mx-auto grid min-h-[calc(100svh-76px)] max-w-7xl items-center gap-12 px-5 pb-16 pt-6 md:grid-cols-[minmax(0,1fr)_minmax(360px,500px)] md:px-8 md:pb-20">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#3a3d3f] to-transparent" />
          <div className="relative z-10 max-w-3xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-md border border-[#303334] bg-[#151719]/80 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8f9994]">
              <span className="h-2 w-2 rounded-full bg-[#45ff72] shadow-[0_0_10px_rgba(69,255,114,.85)]" />
              Mac alpha opening soon
            </div>

            <h1 className="max-w-4xl text-balance text-5xl font-black leading-[0.95] tracking-tight text-[#f6efe0] sm:text-6xl lg:text-7xl">
              Automatic backup and collaboration for Ableton.
            </h1>

            <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-[#b7b0a3] md:text-xl">
              Tunesfork backs up your Ableton sessions from a Mac menu-bar app, keeps a version history of your saves, and gives collaborators a shared workspace around the project.
            </p>

            <form id="waitlist" onSubmit={joinWaitlist} className="mt-8 max-w-xl sm:mt-10">
              <div className="rounded-xl border border-[#303334] bg-[#151719] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_22px_70px_rgba(0,0,0,.36)]">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="producer@email.com"
                    className="h-14 flex-1 rounded-lg border-[#272a2c] bg-[#0a0b0c] px-4 text-base text-[#f6efe0] placeholder:text-[#666b68] focus-visible:ring-[#ff6534]"
                    aria-label="Email address"
                  />
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="h-14 rounded-lg bg-[#ff6534] px-6 text-sm font-black uppercase tracking-[0.08em] text-[#15100d] hover:bg-[#ff7a4f]"
                  >
                    {submitting ? "Joining" : "Join waitlist"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {message && (
                <p
                  className={`mt-3 text-sm ${
                    message.tone === "success" ? "text-[#45ff72]" : "text-[#ff6a5f]"
                  }`}
                >
                  {message.text}
                </p>
              )}
              <p className="mt-4 hidden max-w-lg text-sm leading-6 text-[#817c73] sm:block">
                Built first for solo Ableton producers on Mac. Collaboration and sharing are part of the core workflow, not an add-on.
              </p>
            </form>

            <div className="mt-6 rounded-xl border border-[#303334] bg-[#151719] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.08)] md:hidden">
              <div className="rounded-lg border border-black bg-[#050706] p-4">
                <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-[#68726e]">
                  <span>Sync-01</span>
                  <span className="flex items-center gap-2">
                    <i className="h-2 w-2 rounded-full bg-[#45ff72] shadow-[0_0_10px_rgba(69,255,114,.85)]" />
                    Armed
                  </span>
                </div>
                <div className="mt-5 flex items-center justify-between gap-4">
                  <strong className="font-mono text-lg uppercase tracking-[0.14em] text-[#ff6534] [text-shadow:0_0_12px_rgba(255,101,52,.45)]">
                    Save detected
                  </strong>
                  <div className="tf-meter h-6 min-w-20">
                    {Array.from({ length: 10 }).map((_, index) => (
                      <span key={index} style={{ animationDelay: `${index * -0.08}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <HardwareHero />
        </section>

        <section className="relative border-y border-[#26292a] bg-[#101213]">
          <div className="mx-auto grid max-w-7xl gap-4 px-5 py-8 md:grid-cols-3 md:px-8">
            {VALUE_POINTS.map((point) => (
              <article
                key={point.label}
                className="rounded-xl border border-[#2a2d2f] bg-[#151719] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]"
              >
                <div className="mb-5 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#767b79]">
                    {point.label}
                  </span>
                  <point.icon className="h-4 w-4 text-[#ff6534]" />
                </div>
                <p className="text-base leading-7 text-[#d8d0bf]">{point.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-10 px-5 py-20 md:grid-cols-[0.9fr_1.1fr] md:px-8">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#777a78]">
              How it works
            </p>
            <h2 className="mt-4 max-w-xl text-3xl font-black leading-tight text-[#f6efe0] md:text-5xl">
              Stay in Ableton. Tunesfork handles the backup.
            </h2>
          </div>
          <div className="grid gap-3">
            {[
              "Install the Mac menu-bar app.",
              "Choose the parent folder where your Ableton projects live.",
              "Every save becomes a cloud snapshot you can revisit or share.",
            ].map((step, index) => (
              <div key={step} className="flex gap-4 rounded-xl border border-[#2a2d2f] bg-[#151719] p-5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#ff6534] font-mono text-xs font-black text-[#15100d]">
                  {index + 1}
                </span>
                <p className="pt-0.5 text-lg leading-7 text-[#d8d0bf]">{step}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-[#26292a] px-5 py-8 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm text-[#817c73] sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Tunesfork</span>
          <div className="flex gap-5">
            <Link to="/auth" className="hover:text-[#f6efe0]">Sign in</Link>
            <Link to="/pricing" className="hover:text-[#f6efe0]">Pricing</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function HardwareHero() {
  return (
    <div className="relative z-10 mx-auto w-full max-w-[480px]">
      <div className="tf-cable tf-cable-one" />
      <div className="tf-cable tf-cable-two" />

      <div className="tf-hardware-shell">
        <span className="tf-screw left-4 top-4" />
        <span className="tf-screw right-4 top-4" />
        <span className="tf-screw bottom-4 left-4" />
        <span className="tf-screw bottom-4 right-4" />

        <div className="flex items-end justify-between px-8 pb-4 pt-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-black bg-[#191b1d]">
              <img src="/logo.png" alt="" className="h-7 w-7 object-contain" />
            </span>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#777a78]">Cloud version recorder</p>
              <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-[#e8e3d7]">
                Sync<span className="text-[#ff6534]">-01</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[#8c8e8c]">
            <span className="h-2 w-2 rounded-full bg-[#45ff72] shadow-[0_0_10px_rgba(69,255,114,.85)]" />
            Armed
          </div>
        </div>

        <div className="mx-5 rounded-xl border border-black bg-gradient-to-br from-[#050506] via-[#2b2c2d] to-[#080909] p-2 shadow-[inset_0_0_0_2px_#111,0_14px_36px_rgba(0,0,0,.45)]">
          <div className="tf-display">
            <div className="relative z-10 flex justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-[#5e6965]">
              <span>Ableton folder</span>
              <span>13:39</span>
            </div>
            <div className="relative z-10 flex min-h-[210px] flex-col items-center justify-center text-center">
              <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-[#68726e]">Next save</p>
              <strong className="mt-3 font-mono text-3xl uppercase tracking-[0.16em] text-[#ff6534] shadow-[#ff6534] [text-shadow:0_0_14px_rgba(255,101,52,.5)]">
                Backed up
              </strong>
              <p className="mt-4 max-w-[250px] font-mono text-[10px] uppercase leading-5 tracking-[0.14em] text-[#8f9994]">
                Project snapshot ready for version history and collaborators
              </p>
            </div>
            <div className="tf-meter relative z-10">
              {Array.from({ length: 22 }).map((_, index) => (
                <span key={index} style={{ animationDelay: `${index * -0.07}s` }} />
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-0 px-5 pt-4">
          {SIGNALS.map((signal, index) => (
            <div
              key={signal}
              className={`border border-[#070707] bg-gradient-to-b from-[#151617] to-[#090a0a] px-2 py-3 text-center ${
                index === 0 ? "rounded-l-lg" : index === SIGNALS.length - 1 ? "rounded-r-lg" : ""
              } ${index > 2 ? "hidden sm:block" : ""}`}
            >
              <span className="block font-mono text-[8px] uppercase tracking-[0.14em] text-[#616664]">{signal}</span>
              <Check className="mx-auto mt-2 h-4 w-4 text-[#ffb52e]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
