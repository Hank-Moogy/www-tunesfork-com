import { useNavigate } from "react-router-dom";
import { StripeCheckoutRedirect } from "@/components/StripeCheckoutRedirect";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { usePageView } from "@/hooks/usePageView";
import { trackButtonClick } from "@/lib/analytics";

export default function CheckoutPage() {
  usePageView("checkout");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const priceId = searchParams.get("price") || "";

  if (!priceId) {
    navigate("/pricing");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <PaymentTestModeBanner />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Button variant="ghost" className="mb-6" onClick={() => { trackButtonClick("checkout_back_to_pricing", "checkout"); navigate("/pricing"); }}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Pricing
        </Button>
        <StripeCheckoutRedirect priceId={priceId} />
      </div>
    </div>
  );
}
