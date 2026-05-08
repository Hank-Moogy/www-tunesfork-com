import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type Status = "loading" | "valid" | "already" | "invalid" | "submitting" | "done" | "error";

export default function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<Status>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`, {
          headers: { apikey: SUPABASE_KEY },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json?.error ?? "Invalid link");
          setStatus("invalid");
          return;
        }
        if (json?.alreadyUnsubscribed || json?.already_unsubscribed) {
          setEmail(json.email ?? null);
          setStatus("already");
        } else {
          setEmail(json.email ?? null);
          setStatus("valid");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
        setStatus("error");
      }
    })();
  }, [token]);

  const confirm = async () => {
    setStatus("submitting");
    const { error } = await supabase.functions.invoke("handle-email-unsubscribe", { body: { token } });
    if (error) { setError(error.message); setStatus("error"); return; }
    setStatus("done");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full bg-card border border-border rounded-lg p-8 text-center">
        <h1 className="text-2xl font-bold mb-4 text-foreground">Email preferences</h1>
        {status === "loading" && <Loader2 className="h-6 w-6 animate-spin mx-auto" />}
        {status === "invalid" && <p className="text-muted-foreground">{error ?? "This link is invalid or expired."}</p>}
        {status === "error" && <p className="text-destructive">{error ?? "Something went wrong."}</p>}
        {status === "already" && (
          <p className="text-muted-foreground">{email ?? "Your email"} is already unsubscribed.</p>
        )}
        {(status === "valid" || status === "submitting") && (
          <>
            <p className="text-muted-foreground mb-6">
              Unsubscribe {email ? <strong className="text-foreground">{email}</strong> : "this address"} from TunesFork notification emails?
            </p>
            <Button onClick={confirm} disabled={status === "submitting"}>
              {status === "submitting" ? "Unsubscribing..." : "Confirm unsubscribe"}
            </Button>
          </>
        )}
        {status === "done" && (
          <p className="text-foreground">You've been unsubscribed. You may still receive essential account emails (security, billing).</p>
        )}
      </div>
    </div>
  );
}
