import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePageView } from "@/hooks/usePageView";
import { supabase } from "@/integrations/supabase/client";
import { trackSemanticEvent } from "@/lib/analytics";

type Verification = { verified: boolean; plan?: string; error?: string };

export default function CheckoutReturn() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [result, setResult] = useState<Verification | null>(null);
  usePageView("checkout_return", { has_session: !!sessionId });

  useEffect(() => {
    if (!sessionId) {
      setResult({ verified: false, error: "No checkout session was returned." });
      return;
    }
    let cancelled = false;
    supabase.functions.invoke("verify-checkout-session", { body: { sessionId } }).then(({ data, error }) => {
      if (cancelled) return;
      const verified = !error && data?.verified === true;
      setResult({ verified, plan: data?.plan, error: verified ? undefined : error?.message || data?.error || "Payment is still processing." });
      if (verified) trackSemanticEvent("Checkout Completed", { plan: data?.plan, verification: "server" });
    });
    return () => { cancelled = true; };
  }, [sessionId]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        {!result ? (
          <>
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-primary" />
            <h1 className="mb-2 text-2xl font-bold">Verifying your subscription…</h1>
            <p className="text-muted-foreground">This usually takes only a moment.</p>
          </>
        ) : result.verified ? (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-primary" />
            <h1 className="mb-2 text-2xl font-bold">Subscription active</h1>
            <p className="mb-6 text-muted-foreground">Your verified {result.plan?.replaceAll("_", " ") || "paid"} plan is ready.</p>
            <Button asChild><Link to="/dashboard">Go to Dashboard</Link></Button>
          </>
        ) : (
          <>
            <XCircle className="mx-auto mb-4 h-16 w-16 text-destructive" />
            <h1 className="mb-2 text-2xl font-bold">We could not verify the upgrade</h1>
            <p className="mb-6 text-muted-foreground">{result.error}</p>
            <div className="flex justify-center gap-3">
              <Button asChild variant="outline"><Link to="/pricing">Back to Pricing</Link></Button>
              <Button asChild><Link to="/profile">Check account</Link></Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
