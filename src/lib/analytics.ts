import * as amplitude from "@amplitude/unified";
import { getUtmProps } from "./utm";

/**
 * Centralized Amplitude event tracking.
 * Convention: "Object Action" past-tense event names (e.g. "Page Viewed", "Button Clicked").
 */

export type PageName =
  | "landing"
  | "landing_gitsound"
  | "auth"
  | "onboarding"
  | "dashboard"
  | "project"
  | "share"
  | "pricing"
  | "checkout"
  | "checkout_return"
  | "plugin"
  | "admin"
  | "not_found";

export function trackPageView(page_name: PageName, props?: Record<string, unknown>) {
  try {
    amplitude.track("Page Viewed", { page_name, ...getUtmProps(), ...(props ?? {}) });
  } catch (e) {
    console.warn("[analytics] trackPageView failed", e);
  }
}

export function trackButtonClick(
  button_name: string,
  location: string,
  props?: Record<string, unknown>
) {
  try {
    amplitude.track("Button Clicked", {
      button_name,
      location,
      ...getUtmProps(),
      ...(props ?? {}),
    });
  } catch (e) {
    console.warn("[analytics] trackButtonClick failed", e);
  }
}

export function identifyUser(userId: string | null) {
  try {
    if (userId) {
      amplitude.setUserId(userId);
    } else {
      amplitude.reset();
    }
  } catch (e) {
    console.warn("[analytics] identifyUser failed", e);
  }
}
