import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePageView } from "@/hooks/usePageView";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";

type ReturnState = "loading" | "success" | "incomplete" | "error";

export default function CheckoutReturn() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [state, setState] = useState<ReturnState>(sessionId ? "loading" : "error");
  const [lookupKey, setLookupKey] = useState<string | null>(null);
  usePageView("checkout_return", { has_session: !!sessionId });

  useEffect(() => {
    if (!sessionId) return;

    const verify = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("checkout-session-status", {
          body: { sessionId, environment: getStripeEnvironment() },
        });
        if (error) throw error;
        setLookupKey(typeof data?.lookupKey === "string" ? data.lookupKey : null);
        if (data?.ready === true) setState("success");
        else if (data?.status === "open" || data?.status === "expired") setState("incomplete");
        else setState("error");
      } catch {
        setState("error");
      }
    };

    void verify();
  }, [sessionId]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        {state === "loading" && (
          <>
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-primary" />
            <h1 className="mb-2 text-2xl font-bold">Verifying your checkout…</h1>
            <p className="text-muted-foreground">We’re confirming the session directly with Stripe.</p>
          </>
        )}

        {state === "success" && (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-[hsl(var(--pastel-green))]" />
            <h1 className="mb-2 text-2xl font-bold">Subscription confirmed</h1>
            <p className="mb-6 text-muted-foreground">
              Your payment is confirmed and your TunesFork subscription is active.
            </p>
            <Button asChild><Link to="/dashboard">Go to Dashboard</Link></Button>
          </>
        )}

        {state === "incomplete" && (
          <>
            <AlertCircle className="mx-auto mb-4 h-16 w-16 text-amber-500" />
            <h1 className="mb-2 text-2xl font-bold">Checkout wasn’t completed</h1>
            <p className="mb-6 text-muted-foreground">No subscription was activated.</p>
            <Button asChild>
              <Link to={lookupKey ? `/checkout?price=${encodeURIComponent(lookupKey)}` : "/pricing"}>
                Try again
              </Link>
            </Button>
          </>
        )}

        {state === "error" && (
          <>
            <AlertCircle className="mx-auto mb-4 h-16 w-16 text-destructive" />
            <h1 className="mb-2 text-2xl font-bold">We couldn’t verify this checkout</h1>
            <p className="mb-6 text-muted-foreground">
              For your security, an unverified session is never treated as a successful payment.
            </p>
            <Button asChild variant="outline"><Link to="/billing">Check billing status</Link></Button>
          </>
        )}
      </div>
    </div>
  );
}
