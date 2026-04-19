import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ExternalLink, Music } from "lucide-react";
import { usePageView } from "@/hooks/usePageView";

interface PluginEntry {
  id: string;
  name: string;
  developer: string;
  type: string;
  website_url: string;
  is_free: boolean;
  logo_url: string | null;
}

export default function PluginPage() {
  const { id } = useParams<{ id: string }>();
  usePageView("plugin", { plugin_id: id });
  const navigate = useNavigate();
  const [plugin, setPlugin] = useState<PluginEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("plugin_catalog")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        setPlugin(data as unknown as PluginEntry | null);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!plugin) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <h1 className="text-xl font-bold">Plugin not found</h1>
          <Button variant="outline" onClick={() => navigate(-1)}>Go back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Button variant="ghost" size="sm" className="mb-6 gap-1 text-muted-foreground" onClick={() => navigate(-1)}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>

        <div className="rounded-xl border border-border bg-card/60 p-8 text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-pastel-purple/10 mb-4">
            <Music className="h-8 w-8 text-pastel-purple" />
          </div>

          <h1 className="text-2xl font-bold mb-1">{plugin.name}</h1>
          <p className="text-muted-foreground text-sm mb-4">{plugin.developer}</p>

          <div className="flex items-center justify-center gap-2 mb-6">
            <Badge variant="outline" className="text-xs">{plugin.type}</Badge>
            {plugin.is_free && (
              <Badge variant="outline" className="text-xs border-pastel-green/30 text-pastel-green">Free</Badge>
            )}
          </div>

          {plugin.website_url && (
            <a href={plugin.website_url} target="_blank" rel="noopener noreferrer">
              <Button className="gap-2 bg-pastel-blue text-white hover:bg-pastel-blue/90">
                <ExternalLink className="h-4 w-4" /> Get Plugin
              </Button>
            </a>
          )}
        </div>
      </main>
    </div>
  );
}
