import { Link, useNavigate } from "react-router-dom";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const LAUNCH_OFFER = {
  name: "Launch Offer",
  price: "€15",
  period: "one-time",
  badge: "Best Offer",
  urgency: "Only 50 spots!",
  priceId: "launch_offer_once",
  features: [
    "Lifetime access to Basic plan",
    "Early access to new features",
    "Unlimited projects",
    "Full version history",
    "Up to 5 collaborators",
    "50 GB storage",
  ],
};

const PLANS = [
  {
    name: "Free",
    price: "€0",
    period: "forever",
    priceId: null,
    features: [
      "3 projects",
      "3 historical versions per project",
      "Max 3 collaborators",
      "5 GB storage",
    ],
  },
  {
    name: "Basic",
    price: "€7.99",
    period: "/month",
    priceId: "basic_monthly",
    features: [
      "Unlimited projects",
      "Full version history",
      "Up to 5 collaborators",
      "50 GB storage",
    ],
  },
  {
    name: "Studio",
    price: "€29",
    period: "/month",
    priceId: "studio_monthly",
    features: [
      "500 GB storage",
      "Unlimited collaborators",
      "Permissions & roles",
    ],
  },
];

function useLaunchOfferCount() {
  const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN;
  const env = clientToken?.startsWith('pk_test_') ? 'sandbox' : 'live';
  
  return useQuery({
    queryKey: ['launch-offer-count', env],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('count_launch_purchases', { check_env: env });
      if (error) throw error;
      return data as number;
    },
    refetchInterval: 30000,
  });
}

export default function PricingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: launchCount = 0 } = useLaunchOfferCount();
  const spotsLeft = Math.max(0, 50 - launchCount);
  const soldOut = spotsLeft === 0;

  const handleCheckout = (priceId: string) => {
    if (!user) {
      navigate(`/auth?tab=signup&redirect=/checkout?price=${priceId}`);
      return;
    }
    navigate(`/checkout?price=${priceId}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <PaymentTestModeBanner />
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="TunesFork" className="h-8 w-auto" />
            <span className="text-lg font-bold tracking-tight">TunesFork</span>
          </Link>
          <div className="flex items-center gap-3">
            {user ? (
              <Button asChild>
                <Link to="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link to="/auth">Sign In</Link>
                </Button>
                <Button asChild>
                  <Link to="/auth?tab=signup">Get Started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="mx-auto max-w-6xl px-4 pt-20 pb-12 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          Choose the plan that fits your workflow. Upgrade anytime.
        </p>
      </section>

      {/* Plans grid */}
      <section className="mx-auto max-w-6xl px-4 pb-24">
        {/* Launch Offer - Featured */}
        <Card className="relative flex flex-col sm:flex-row border-[hsl(var(--pastel-green))] border-2 shadow-md max-w-3xl mx-auto mb-10">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <Badge className="bg-[hsl(var(--pastel-green))] text-white border-0 gap-1 px-3 py-1">
              <Sparkles className="h-3 w-3" />
              {LAUNCH_OFFER.badge}
            </Badge>
          </div>
          <CardHeader className="pb-4 sm:pb-0 sm:flex-1">
            <CardTitle className="text-2xl">{LAUNCH_OFFER.name}</CardTitle>
            <div className="mt-2">
              <span className="text-4xl font-bold">{LAUNCH_OFFER.price}</span>
              <span className="text-sm text-muted-foreground ml-1">{LAUNCH_OFFER.period}</span>
            </div>
            <CardDescription className="text-[hsl(var(--pastel-green))] font-medium mt-1">
              {soldOut ? "Sold out!" : `${spotsLeft} spots left!`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-1 pt-0 sm:pt-6">
            <ul className="space-y-2 mb-6">
              {LAUNCH_OFFER.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--pastel-green))]" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button
              className="w-full"
              disabled={soldOut}
              onClick={() => handleCheckout(LAUNCH_OFFER.priceId)}
            >
              {soldOut ? "Sold Out" : "Get Launch Offer"}
            </Button>
          </CardContent>
        </Card>

        {/* Standard plans */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <Card key={plan.name} className="relative flex flex-col">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <div className="mt-2">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="text-sm text-muted-foreground ml-1">{plan.period}</span>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-1">
                <ul className="space-y-3 flex-1 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--pastel-green))]" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {plan.priceId ? (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => handleCheckout(plan.priceId!)}
                  >
                    Subscribe
                  </Button>
                ) : (
                  <Button className="w-full" variant="outline" asChild>
                    <Link to="/auth?tab=signup">Get Started Free</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="TunesFork" className="h-5 w-auto" />
            <span>© {new Date().getFullYear()} TunesFork</span>
          </div>
          <div className="flex gap-6">
            <Link to="/auth" className="hover:text-foreground transition-colors">Sign In</Link>
            <Link to="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
