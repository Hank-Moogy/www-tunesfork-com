import { isStripeSandbox } from "@/lib/stripe";

export function PaymentTestModeBanner() {
  if (!isStripeSandbox()) return null;

  return (
    <div className="w-full border-b border-status-pending/25 bg-status-pending/10 px-4 py-2 text-center text-sm text-status-pending">
      All payments made in the preview are in test mode.{" "}
      <a
        href="https://docs.stripe.com/testing"
        target="_blank"
        rel="noopener noreferrer"
        className="underline font-medium"
      >
        Read more
      </a>
    </div>
  );
}
