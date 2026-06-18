import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import ArrangementTimeline from "@/components/ArrangementTimeline";
import { formatBytes } from "@/lib/als-parser";
import type { Track } from "@/lib/als-parser";
import { Music, Users, Layers, ArrowRight, Sparkles, AlertTriangle, ExternalLink } from "lucide-react";
import PluginMatchSection from "@/components/PluginMatchSection";
import { usePageView } from "@/hooks/usePageView";
import { trackButtonClick } from "@/lib/analytics";
import { getInAppBrowserName, tryOpenInExternalBrowser } from "@/lib/inAppBrowser";

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  usePageView("share");
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [project, setProject] = useState<any>(null);
  const [version, setVersion] = useState<any>(null);
  const [owner, setOwner] = useState<{ display_name: string | null; avatar_url: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const inAppBrowser = useMemo(() => getInAppBrowserName(), []);

  const handleOpenExternal = async () => {
    const result = await tryOpenInExternalBrowser(window.location.href);
    if (result === "copied") {
      toast({
        title: "Link copied",
        description: "Paste it into Chrome or Safari to continue with Google sign-in.",
      });
    } else if (result === "failed") {
      toast({
        title: "Couldn't copy link",
        description: "Tap the menu (⋯) in this app and choose 'Open in browser'.",
        variant: "destructive",
      });
    }
  };

  const goToSignup = (source: string) => {
    trackButtonClick(source, "share_page");
    if (token) {
      try { sessionStorage.setItem("tf_pending_invite", token); } catch {}
    }
    const inviteParam = token ? `?invite=${token}` : "";
    navigate(`/auth${inviteParam}`);
  };

  // Auto-accept the invite if the user is already signed in
  useEffect(() => {
    if (authLoading || !user || !token || accepting) return;
    setAccepting(true);
    (async () => {
      const { data, error } = await supabase.rpc("accept_share_invite", { _token: token });
      if (error) {
        toast({ title: "Couldn't accept invite", description: error.message, variant: "destructive" });
        setAccepting(false);
        return;
      }
      try { sessionStorage.removeItem("tf_pending_invite"); } catch {}
      // Notify project owner that invite was accepted (fire-and-forget)
      try {
        supabase.functions.invoke("notify-invite-accepted", { body: { projectId: data } });
      } catch (e) {
        console.warn("notify-invite-accepted failed", e);
      }
      toast({ title: "Invite accepted", description: "You now have access to this project." });
      navigate(`/project/${data}`, { replace: true });
    })();
  }, [authLoading, user, token, accepting, navigate, toast]);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      const { data: projArr } = await supabase
        .rpc("get_project_by_share_token", { _token: token });

      if (!projArr || projArr.length === 0) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const proj = projArr[0];
      setProject(proj);

      const [{ data: vers }, { data: ownerProfiles }] = await Promise.all([
        supabase.rpc("get_versions_by_share_token", { _token: token }),
        // profiles is RLS-protected and this page is usually viewed signed-out,
        // so the owner's name comes through a token-scoped definer function.
        (supabase as any).rpc("get_share_token_owner_profile", { _token: token }),
      ]);

      if (vers && vers.length > 0) setVersion(vers[0]);
      if (ownerProfiles && ownerProfiles.length > 0) setOwner(ownerProfiles[0]);
      setLoading(false);
    };
    load();
  }, [token]);

  const ownerName = owner?.display_name?.trim() || "A producer";
  const ownerInitials = ownerName.slice(0, 2).toUpperCase();

  const trackList: Track[] = version?.track_list
    ? (version.track_list as unknown as Track[])
    : [];

  const pluginList: string[] = version?.plugin_list
    ? (version.plugin_list as unknown as string[])
    : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Project not found</h1>
        <p className="text-muted-foreground">This share link may have expired or is invalid.</p>
        <Button onClick={() => goToSignup("share_notfound_signup")} className="mt-4 bg-pastel-purple text-white hover:bg-pastel-purple/90">
          Join TunesFork
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Minimal navbar */}
      <header className="border-b border-border bg-white">
        <div className="mx-auto max-w-4xl flex items-center justify-between px-6 h-14">
          <span className="font-bold text-lg tracking-tight">TunesFork</span>
          <Button
            size="sm"
            className="bg-pastel-purple text-white hover:bg-pastel-purple/90 gap-1.5"
            onClick={() => goToSignup("share_nav_signup")}
          >
            Join for free <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* Invite hero */}
        <div className="text-center mb-10">
          <Badge
            variant="outline"
            className="mb-5 border-pastel-purple/30 text-pastel-purple bg-pastel-purple/5 gap-1.5 py-1 px-3"
          >
            <Sparkles className="h-3 w-3" />
            You've been invited to collaborate
          </Badge>

          <div className="flex items-center justify-center gap-3 mb-5">
            <Avatar className="h-12 w-12 ring-2 ring-pastel-purple/20">
              {owner?.avatar_url && <AvatarImage src={owner.avatar_url} alt={ownerName} />}
              <AvatarFallback className="bg-pastel-purple/15 text-pastel-purple font-bold text-sm">
                {ownerInitials}
              </AvatarFallback>
            </Avatar>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <Avatar className="h-12 w-12 ring-2 ring-pastel-blue/20">
              <AvatarFallback className="bg-pastel-blue/15 text-pastel-blue font-bold text-sm">
                {project.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold mb-3 tracking-tight">
            <span className="text-pastel-purple">{ownerName}</span> invited you to collaborate on{" "}
            <span className="text-pastel-blue">{project.name}</span>
          </h1>
          <p className="text-base text-muted-foreground max-w-xl mx-auto mb-5">
            Sign up free to leave comments, upload new versions, and keep this Ableton project in sync with the rest of the team.
          </p>

          {inAppBrowser && (
            <Alert className="mb-5 max-w-xl mx-auto text-left border-pastel-orange/40 bg-pastel-orange/5">
              <AlertTriangle className="h-4 w-4 text-pastel-orange" />
              <AlertTitle className="text-sm">Open this in your browser to sign up with Google</AlertTitle>
              <AlertDescription className="text-xs space-y-2">
                <p>
                  You're viewing this inside {inAppBrowser}'s in-app browser. Google blocks sign-in here.
                  Tap the menu (⋯ or ⋮) at the top of {inAppBrowser} and choose <strong>"Open in Chrome"</strong> or{" "}
                  <strong>"Open in Safari"</strong>. You can still continue with email below.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleOpenExternal}
                  className="h-7 text-xs mt-2"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Copy link to open in browser
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-center gap-3 mb-6">
            <Button
              size="lg"
              className="bg-pastel-purple text-white hover:bg-pastel-purple/90 gap-1.5 px-6"
              onClick={() => goToSignup("share_hero_signup_cta")}
            >
              Sign up to accept invite <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-border"
              onClick={() => goToSignup("share_hero_signin_cta")}
            >
              I already have an account
            </Button>
          </div>

          <div className="flex items-center justify-center gap-2 flex-wrap">
            {project.bpm && (
              <Badge variant="outline" className="font-mono text-xs border-pastel-blue/30 text-pastel-blue">
                {project.bpm} BPM
              </Badge>
            )}
            {pluginList.length > 0 && (
              <Badge variant="outline" className="text-xs border-pastel-purple/30 text-pastel-purple">
                <Layers className="h-3 w-3 mr-1" />
                {pluginList.length} plugins
              </Badge>
            )}
            {version && (
              <Badge variant="outline" className="text-xs font-mono border-border">
                {formatBytes(version.file_size_bytes)}
              </Badge>
            )}
            {trackList.length > 0 && (
              <Badge variant="outline" className="text-xs border-pastel-orange/30 text-pastel-orange">
                <Users className="h-3 w-3 mr-1" />
                {trackList.length} tracks
              </Badge>
            )}
          </div>
        </div>

        {/* Content preview card */}
        <div className="rounded-xl border border-border bg-card/60 overflow-hidden mb-8">
          {/* Audio preview */}
          {version?.audio_preview_url && (
            <div className="border-b border-border px-4 py-3">
              <div className="mb-2 flex items-center gap-2">
                <Music className="h-3.5 w-3.5 text-pastel-purple" />
                <span className="text-xs font-medium text-muted-foreground">Audio preview</span>
              </div>
              <audio controls preload="metadata" className="h-9 w-full" src={version.audio_preview_url} />
            </div>
          )}

          {/* Arrangement timeline */}
          {trackList.length > 0 && (
            <div className="border-b border-border">
              <div className="px-4 py-2.5 flex items-center gap-2">
                <Music className="h-3.5 w-3.5 text-pastel-orange" />
                <span className="text-xs font-medium text-muted-foreground">Arrangement</span>
                <span className="text-[10px] text-muted-foreground font-mono ml-auto">{trackList.length} tracks</span>
              </div>
              <ArrangementTimeline tracks={trackList} />
            </div>
          )}

          {/* Plugins with matching */}
          <PluginMatchSection pluginList={pluginList} />

          {/* Version notes */}
          {version?.change_note && (
            <div className="px-4 py-3">
              <span className="text-xs font-medium text-muted-foreground block mb-1">Latest version notes</span>
              <p className="text-sm text-foreground/80">{version.change_note}</p>
            </div>
          )}

          {/* Empty state if no data */}
          {trackList.length === 0 && pluginList.length === 0 && !version?.change_note && !version?.audio_preview_url && (
            <div className="px-4 py-8 text-center">
              <Music className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Project preview</p>
            </div>
          )}
        </div>

        {/* Bottom CTA */}
        <div className="rounded-xl border border-border bg-gradient-to-br from-pastel-purple/10 via-pastel-blue/5 to-pastel-purple/5 p-8 text-center">
          <h2 className="text-xl font-bold mb-2">Ready to jump in?</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Create a free TunesFork account to accept {ownerName}'s invite and start collaborating on {project.name}.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button
              className="bg-pastel-purple text-white hover:bg-pastel-purple/90 gap-1.5 px-6"
              onClick={() => goToSignup("share_bottom_signup_cta")}
            >
              Sign up for free <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="border-border"
              onClick={() => goToSignup("share_bottom_signin_cta")}
            >
              Sign in
            </Button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16">
        <div className="mx-auto max-w-4xl px-6 py-6 text-center">
          <span className="text-xs text-muted-foreground">
            TunesFork — Version control for music producers
          </span>
        </div>
      </footer>
    </div>
  );
}
