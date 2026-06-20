import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Apple, ArrowRight, Download, ShieldAlert } from "lucide-react";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { trackButtonClick } from "@/lib/analytics";
import {
  DESKTOP_APP_VERSION_LABEL,
  DOWNLOAD_URLS,
} from "@/lib/desktopDownload";

export default function DesktopAppPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const isWelcome = params.get("welcome") === "1";
  const [welcomeName, setWelcomeName] = useState<string | null>(null);

  useEffect(() => {
    if (!isWelcome || !user) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setWelcomeName(data?.display_name ?? null));
  }, [isWelcome, user]);

  const downloadMac = () => {
    trackButtonClick("desktop_download", "desktop_app", { platform: "mac" });
    if (DOWNLOAD_URLS.mac) window.location.href = DOWNLOAD_URLS.mac;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="mx-auto max-w-4xl px-6 py-14 lg:py-20">
        <section className="text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
            <Apple className="h-3.5 w-3.5" />
            macOS only · Apple Silicon + Intel
          </div>

          <h1 className="mx-auto mt-7 max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
            {isWelcome ? (
              <>Welcome{welcomeName ? `, ${welcomeName}` : ""}. Install Tunesfork Sync.</>
            ) : (
              <>Save in Ableton.<br /><span className="text-primary">Tunesfork keeps the versions.</span></>
            )}
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
            A lightweight menu-bar app that watches the Ableton folders you choose
            and uploads a new snapshot whenever you save.
          </p>

          <div className="mx-auto mt-9 max-w-xl">
            <Button
              size="lg"
              onClick={downloadMac}
              disabled={!DOWNLOAD_URLS.mac}
              className="h-20 w-full rounded-2xl bg-primary text-lg font-semibold shadow-[0_18px_50px_-18px_hsl(var(--primary)/0.8)] transition hover:-translate-y-0.5 hover:bg-primary/90 md:text-xl"
            >
              <Download className="mr-2 h-6 w-6" />
              Download Tunesfork Sync for Mac
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <p className="mt-3 font-mono text-xs text-muted-foreground">
              {DESKTOP_APP_VERSION_LABEL} · Universal macOS DMG
            </p>
          </div>

          <div className="mx-auto mt-8 flex max-w-xl flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span>1. Install</span>
            <span>2. Pair your account</span>
            <span>3. Choose your Ableton folder</span>
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-2xl overflow-hidden rounded-2xl border border-amber-500/30 bg-amber-500/[0.06]">
          <div className="flex gap-4 border-b border-amber-500/20 p-6">
            <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-amber-400" />
            <div>
              <h2 className="text-lg font-semibold">macOS may block the first launch</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                This alpha is not Apple-notarized yet. The warning is expected and
                only needs to be bypassed once.
              </p>
            </div>
          </div>

          <div className="space-y-6 p-6">
            <ol className="space-y-4 text-sm text-muted-foreground">
              {[
                <>Move <strong className="text-foreground">Tunesfork Sync</strong> into Applications and try to open it.</>,
                <>When Apple shows the warning, click <strong className="text-foreground">Done</strong>.</>,
                <>Open <strong className="text-foreground">System Settings → Privacy & Security</strong>.</>,
                <>Scroll down, click <strong className="text-foreground">Open Anyway</strong>, then confirm.</>,
              ].map((step, index) => (
                <li key={index} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 font-mono text-xs text-amber-300">
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>

            <div className="rounded-xl border border-border bg-background/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Still blocked? Run once in Terminal
              </p>
              <code className="mt-3 block overflow-x-auto rounded-lg bg-black/40 p-3 text-sm text-foreground">
                xattr -cr /Applications/Tunesfork\ Sync.app
              </code>
            </div>
          </div>
        </section>

        {isWelcome && (
          <div className="mt-10 text-center">
            <Link
              to="/dashboard"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => trackButtonClick("welcome_skip_install", "desktop_app")}
            >
              I’ll install it later — go to my dashboard
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
