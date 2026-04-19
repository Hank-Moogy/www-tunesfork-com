import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trackButtonClick } from "@/lib/analytics";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  onSubmitted?: () => void;
}

export default function SubmitPluginDialog({ open, onOpenChange, defaultName, onSubmitted }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(defaultName);
  const [developer, setDeveloper] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Sync defaultName when it changes
  if (open && name !== defaultName && !name) setName(defaultName);

  const handleSubmit = async () => {
    if (!name.trim() || !user) return;
    trackButtonClick("plugin_submit", "submit_plugin_dialog");
    setSubmitting(true);

    // Normalize: lowercase, strip special chars
    const normalized = name.trim().toLowerCase().replace(/\s*v?\d+(\.\d+)*\s*$/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase();

    const { error } = await supabase.from("plugin_catalog").insert({
      name: name.trim(),
      developer: developer.trim(),
      website_url: websiteUrl.trim(),
      normalized_name: normalized,
      status: "pending",
      submitted_by: user.id,
    });

    if (error) {
      if (error.code === "23505") {
        toast({ title: "Plugin already exists", description: "This plugin is already in the catalog." });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    } else {
      toast({ title: "Plugin submitted!", description: "It will appear after review." });
      onSubmitted?.();
      onOpenChange(false);
      setName("");
      setDeveloper("");
      setWebsiteUrl("");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle>Submit Plugin Info</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">Plugin name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-secondary border-border text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Developer</label>
            <Input value={developer} onChange={(e) => setDeveloper(e.target.value)} placeholder="e.g. FabFilter" className="bg-secondary border-border text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Website URL</label>
            <Input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://..." className="bg-secondary border-border text-sm" />
          </div>
          <Button
            className="w-full bg-pastel-blue/15 text-pastel-blue border border-pastel-blue/25 hover:bg-pastel-blue/25"
            variant="outline"
            onClick={handleSubmit}
            disabled={!name.trim() || submitting}
          >
            {submitting ? "Submitting…" : "Submit for review"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
