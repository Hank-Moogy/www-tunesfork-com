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

export function trackSignupCompleted(method: "email" | "google", props?: Record<string, unknown>) {
  try {
    amplitude.track("Signup Completed", { method, ...getUtmProps(), ...(props ?? {}) });
  } catch (e) {
    console.warn("[analytics] trackSignupCompleted failed", e);
  }
}

export function trackSigninCompleted(method: "email" | "google", props?: Record<string, unknown>) {
  try {
    amplitude.track("Signin Completed", { method, ...getUtmProps(), ...(props ?? {}) });
  } catch (e) {
    console.warn("[analytics] trackSigninCompleted failed", e);
  }
}

export function trackShareCompleted(props: {
  project_id: string;
  share_method: "copy_link" | "email_invite";
}) {
  try {
    amplitude.track("Share Completed", { ...props, ...getUtmProps() });
  } catch (e) {
    console.warn("[analytics] trackShareCompleted failed", e);
  }
}

export function trackUploadCompleted(props: {
  project_id: string;
  version_number: number;
  file_size_bytes?: number;
}) {
  try {
    amplitude.track("Upload Completed", { ...props, ...getUtmProps() });
  } catch (e) {
    console.warn("[analytics] trackUploadCompleted failed", e);
  }
}

export function identifyUser(userId: string | null, email?: string | null) {
  try {
    if (userId) {
      amplitude.setUserId(userId);
      if (email) {
        const identifyObj = new amplitude.Identify();
        identifyObj.set("email", email);
        amplitude.identify(identifyObj);
      }
    } else {
      amplitude.reset();
    }
  } catch (e) {
    console.warn("[analytics] identifyUser failed", e);
  }
}
