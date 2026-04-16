import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CheckoutReturn() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        {sessionId ? (
          <>
            <CheckCircle2 className="h-16 w-16 text-[hsl(var(--pastel-green))] mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Payment successful!</h1>
            <p className="text-muted-foreground mb-6">
              Thank you for your purchase. Your account has been upgraded.
            </p>
            <Button asChild>
              <Link to="/dashboard">Go to Dashboard</Link>
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-2">No session found</h1>
            <p className="text-muted-foreground mb-6">
              It looks like something went wrong. Please try again.
            </p>
            <Button asChild variant="outline">
              <Link to="/pricing">Back to Pricing</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
