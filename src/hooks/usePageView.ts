import { useEffect } from "react";
import { trackPageView, type PageName } from "@/lib/analytics";

/**
 * Fires a `Page Viewed` Amplitude event once per mount.
 */
export function usePageView(page_name: PageName, props?: Record<string, unknown>) {
  useEffect(() => {
    trackPageView(page_name, props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page_name]);
}
