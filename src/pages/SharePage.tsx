import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import ArrangementTimeline from "@/components/ArrangementTimeline";
import { formatBytes } from "@/lib/als-parser";
import type { Track } from "@/lib/als-parser";
import { Music, Users, Layers, ArrowRight } from "lucide-react";
import PluginMatchSection from "@/components/PluginMatchSection";
import { usePageView } from "@/hooks/usePageView";
import { trackButtonClick } from "@/lib/analytics";

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  usePageView("share");
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [version, setVersion] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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

      const { data: vers } = await supabase
        .rpc("get_versions_by_share_token", { _token: token });

      if (vers && vers.length > 0) setVersion(vers[0]);
      setLoading(false);
    };
    load();
  }, [token]);

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
        <Button onClick={() => navigate("/auth")} className="mt-4 bg-pastel-blue text-white hover:bg-pastel-blue/90">
          Join TunesFork
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Minimal navbar */}
      <header className="border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl flex items-center justify-between px-6 h-14">
          <span className="font-bold text-lg tracking-tight">TunesFork</span>
          <Button
            size="sm"
            className="bg-pastel-green text-white hover:bg-pastel-green/90 gap-1.5"
            onClick={() => {
              trackButtonClick("share_nav_signup", "share_nav");
              navigate("/auth");
            }}
          >
            Join for free <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* Project hero */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-pastel-purple/15 text-pastel-purple font-bold text-sm">
                {project.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
          <h1 className="text-3xl font-bold mb-2">{project.name}</h1>
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
            <Badge variant="outline" className="text-xs border-pastel-orange/30 text-pastel-orange">
              <Users className="h-3 w-3 mr-1" />
              Shared with you
            </Badge>
          </div>
        </div>

        {/* Content preview card */}
        <div className="rounded-xl border border-border bg-card/60 overflow-hidden mb-8">
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
          {trackList.length === 0 && pluginList.length === 0 && !version?.change_note && (
            <div className="px-4 py-8 text-center">
              <Music className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Project preview</p>
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="rounded-xl border border-border bg-gradient-to-br from-pastel-blue/5 via-pastel-purple/5 to-pastel-green/5 p-8 text-center">
          <h2 className="text-xl font-bold mb-2">Want to collaborate?</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Join TunesFork to collaborate on this project, leave comments, upload new versions, and manage your Ableton projects with your team.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button
              className="bg-pastel-green text-white hover:bg-pastel-green/90 gap-1.5 px-6"
              onClick={() => { trackButtonClick("share_signup_cta", "share_cta"); navigate("/auth"); }}
            >
              Sign up for free <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="border-pastel-blue/30 text-pastel-blue hover:bg-pastel-blue/10"
              onClick={() => { trackButtonClick("share_signin_cta", "share_cta"); navigate("/auth"); }}
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
