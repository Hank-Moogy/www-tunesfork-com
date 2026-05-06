import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Apple, Monitor, Music, RefreshCw, Shield, Zap, Download } from "lucide-react";
import { trackButtonClick } from "@/lib/analytics";
import {
  DESKTOP_ASSETS,
  DESKTOP_APP_VERSION_LABEL,
  GITHUB_LATEST_RELEASE_API,
  DOWNLOADS_AVAILABLE,
  DOWNLOAD_URLS,
  detectPlatform,
  type DesktopDownloadUrls,
  type DesktopPlatform,
} from "@/lib/desktopDownload";

export default function DesktopAppPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState(user?.email ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [joined, setJoined] = useState(false);
  const [platform, setPlatform] = useState<DesktopPlatform>("other");
  const [downloadUrls, setDownloadUrls] = useState<DesktopDownloadUrls>(DOWNLOAD_URLS);
  const [checkingDownloads, setCheckingDownloads] = useState(DOWNLOADS_AVAILABLE);

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  useEffect(() => {
    if (!GITHUB_LATEST_RELEASE_API) {
      setCheckingDownloads(false);
      return;
    }

    let cancelled = false;
    fetch(GITHUB_LATEST_RELEASE_API)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("No release found"))))
      .then((release) => {
        if (cancelled) return;
        const assets = Array.isArray(release.assets) ? release.assets : [];
        setDownloadUrls({
          mac: assets.find((asset: { name?: string }) => asset.name === DESKTOP_ASSETS.mac)?.browser_download_url ?? null,
          windows: assets.find((asset: { name?: string }) => asset.name === DESKTOP_ASSETS.windows)?.browser_download_url ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) setDownloadUrls({ mac: null, windows: null });
      })
      .finally(() => {
        if (!cancelled) setCheckingDownloads(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const primary = useMemo(() => {
    if (platform === "mac") {
      return { label: "Download for Mac", sub: "Apple Silicon + Intel · .dmg", url: downloadUrls.mac, key: "mac" as const };
    }
    if (platform === "windows") {
      return { label: "Download for Windows", sub: "64-bit installer · .exe", url: downloadUrls.windows, key: "windows" as const };
    }
    return null;
  }, [downloadUrls.mac, downloadUrls.windows, platform]);

  const handleDownload = (key: "mac" | "windows", url: string | null) => {
    trackButtonClick("desktop_download", "desktop_app", { platform: key });
    if (url) {
      window.location.href = url;
      return;
    }

    toast({
      title: "Download not published yet",
      description: `The ${key === "mac" ? "Mac" : "Windows"} installer hasn't been attached to the latest GitHub release yet.`,
      variant: "destructive",
    });
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("sync_waitlist").insert({
        email: email.trim().toLowerCase(),
        platform: platform === "other" ? null : platform,
        user_id: user?.id ?? null,
      });
      if (error && !String(error.message).toLowerCase().includes("duplicate")) {
        throw error;
      }
      setJoined(true);
      toast({ title: "You're on the list!", description: "We'll email you about new releases." });
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
            {DOWNLOADS_AVAILABLE ? "Alpha available" : "Coming soon"}
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight md:text-6xl">
            Tunesfork <span className="text-primary">Sync</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Hit save in Ableton. A new version appears on Tunesfork.
            <br />
            No drag, no zip, no upload modal. It just works.
          </p>

          {/* Download or waitlist */}
          <div className="mx-auto mt-10 max-w-md">
            {DOWNLOADS_AVAILABLE ? (
              <div className="space-y-4">
                {primary ? (
                  <Button
                    size="lg"
                    onClick={() => handleDownload(primary.key, primary.url)}
                    disabled={checkingDownloads || !primary.url}
                    className="w-full h-14 text-base bg-primary hover:bg-primary/90 gap-2"
                  >
                    {checkingDownloads ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                    {checkingDownloads ? "Checking latest release…" : primary.url ? primary.label : "Installer coming soon"}
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    We don't recognize your OS — pick a build below.
                  </p>
                )}

                <div className="flex justify-center gap-3 text-sm">
                  <button
                    onClick={() => handleDownload("mac", downloadUrls.mac)}
                    disabled={checkingDownloads || !downloadUrls.mac}
                    className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 hover:border-primary/50 hover:text-primary transition"
                  >
                    <Apple className="h-4 w-4" /> macOS
                  </button>
                  <button
                    onClick={() => handleDownload("windows", downloadUrls.windows)}
                    disabled={checkingDownloads || !downloadUrls.windows}
                    className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 hover:border-primary/50 hover:text-primary transition"
                  >
                    <Monitor className="h-4 w-4" /> Windows
                  </button>
                </div>

                <div className="font-mono text-xs text-muted-foreground">
                  {DESKTOP_APP_VERSION_LABEL}
                  {primary?.sub && <> · {primary.sub}</>}
                </div>
              </div>
            ) : joined ? (
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
          </div>
        </div>

        {/* Heads-up banner */}
        {DOWNLOADS_AVAILABLE && (
          <div className="mx-auto mt-6 max-w-2xl">
            <div className="rounded-lg border border-yellow-600/40 bg-yellow-100/80 p-4 text-sm text-yellow-900">
              <strong className="text-yellow-950">Heads up:</strong> this alpha build isn't yet
              code-signed, so macOS and Windows will show a security warning on first launch.
              Takes ~30 seconds to bypass — instructions below.
            </div>
          </div>
        )}

        {/* First-launch instructions */}
        {DOWNLOADS_AVAILABLE && (
          <div className="mx-auto mt-6 max-w-2xl">
            <Accordion type="single" collapsible defaultValue="mac">
              <AccordionItem value="mac" className="border-border">
                <AccordionTrigger className="text-sm">
                  <span className="flex items-center gap-2">
                    <Apple className="h-4 w-4" /> macOS — first launch instructions
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground space-y-4">
                  <div>
                    When you double-click the app you'll see <em>"Apple could not verify
                    'Tunesfork Sync' is free of malware"</em>. That's macOS's Gatekeeper blocking
                    unsigned apps — the build is safe, just not yet signed with an Apple Developer
                    ID.
                  </div>

                  <div>
                    <div className="font-semibold text-foreground mb-2">
                      Recommended: System Settings bypass
                    </div>
                    <ol className="list-decimal list-inside space-y-1.5 ml-1">
                      <li>Try to open the app — let macOS show the warning, then click <em>Done</em>.</li>
                      <li>Open <strong className="text-foreground">System Settings → Privacy & Security</strong>.</li>
                      <li>Scroll down. You'll see <em>"Tunesfork Sync was blocked to protect your Mac"</em>.</li>
                      <li>Click <strong className="text-foreground">Open Anyway</strong>, then confirm with your password.</li>
                      <li>The app will launch. You only need to do this once.</li>
                    </ol>
                  </div>

                  <div>
                    <div className="font-semibold text-foreground mb-2">
                      Still stuck? Run this in Terminal:
                    </div>
                    <pre className="rounded-md bg-muted/40 border border-border p-3 text-xs text-foreground overflow-x-auto">
{`xattr -cr /Applications/Tunesfork\\ Sync.app`}
                    </pre>
                    <div className="mt-2 text-xs">
                      This removes the quarantine flag macOS adds to downloaded files. After
                      running it, double-click the app normally.
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="windows" className="border-border">
                <AccordionTrigger className="text-sm">
                  <span className="flex items-center gap-2">
                    <Monitor className="h-4 w-4" /> Windows — first launch instructions
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground space-y-3">
                  <div>
                    SmartScreen will show <em>"Windows protected your PC"</em>. Click{" "}
                    <strong className="text-foreground">More info</strong> →{" "}
                    <strong className="text-foreground">Run anyway</strong>. The build isn't yet
                    signed with an EV certificate, so Windows doesn't recognize it.
                  </div>
                  <div className="text-xs">
                    Code-signing for both platforms is on the roadmap — these warnings will
                    disappear in a future release.
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        )}

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
          <h2 className="text-2xl font-bold">How it works</h2>
          <ol className="mt-6 space-y-4 text-muted-foreground">
            <li className="flex gap-4"><span className="font-mono text-primary">01</span> Download Tunesfork Sync (Mac or Windows).</li>
            <li className="flex gap-4"><span className="font-mono text-primary">02</span> Sign in with one click — same Tunesfork account.</li>
            <li className="flex gap-4"><span className="font-mono text-primary">03</span> Pick the folder where you keep Ableton projects.</li>
            <li className="flex gap-4"><span className="font-mono text-primary">04</span> Make music. Every save = new version on Tunesfork.</li>
          </ol>
        </div>

        {/* Notify-me capture (always available, even when downloads are live) */}
        {DOWNLOADS_AVAILABLE && !joined && (
          <div className="mx-auto mt-20 max-w-md text-center">
            <h3 className="text-lg font-semibold">Get notified about new releases</h3>
            <form onSubmit={handleJoin} className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={submitting} variant="outline">
                {submitting ? "Joining…" : "Notify me"}
              </Button>
            </form>
          </div>
        )}

        {/* Trust */}
        <div className="mt-20 rounded-xl border border-border bg-muted/20 p-6 text-sm text-muted-foreground">
          <Shield className="mb-2 inline h-4 w-4 text-primary" />{" "}
          <strong className="text-foreground">Private by default.</strong> Sync only watches the folders you choose. You can pause or revoke device access from settings at any time.
        </div>
      </main>
    </div>
  );
}
