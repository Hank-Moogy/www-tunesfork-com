import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { usePageView } from "@/hooks/usePageView";
import { trackSemanticEvent } from "@/lib/analytics";

type BillingInterval = "monthly" | "yearly";
type Plan = {
  id: "free" | "producer" | "founding_producer" | "studio";
  name: string;
  monthly: string;
  yearly: string;
  description: string;
  features: string[];
  featured?: boolean;
};

const PLANS: Plan[] = [
  {
    id: "free", name: "Free", monthly: "€0", yearly: "€0",
    description: "Start a small catalogue.",
    features: ["5 GB storage", "5 projects", "Unlimited version history", "3 collaborators per project"],
  },
  {
    id: "founding_producer", name: "Founding Producer", monthly: "€4.99", yearly: "€49",
    description: "First 100 producers · year one.", featured: true,
    features: ["100 GB storage", "Unlimited projects and versions", "5 collaborators per project", "Producer price after year one"],
  },
  {
    id: "producer", name: "Producer", monthly: "€7.99", yearly: "€79",
    description: "For an active production workflow.",
    features: ["100 GB storage", "Unlimited projects", "Unlimited version history", "5 collaborators per project"],
  },
  {
    id: "studio", name: "Studio", monthly: "€29", yearly: "€290",
    description: "For teams and larger catalogues.",
    features: ["500 GB storage", "Unlimited projects and versions", "Unlimited collaborators", "Shared studio workflow"],
  },
];

export default function PricingPage() {
  usePageView("pricing");
  const { user } = useAuth();
  const navigate = useNavigate();
  const [interval, setInterval] = useState<BillingInterval>("yearly");

  const selectPlan = (plan: Plan) => {
    trackSemanticEvent("Pricing Plan Selected", { plan: plan.id, billing_interval: interval });
    if (plan.id === "free") {
      navigate(user ? "/dashboard" : "/auth?tab=signup");
      return;
    }
    const checkout = `/checkout?price=${encodeURIComponent(`${plan.id}_${interval}`)}`;
    navigate(user ? checkout : `/auth?tab=signup&redirect=${encodeURIComponent(checkout)}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="TunesFork" className="h-5 w-auto" />
            <span className="text-lg font-bold tracking-tight">TunesFork</span>
          </Link>
          <Button asChild><Link to={user ? "/dashboard" : "/auth"}>{user ? "Dashboard" : "Sign in"}</Link></Button>
        </div>
      </nav>

      <section className="mx-auto max-w-4xl px-4 pb-10 pt-16 text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">Keep every version. Upload only what changed.</h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">All plans include unlimited version history within their storage allowance.</p>
        <div className="mt-8 inline-flex rounded-lg border border-border bg-muted p-1">
          {(["monthly", "yearly"] as BillingInterval[]).map((option) => (
            <button
              key={option}
              className={`rounded-md px-5 py-2 text-sm font-medium capitalize ${interval === option ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              onClick={() => setInterval(option)}
            >
              {option}{option === "yearly" ? " · save more" : ""}
            </button>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-5 px-4 pb-24 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((plan) => (
          <Card key={plan.id} className={`relative flex flex-col ${plan.featured ? "border-2 border-primary shadow-lg" : ""}`}>
            {plan.featured && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 gap-1 whitespace-nowrap">
                <Sparkles className="h-3 w-3" /> First 100 accounts
              </Badge>
            )}
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <div><span className="text-3xl font-bold">{interval === "monthly" ? plan.monthly : plan.yearly}</span><span className="text-sm text-muted-foreground">/{interval === "monthly" ? "month" : "year"}</span></div>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <ul className="mb-7 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{feature}</span></li>
                ))}
              </ul>
              <Button className="w-full" variant={plan.featured ? "default" : "outline"} onClick={() => selectPlan(plan)}>
                {plan.id === "free" ? "Start free" : `Choose ${plan.name}`}
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
