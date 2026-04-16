import { Link } from "react-router-dom";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const PLANS = [
  {
    name: "Free",
    price: "€0",
    period: "forever",
    features: [
      "3 projects",
      "3 historical versions per project",
      "Max 3 collaborators",
      "5 GB storage",
    ],
    highlight: false,
  },
  {
    name: "Basic",
    price: "€7.99",
    period: "/month",
    features: [
      "Unlimited projects",
      "Full version history",
      "Up to 5 collaborators",
      "50 GB storage",
    ],
    highlight: false,
  },
  {
    name: "Studio",
    price: "€29",
    period: "/month",
    features: [
      "500 GB storage",
      "Unlimited collaborators",
      "Permissions & roles",
    ],
    highlight: false,
  },
  {
    name: "Launch Offer",
    price: "€15",
    period: "one-time",
    badge: "Best Offer",
    urgency: "Only 50 spots!",
    features: [
      "Lifetime access to Basic plan",
      "Early access to new features",
      "Unlimited projects",
      "Full version history",
      "Up to 5 collaborators",
      "50 GB storage",
    ],
    highlight: true,
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="TunesFork" className="h-8 w-auto" />
            <span className="text-lg font-bold tracking-tight">TunesFork</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
            <Button asChild>
              <Link to="/auth?tab=signup">Get Started</Link>
            </Button>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {PLANS.map((plan) => (
            <Card
              key={plan.name}
              className={`relative flex flex-col ${
                plan.highlight
                  ? "border-[hsl(var(--pastel-green))] border-2 shadow-md scale-[1.02]"
                  : ""
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-[hsl(var(--pastel-green))] text-white border-0 gap-1 px-3 py-1">
                    <Sparkles className="h-3 w-3" />
                    {plan.badge}
                  </Badge>
                </div>
              )}
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <div className="mt-2">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="text-sm text-muted-foreground ml-1">
                    {plan.period}
                  </span>
                </div>
                {plan.urgency && (
                  <CardDescription className="text-[hsl(var(--pastel-green))] font-medium mt-1">
                    {plan.urgency}
                  </CardDescription>
                )}
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
                <Button disabled className="w-full" variant={plan.highlight ? "default" : "outline"}>
                  Coming Soon
                </Button>
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
