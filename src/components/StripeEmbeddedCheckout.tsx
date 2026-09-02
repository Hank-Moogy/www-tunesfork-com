import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";
import { trackSemanticEvent } from "@/lib/analytics";

interface StripeEmbeddedCheckoutProps {
  priceId: string;
  quantity?: number;
}

export function StripeEmbeddedCheckout({
  priceId,
  quantity,
}: StripeEmbeddedCheckoutProps) {
  const fetchClientSecret = async (): Promise<string> => {
    trackSemanticEvent("Checkout Started", { price_id: priceId, quantity: quantity ?? 1 });
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: { priceId },
    });
    if (error || !data?.clientSecret) {
      throw new Error(error?.message || data?.error || "Failed to create checkout session");
    }
    return data.clientSecret;
  };

  return (
    <div id="checkout">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
