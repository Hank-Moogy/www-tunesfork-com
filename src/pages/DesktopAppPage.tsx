import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Apple, ArrowRight, Download } from "lucide-react";
import Navbar from "@/components/Navbar";
import SyncDevice from "@/components/sync-device/SyncDevice";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { flushAnalytics, trackButtonClick, trackSemanticEvent } from "@/lib/analytics";
import {
  DESKTOP_APP_VERSION_LABEL,
  DOWNLOAD_URLS,
  fetchDesktopAppVersionLabel,
} from "@/lib/desktopDownload";

export default function DesktopAppPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const isWelcome = params.get("welcome") === "1";
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
  const [versionLabel, setVersionLabel] = useState(DESKTOP_APP_VERSION_LABEL);

  // ?side=1 puts the device beside the copy instead of under it, so the two
  // arrangements can be compared before either is committed to.
  const side =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("side") === "1";

  useEffect(() => {
    let active = true;
    void fetchDesktopAppVersionLabel().then((label) => {
      if (active && label) setVersionLabel(label);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isWelcome || !user) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setWelcomeName(data?.display_name ?? null));
  }, [isWelcome, user]);

  const downloadMac = async () => {
    trackButtonClick("desktop_download", "desktop_app", { platform: "mac" });
    trackSemanticEvent("Desktop Download Started", { platform: "mac", version: DESKTOP_APP_VERSION_LABEL });
    await flushAnalytics();
    if (DOWNLOAD_URLS.mac) window.location.href = DOWNLOAD_URLS.mac;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className={`mx-auto px-6 py-14 lg:py-20 ${side ? "max-w-6xl" : "max-w-4xl"}`}>
        <div className={side ? "grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16" : ""}>
        <section className={`min-w-0 ${side ? "text-center lg:text-left" : "text-center"}`}>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
            <Apple className="h-3.5 w-3.5" />
            macOS only · Apple Silicon + Intel
          </div>

          <h1 className={`mt-7 max-w-3xl text-4xl font-bold tracking-tight md:text-6xl ${side ? "" : "mx-auto"}`}>
            {isWelcome ? (
              <>Welcome{welcomeName ? `, ${welcomeName}` : ""}. Install Tunesfork Sync.</>
            ) : (
              <>Auto back-up.<br /><span className="text-primary">Every session, every save.</span></>
            )}
          </h1>

          <p className={`mt-5 max-w-xl text-base text-muted-foreground md:text-lg ${side ? "" : "mx-auto"}`}>
            Tunesfork automatically backs up all your sessions to the cloud, in the
            background, while you keep working.
          </p>

          <div className={`mt-9 max-w-xl ${side ? "" : "mx-auto"}`}>
            <Button
              size="lg"
              onClick={downloadMac}
              disabled={!DOWNLOAD_URLS.mac}
              className="h-auto min-h-20 w-full whitespace-normal rounded-2xl bg-primary px-5 py-4 text-base font-semibold leading-snug shadow-[0_18px_50px_-18px_hsl(var(--primary)/0.8)] transition hover:-translate-y-0.5 hover:bg-primary/90 sm:text-lg md:text-xl"
            >
              <Download className="mr-2 h-6 w-6" />
              Download Tunesfork Sync for Mac
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <p className="mt-3 font-mono text-xs text-muted-foreground">
              {versionLabel} · Universal macOS DMG
            </p>
          </div>

          <div className={`mt-8 flex max-w-xl flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground ${side ? "justify-center lg:justify-start" : "mx-auto justify-center"}`}>
            <span>1. Install</span>
            <span>2. Pair your account</span>
            <span>3. Choose your Ableton folder</span>
          </div>
        </section>

        {/* The app itself, drifting. The page asks someone to install a thing
            they have never seen; showing it is worth more than another
            paragraph about it. Beside the copy it reads as the subject of the
            sentence; beneath it, as evidence after the argument. */}
        <section
          className={
            side
              ? "relative flex min-w-0 justify-center pb-4 lg:justify-end"
              : "relative mx-auto mt-24 flex max-w-md justify-center pb-16"
          }
          aria-hidden="true"
        >
          {/* Light behind the object, as everywhere else in the product. */}
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(60% 45% at 50% 42%, hsl(var(--brand) / 0.12), transparent 70%)",
              filter: "blur(30px)",
            }}
          />
          <SyncDevice float track className={side ? "w-full max-w-[300px]" : "w-full max-w-[330px]"} />
        </section>
        </div>

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
