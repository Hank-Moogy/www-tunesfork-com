import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment, isTrustedStripeCheckoutUrl } from "@/lib/stripe";
import { Button } from "@/components/ui/button";

interface StripeCheckoutRedirectProps {
  priceId: string;
}

export function StripeCheckoutRedirect({ priceId }: StripeCheckoutRedirectProps) {
  const requestId = useRef(crypto.randomUUID());
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [existingSubscription, setExistingSubscription] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const redirect = async () => {
      try {
        const { data, error: invokeError } = await supabase.functions.invoke("create-managed-checkout", {
          body: {
            priceId,
            checkoutRequestId: requestId.current,
            environment: getStripeEnvironment(),
          },
        });
        if (invokeError || !isTrustedStripeCheckoutUrl(data?.url)) {
          if (data?.code === "subscription_exists") setExistingSubscription(true);
          throw new Error(data?.error || invokeError?.message || "Unable to start checkout");
        }
        window.location.assign(data.url);
      } catch (checkoutError) {
        setError(checkoutError instanceof Error ? checkoutError.message : "Unable to start checkout");
      }
    };

    void redirect();
  }, [priceId]);

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
        <h2 className="mb-2 text-lg font-semibold">Checkout could not start</h2>
        <p className="mb-5 text-sm text-muted-foreground">{error}</p>
        <Button asChild>
          <Link to={existingSubscription ? "/billing" : "/pricing"}>
            {existingSubscription ? "Manage billing" : "Back to pricing"}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="py-20 text-center">
      <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-primary" />
      <h2 className="text-lg font-semibold">Opening secure checkout…</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        You’ll continue on Stripe’s hosted checkout, where Stripe acts as merchant of record.
      </p>
    </div>
  );
}
