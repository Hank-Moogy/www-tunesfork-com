import { useEffect, useState } from "react";
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
  const [deviceName, setDeviceName] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      navigate(`/auth?redirect=${encodeURIComponent(`/desktop-pair?code=${code}`)}`);
    }
  }, [loading, user, code, navigate]);

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

  const confirm = async () => {
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
          body: JSON.stringify({ code, device_name: deviceName || undefined }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Pairing failed");
      setState("done");
    } catch (e: any) {
      setError(e.message);
      setState("error");
    }
  };

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

          {state !== "done" && (
            <>
              <p className="text-sm text-muted-foreground">
                Confirm this code matches the one shown in your desktop app.
              </p>

              <input
                type="text"
                placeholder="Name this device (optional)"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                className="mt-6 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                maxLength={80}
              />

              <Button
                onClick={confirm}
                disabled={state === "confirming"}
                className="mt-4 w-full bg-primary"
              >
                {state === "confirming" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Pairing…</> : "Confirm pairing"}
              </Button>

              {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
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
