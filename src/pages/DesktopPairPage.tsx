import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Loader2, Monitor } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export default function DesktopPairPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const code = (params.get("code") ?? "").toUpperCase();
  const [state, setState] = useState<"idle" | "confirming" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const confirm = useCallback(async () => {
    if (!user || !code || state === "confirming" || state === "done") return;
    setState("confirming");
    setError(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/pair-device-confirm`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({ code }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Pairing failed");
      setState("done");
    } catch (e: any) {
      setError(e.message);
      setState("error");
    }
  }, [code, state, user]);

  useEffect(() => {
    if (!loading && !user) {
      navigate(`/auth?redirect=${encodeURIComponent(`/desktop-pair?code=${code}`)}`);
    }
  }, [loading, user, code, navigate]);

  useEffect(() => {
    if (!loading && user && code && state === "idle") confirm();
  }, [loading, user, code, state, confirm]);

  if (!code) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="text-2xl font-bold">No pairing code</h1>
          <p className="mt-2 text-muted-foreground">
            Open Tunesfork Sync and click <em>Pair</em> to start.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-md px-6 py-20">
        <div className="rounded-2xl border border-border bg-card/50 p-8 text-center">
          <Monitor className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-4 text-2xl font-bold">Pair Tunesfork Sync</h1>

          <div className="my-6 inline-block rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 px-6 py-3 font-mono text-2xl tracking-[0.4em] text-primary">
            {code}
          </div>

          {(state === "idle" || state === "confirming") && (
            <div className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Connecting your account to Tunesfork Sync…
            </div>
          )}

          {state === "error" && (
            <>
              <p className="mt-3 text-sm text-destructive">{error}</p>
              <Button onClick={confirm} className="mt-4 w-full bg-primary">
                Try again
              </Button>
            </>
          )}

          {state === "done" && (
            <div className="space-y-3 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
              <p className="text-foreground font-medium">Paired!</p>
              <p className="text-sm text-muted-foreground">
                Return to Tunesfork Sync — it should be signed in within a few seconds.
              </p>
              <Button variant="outline" onClick={() => navigate("/dashboard")} className="mt-4">
                Back to dashboard
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
