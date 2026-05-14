import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Check, HelpCircle, Plus } from "lucide-react";
import SubmitPluginDialog from "@/components/SubmitPluginDialog";

interface MatchedPlugin {
  input_name: string;
  catalog_id: string | null;
  catalog_name: string | null;
  developer: string | null;
  type: string | null;
  website_url: string | null;
  logo_url: string | null;
  is_free: boolean | null;
  matched: boolean;
}

interface Props {
  pluginList: string[];
  showSubmit?: boolean;
}

export default function PluginMatchSection({ pluginList, showSubmit = false }: Props) {
  const [results, setResults] = useState<MatchedPlugin[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitName, setSubmitName] = useState("");

  useEffect(() => {
    if (pluginList.length === 0) return;
    const match = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("match_plugins", {
        plugin_names: pluginList as unknown as any,
      });
      if (!error && data && (data as unknown as MatchedPlugin[]).length > 0) {
        setResults(data as unknown as MatchedPlugin[]);
      } else {
        // Fallback: RPC failed or returned nothing — show raw plugin names as unmatched.
        if (error) console.warn("[match_plugins] failed:", error);
        setResults(
          pluginList.map((name) => ({
            input_name: name,
            catalog_id: null,
            catalog_name: null,
            developer: null,
            type: null,
            website_url: null,
            logo_url: null,
            is_free: null,
            matched: false,
          }))
        );
      }
      setLoading(false);
    };
    match();
  }, [pluginList]);

  if (pluginList.length === 0) return null;

  const matched = results.filter((r) => r.matched);
  const unmatched = results.filter((r) => !r.matched);

  if (loading) {
    return (
      <div className="px-4 py-3 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground block mb-2">Plugins</span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
          Matching plugins…
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-b border-border">
      <span className="text-xs font-medium text-muted-foreground block mb-2">
        Plugins ({pluginList.length})
      </span>

      {/* Matched plugins */}
      {matched.length > 0 && (
        <div className="space-y-1 mb-3">
          {matched.map((p) => (
            <div key={p.input_name} className="flex items-center gap-2 group">
              <Check className="h-3 w-3 text-pastel-green shrink-0" />
              <Link
                to={`/plugin/${p.catalog_id}`}
                className="text-xs font-medium hover:underline truncate"
              >
                {p.catalog_name}
              </Link>
              <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
                {p.developer}
              </span>
              {p.is_free && (
                <Badge variant="outline" className="text-[9px] py-0 border-pastel-green/30 text-pastel-green ml-auto shrink-0">
                  Free
                </Badge>
              )}
              {p.website_url && (
                <a
                  href={p.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Unmatched plugins */}
      {unmatched.length > 0 && (
        <div className="space-y-1">
          {matched.length > 0 && (
            <span className="text-[10px] text-muted-foreground font-medium block mt-2 mb-1">Unknown plugins</span>
          )}
          <div className="flex flex-wrap gap-1">
            {unmatched.map((p) => (
              <Badge
                key={p.input_name}
                variant="secondary"
                className="font-mono text-[10px] py-0 gap-1 cursor-default"
              >
                <HelpCircle className="h-2.5 w-2.5 text-muted-foreground" />
                {p.input_name}
                {showSubmit && (
                  <button
                    onClick={() => { setSubmitName(p.input_name); setSubmitOpen(true); }}
                    className="ml-0.5 hover:text-pastel-blue transition-colors"
                    title="Submit plugin info"
                  >
                    <Plus className="h-2.5 w-2.5" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {showSubmit && (
        <SubmitPluginDialog
          open={submitOpen}
          onOpenChange={setSubmitOpen}
          defaultName={submitName}
          onSubmitted={() => {
            // Re-run matching
            supabase.rpc("match_plugins", { plugin_names: JSON.stringify(pluginList) })
              .then(({ data }) => { if (data) setResults(data as unknown as MatchedPlugin[]); });
          }}
        />
      )}
    </div>
  );
}
