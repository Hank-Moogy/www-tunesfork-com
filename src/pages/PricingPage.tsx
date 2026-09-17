import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { usePageView } from "@/hooks/usePageView";
import { trackSemanticEvent } from "@/lib/analytics";
import RollingPrice from "@/components/pricing/RollingPrice";

type BillingInterval = "monthly" | "yearly";
type Plan = {
  id: "free" | "producer" | "founding_producer" | "studio";
  name: string;
  /** Price per month when billed monthly. */
  monthly: number;
  /** Total charged once per year. */
  yearly: number;
  description: string;
  features: string[];
  featured?: boolean;
};

/**
 * Prices are numbers rather than pre-formatted strings so the yearly plans can
 * be shown as a monthly figure. Comparing "€7.99/month" against "€79/year"
 * asks the reader to do the division; showing both per month makes the saving
 * the obvious fact rather than a hidden one.
 *
 * These are display only — checkout resolves its own lookup key from the plan
 * id and interval, so nothing here can change what is actually charged.
 */
const PLANS: Plan[] = [
  {
    id: "free", name: "Free", monthly: 0, yearly: 0,
    description: "Start a small catalogue.",
    features: ["5 GB storage", "5 projects", "Unlimited version history", "3 collaborators per project"],
  },
  {
    id: "founding_producer", name: "Founding Producer", monthly: 4.99, yearly: 49,
    description: "First 100 producers · year one.", featured: true,
    features: ["100 GB storage", "Unlimited projects and versions", "5 collaborators per project", "Producer price after year one"],
  },
  {
    id: "producer", name: "Producer", monthly: 7.99, yearly: 79,
    description: "For an active production workflow.",
    features: ["100 GB storage", "Unlimited projects", "Unlimited version history", "5 collaborators per project"],
  },
  {
    id: "studio", name: "Studio", monthly: 29, yearly: 290,
    description: "For teams and larger catalogues.",
    features: ["500 GB storage", "Unlimited projects and versions", "Unlimited collaborators", "Shared studio workflow"],
  },
];

/** What a yearly plan works out to per month, and what that saves. */
function pricing(plan: Plan) {
  const perMonth = plan.yearly / 12;
  const fullYear = plan.monthly * 12;
  const saved = fullYear - plan.yearly;
  return {
    perMonth,
    saved,
    percent: fullYear > 0 ? Math.round((saved / fullYear) * 100) : 0,
  };
}

const FOUNDING_PRICES_ENABLED = import.meta.env.VITE_FOUNDING_PRICES_ENABLED !== "false";

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
            <img src="/logo.png" alt="TunesFork" className="tf-mark h-5 w-auto" />
            <span className="text-lg font-bold tracking-tight">TunesFork</span>
          </Link>
          <Button asChild><Link to={user ? "/dashboard" : "/auth"}>{user ? "Dashboard" : "Sign in"}</Link></Button>
        </div>
      </nav>

      <section className="mx-auto max-w-4xl px-4 pb-10 pt-16 text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">Keep every version. Upload only what changed.</h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">All plans include unlimited version history within their storage allowance.</p>
        <div className="mt-8 inline-flex rounded-lg border border-border bg-surface-1 p-1">
          {(["monthly", "yearly"] as BillingInterval[]).map((option) => (
            <button
              key={option}
              onClick={() => setInterval(option)}
              className="relative rounded-md px-5 py-2 text-sm font-medium capitalize transition-colors"
            >
              {/* One element that travels between the two positions, rather
                  than two that swap background. The movement is the feedback. */}
              {interval === option && (
                <motion.span
                  layoutId="billing-knob"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  className="absolute inset-0 rounded-md border border-brand/40 bg-brand/15"
                  style={{ boxShadow: "0 0 20px -4px hsl(var(--brand) / 0.55)" }}
                />
              )}
              <span className={`relative z-10 ${interval === option ? "text-brand" : "text-muted-foreground"}`}>
                {option}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-5 px-4 pb-24 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.filter((plan) => plan.id !== "founding_producer" || FOUNDING_PRICES_ENABLED).map((plan, index) => (
          <motion.div
            key={plan.id}
            // Each card answers the switch a beat after the one before it, so
            // the row reads as one move rather than four simultaneous flickers.
            animate={{ scale: [1, 0.985, 1] }}
            transition={{ duration: 0.42, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="flex"
          >
          <Card className={`relative flex w-full flex-col ${plan.featured ? "border-2 border-primary shadow-lg" : ""}`}>
            {plan.featured && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 gap-1 whitespace-nowrap">
                <Sparkles className="h-3 w-3" /> First 100 accounts
              </Badge>
            )}
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <PriceBlock plan={plan} interval={interval} />
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
          </motion.div>
        ))}
      </section>
    </div>
  );
}

/**
 * Both intervals are quoted per month, so the two are directly comparable and
 * the yearly saving needs no arithmetic from the reader. The amount actually
 * charged is still stated underneath — a monthly headline on a yearly plan
 * would otherwise be a half-truth.
 */
function PriceBlock({ plan, interval }: { plan: Plan; interval: BillingInterval }) {
  const { perMonth, saved, percent } = pricing(plan);
  const yearly = interval === "yearly";
  const shown = yearly ? perMonth : plan.monthly;
  const free = plan.monthly === 0 && plan.yearly === 0;

  return (
    <div className="min-h-[104px]">
      <div className="flex items-baseline gap-1.5">
        <RollingPrice value={shown} className="text-3xl font-bold tabular" />
        {!free && <span className="text-sm text-muted-foreground">/month</span>}
      </div>

      {/* Reserved height: without it the card jolts as this line appears and
          disappears, which undoes the calm the animation is there to create. */}
      <div className="mt-1.5 min-h-[44px]">
        <AnimatePresence mode="wait" initial={false}>
          {free ? (
            <motion.p
              key="free"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-sm text-muted-foreground"
            >
              Free forever.
            </motion.p>
          ) : yearly ? (
            <motion.div
              key="yearly"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.26 }}
              className="space-y-1.5"
            >
              <p className="text-xs text-muted-foreground">
                Billed €{plan.yearly} once a year
              </p>
              <motion.span
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 18, delay: 0.08 }}
                className="tf-lit inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
              >
                Save €{saved.toFixed(2).replace(/\.00$/, "")} · {percent}%
              </motion.span>
            </motion.div>
          ) : (
            <motion.p
              key="monthly"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.26 }}
              className="text-xs text-muted-foreground"
            >
              Billed monthly · switch to yearly to save {percent}%
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
