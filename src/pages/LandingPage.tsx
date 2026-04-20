import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Cloud, GitFork, Users, Music, ArrowRight, Shield, Zap } from "lucide-react";
import { usePageView } from "@/hooks/usePageView";
import { trackButtonClick } from "@/lib/analytics";

const FEATURES = [
  {
    icon: Cloud,
    title: "Cloud Backup",
    desc: "Never lose a project again. Every Ableton session is automatically saved and versioned in the cloud.",
  },
  {
    icon: GitFork,
    title: "Version Control",
    desc: "Track every iteration, compare versions, fork your tracks, and plan releases like a pro.",
  },
  {
    icon: Users,
    title: "Real-Time Collaboration",
    desc: "Invite collaborators, comment on specific timestamps, identify missing plugins, and hand off sessions seamlessly.",
  },
  {
    icon: Music,
    title: "Open-Source Your Music",
    desc: "Share your stems, get remixes from other producers, and build on each other's work.",
  },
  {
    icon: Shield,
    title: "Secure & Private",
    desc: "Your projects are encrypted and only accessible to you and the people you invite.",
  },
  {
    icon: Zap,
    title: "Built for Speed",
    desc: "Lightweight uploads, instant previews, and a UI designed for producers.",
  },
];

export default function LandingPage() {
  usePageView("landing");
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="TunesFork" className="h-5 w-auto" />
            <span className="text-lg font-bold tracking-tight">TunesFork</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link to="/pricing" onClick={() => trackButtonClick("landing_nav_pricing", "landing_nav")}>Pricing</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/auth" onClick={() => trackButtonClick("landing_nav_signin", "landing_nav")}>Sign In</Link>
            </Button>
            <Button asChild>
              <Link to="/auth?tab=signup" onClick={() => trackButtonClick("landing_nav_signup", "landing_nav")}>Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:py-32 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-4 py-1.5 text-sm text-muted-foreground mb-8">
            <Music className="h-3.5 w-3.5" />
            Built by producers, for producers
          </div>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            Never lose a beat.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[hsl(var(--pastel-blue))] to-[hsl(var(--pastel-purple))]">Never lose a project.</span>
          </h1>
          <p className="mx-auto max-w-2xl text-lg sm:text-xl text-muted-foreground mb-10 leading-relaxed">
            Back up your Ableton sessions to the cloud, collaborate with other artists,
            and pick up exactly where you left off — on any machine. TunesFork is the
            safety net every producer needs.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="gap-2 text-base px-8" asChild>
              <Link to="/auth" onClick={() => trackButtonClick("landing_hero_signup", "landing_hero")}>
                Start for free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="gap-2 text-base px-8" asChild>
              <a href="#features" onClick={() => trackButtonClick("landing_hero_see_how", "landing_hero")}>See how it works</a>
            </Button>
          </div>
        </div>
        {/* Subtle gradient orb */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-[hsl(var(--pastel-blue)/0.08)] to-[hsl(var(--pastel-purple)/0.08)] blur-3xl pointer-events-none" />
      </section>


      {/* Features */}
      <section id="features" className="py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Everything you need to produce smarter
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Stop losing projects, stop emailing ZIP files, stop working in isolation.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-border bg-card p-6 hover:border-primary/30 hover:shadow-sm transition-all"
              >
                <div className="mb-4 inline-flex rounded-xl bg-muted p-3">
                  <f.icon className="h-5 w-5 text-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Founder quote */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <blockquote className="text-xl sm:text-2xl font-medium leading-relaxed mb-6 text-foreground/90">
            "I built TunesFork because I was sick of making music alone in my room
            and I wanted to secure my projects after I lost all my music when my
            computer died last year."
          </blockquote>
          <p className="text-sm text-muted-foreground">— Samori Osei, Founder, TunesFork</p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Ready to save your first project?
          </h2>
          <p className="text-muted-foreground text-lg mb-10 max-w-xl mx-auto">
            Join thousands of producers who trust TunesFork to protect and evolve their music.
          </p>
          <Button size="lg" className="gap-2 text-base px-8" asChild>
            <Link to="/auth?tab=signup" onClick={() => trackButtonClick("landing_final_cta_signup", "landing_final_cta")}>
              Get started — it's free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="TunesFork" className="h-5 w-auto" />
            <span>© {new Date().getFullYear()} TunesFork</span>
          </div>
          <div className="flex gap-6">
            <Link to="/auth" className="hover:text-foreground transition-colors">Sign In</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
