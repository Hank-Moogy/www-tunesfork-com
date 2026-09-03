import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CreditCard, Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import PageContainer from "@/components/PageContainer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { usePageView } from "@/hooks/usePageView";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { getStripeEnvironment, isTrustedStripeBillingPortalUrl } from "@/lib/stripe";

type Subscription = Tables<"subscriptions">;

const planNames: Record<string, string> = {
  producer_monthly: "Producer — monthly",
  producer_yearly: "Producer — yearly",
  founding_producer_monthly: "Founding Producer — monthly",
  founding_producer_yearly: "Founding Producer — yearly",
  studio_monthly: "Studio — monthly",
  studio_yearly: "Studio — yearly",
};

export default function BillingPage() {
  usePageView("billing");
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const { data, error: queryError } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("user_id", user.id)
          .eq("environment", getStripeEnvironment())
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (queryError) throw queryError;
        setSubscription(data);
      } catch {
        setError("Unable to load billing status.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user]);

  const openPortal = async () => {
    setPortalLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("create-portal-session", {
        body: { environment: getStripeEnvironment() },
      });
      if (invokeError || !isTrustedStripeBillingPortalUrl(data?.url)) {
        throw new Error("Unable to open the billing portal");
      }
      window.location.assign(data.url);
    } catch {
      setError("Unable to open the billing portal. Please try again.");
      setPortalLoading(false);
    }
  };

  const renewalDate = subscription?.current_period_end
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date(subscription.current_period_end))
    : null;
  const paymentNeedsAttention = subscription?.status === "past_due" || subscription?.status === "unpaid";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <PageContainer className="max-w-3xl py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
          <p className="mt-2 text-muted-foreground">Manage your plan, invoices, payment method, and cancellation.</p>
        </div>

        {paymentNeedsAttention && (
          <Alert className="mb-6 border-amber-300 bg-amber-50 text-amber-950">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Payment needs attention</AlertTitle>
            <AlertDescription>
              Open the billing portal to update your payment method. Stripe’s retry schedule remains active.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" /> Subscription</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            ) : subscription ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{planNames[subscription.price_id] || "TunesFork subscription"}</p>
                    {renewalDate && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {subscription.cancel_at_period_end ? `Access ends ${renewalDate}` : `Renews ${renewalDate}`}
                      </p>
                    )}
                  </div>
                  <Badge variant={paymentNeedsAttention ? "destructive" : "secondary"}>
                    {subscription.cancel_at_period_end ? "Canceling" : subscription.status.replaceAll("_", " ")}
                  </Badge>
                </div>
                <Button onClick={openPortal} disabled={portalLoading}>
                  {portalLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Manage billing in Stripe
                </Button>
                <p className="text-xs text-muted-foreground">
                  Plan changes, invoices, payment methods, and cancellation are handled securely by Stripe.
                </p>
              </div>
            ) : (
              <div>
                <p className="mb-4 text-muted-foreground">You don’t have a paid subscription yet.</p>
                <Button asChild><Link to="/pricing">View plans</Link></Button>
              </div>
            )}
          </CardContent>
        </Card>
      </PageContainer>
    </div>
  );
}
