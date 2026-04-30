import { useState } from "react";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Apple, Monitor, Music, RefreshCw, Shield, Zap } from "lucide-react";

export default function DesktopAppPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState(user?.email ?? "");
  const [platform, setPlatform] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [joined, setJoined] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("sync_waitlist").insert({
        email: email.trim().toLowerCase(),
        platform: platform || null,
        user_id: user?.id ?? null,
      });
      // Treat unique-violation (already on list) as success.
      if (error && !String(error.message).toLowerCase().includes("duplicate")) {
        throw error;
      }
      setJoined(true);
      toast({ title: "You're on the list!", description: "We'll email you the moment Tunesfork Sync is ready." });
    } catch (err: any) {
      toast({ title: "Couldn't join", description: err.message ?? String(err), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-5xl px-6 py-16 lg:px-10 lg:py-24">
        {/* Hero */}
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Coming soon
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight md:text-6xl">
            Tunesfork <span className="text-primary">Sync</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Hit save in Ableton. A new version appears on Tunesfork.
            <br />
            No drag, no zip, no upload modal. It just works.
          </p>

          {/* Waitlist */}
          <div className="mx-auto mt-10 max-w-md">
            {joined ? (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-6 text-green-400">
                ✓ You're on the list. We'll be in touch.
              </div>
            ) : (
              <form onSubmit={handleJoin} className="flex flex-col gap-3 sm:flex-row">
                <Input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1"
                />
                <Button type="submit" disabled={submitting} className="bg-primary">
                  {submitting ? "Joining…" : "Get early access"}
                </Button>
              </form>
            )}

            {!joined && (
              <div className="mt-3 flex justify-center gap-2 text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={() => setPlatform("mac")}
                  className={`rounded-full border px-3 py-1 transition ${platform === "mac" ? "border-primary text-primary" : "border-border"}`}
                >
                  <Apple className="mr-1 inline h-3 w-3" /> Mac
                </button>
                <button
                  type="button"
                  onClick={() => setPlatform("windows")}
                  className={`rounded-full border px-3 py-1 transition ${platform === "windows" ? "border-primary text-primary" : "border-border"}`}
                >
                  <Monitor className="mr-1 inline h-3 w-3" /> Windows
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Feature row */}
        <div className="mt-24 grid gap-6 md:grid-cols-3">
          {[
            { icon: Music, title: "Watches your Ableton folder", body: "Point it at where you keep your projects. It tracks every .als you save." },
            { icon: RefreshCw, title: "Auto-zips & uploads", body: "Whole project folder — samples, recordings, metadata — sent to Tunesfork on every save." },
            { icon: Zap, title: "Lives in your menu bar", body: "Tiny app. No window to keep open. Pause anytime." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card/40 p-6">
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="mt-24">
          <h2 className="text-2xl font-bold">How it'll work</h2>
          <ol className="mt-6 space-y-4 text-muted-foreground">
            <li className="flex gap-4"><span className="font-mono text-primary">01</span> Download Tunesfork Sync (Mac or Windows).</li>
            <li className="flex gap-4"><span className="font-mono text-primary">02</span> Sign in with one click — same Tunesfork account.</li>
            <li className="flex gap-4"><span className="font-mono text-primary">03</span> Pick the folder where you keep Ableton projects.</li>
            <li className="flex gap-4"><span className="font-mono text-primary">04</span> Make music. Every save = new version on Tunesfork.</li>
          </ol>
        </div>

        {/* Trust */}
        <div className="mt-20 rounded-xl border border-border bg-muted/20 p-6 text-sm text-muted-foreground">
          <Shield className="mb-2 inline h-4 w-4 text-primary" />{" "}
          <strong className="text-foreground">Private by default.</strong> Sync only watches the folders you choose. You can pause or revoke device access from settings at any time.
        </div>
      </main>
    </div>
  );
}
