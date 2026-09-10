import * as amplitude from "@amplitude/unified";
import { getUtmProps } from "./utm";
import { EVENT_SCHEMA_VERSION, sanitizeAnalyticsValue, type SemanticEventName } from "../../shared/analytics-events";
export type { SemanticEventName } from "../../shared/analytics-events";

export type PageName =
  | "landing" | "landing_gitsound" | "auth" | "onboarding" | "dashboard"
  | "project" | "share" | "pricing" | "checkout" | "checkout_return" | "billing"
  | "plugin" | "admin" | "not_found";

type IdentityContext = {
  user_id?: string;
  email?: string;
  plan?: string;
  app_surface: "web" | "desktop";
  app_version: string;
};
type AnalyticsEvent = { event_properties?: Record<string, unknown>; [key: string]: unknown };

const API_KEY = import.meta.env.VITE_AMPLITUDE_API_KEY;
const SERVER_ZONE = import.meta.env.VITE_AMPLITUDE_SERVER_ZONE === "EU" ? "EU" : "US";
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "web";
const pending: Array<() => void> = [];
let initialized = false;
let initialization: Promise<void> | null = null;
let lifecycleBound = false;
let identity: IdentityContext = { app_surface: "web", app_version: APP_VERSION };

const identityEnrichmentPlugin = {
  name: "tunesfork-identity-enrichment",
  type: "enrichment",
  setup: async () => undefined,
  execute: async (event: AnalyticsEvent) => {
    event.event_properties = sanitizeAnalyticsValue({
      ...(event.event_properties ?? {}), ...identity,
    }) as Record<string, unknown>;
    return event;
  },
};

function runWhenReady(operation: () => void) {
  if (!API_KEY) return;
  if (initialized) operation();
  else pending.push(operation);
}

function flushPending() {
  initialized = true;
  pending.splice(0).forEach((operation) => {
    try { operation(); } catch (error) { console.warn("[analytics] queued operation failed", error); }
  });
}

export function initializeAnalytics(): Promise<void> {
  if (initialization) return initialization;
  if (!API_KEY) {
    console.warn("[analytics] VITE_AMPLITUDE_API_KEY is not configured");
    initialized = true;
    initialization = Promise.resolve();
    return initialization;
  }
  try { amplitude.add(identityEnrichmentPlugin as unknown as Parameters<typeof amplitude.add>[0]); }
  catch (error) { console.warn("[analytics] enrichment plugin unavailable", error); }
  initialization = Promise.race([
    amplitude.initAll(API_KEY, {
      serverZone: SERVER_ZONE,
      analytics: {
        appVersion: APP_VERSION,
        autocapture: {
          attribution: true,
          fileDownloads: true,
          formInteractions: true,
          pageViews: true,
          sessions: true,
          elementInteractions: true,
          frustrationInteractions: {
            deadClicks: true,
            rageClicks: true,
            errorClicks: true,
            thrashedCursor: true,
          },
          networkTracking: {
            ignoreAmplitudeRequests: true,
            captureRules: [{
              hosts: ["*"], methods: ["*"], statusCodeRange: "100-599",
              requestHeaders: false, responseHeaders: false,
            }],
          },
          webVitals: true,
          performanceTracking: { mainThreadBlock: true },
          pageUrlEnrichment: true,
        },
        trackingOptions: { ipAddress: true, language: true, platform: true },
      },
      sessionReplay: {
        sampleRate: 1,
        forceSessionTracking: true,
        useWebWorker: true,
        enableUrlChangePolling: true,
        urlChangePollingInterval: 1000,
        captureDocumentTitle: true,
        shouldInlineStylesheet: true,
        performanceConfig: { enabled: true },
        privacyConfig: {
          defaultMaskLevel: "light",
          blockSelector: ["input[type='password']", "[data-analytics-secret]", "[data-stripe]", "[href*='/invite/']"],
          unmaskSelector: ["[data-amp-unmask]"],
        },
      } as unknown as NonNullable<Parameters<typeof amplitude.initAll>[1]>["sessionReplay"],
    }),
    new Promise<void>((resolve) => window.setTimeout(resolve, 3000)),
  ]).then(() => {
    flushPending();
    if (!lifecycleBound) {
      lifecycleBound = true;
      const flush = () => {
        try { void amplitude.flush(); }
        catch (error) { console.warn("[analytics] flush failed", error); }
      };
      window.addEventListener("pagehide", flush);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flush();
      });
    }
  }).catch((error) => {
    console.warn("[analytics] initialization failed", error);
    flushPending();
  });
  return initialization;
}

export function trackSemanticEvent(eventName: SemanticEventName, properties: Record<string, unknown> = {}) {
  runWhenReady(() => amplitude.track(eventName, {
    ...getUtmProps(), ...identity, event_schema_version: EVENT_SCHEMA_VERSION, ...properties,
  }));
}

export function trackPageView(page_name: PageName, props?: Record<string, unknown>) {
  trackSemanticEvent("Product Screen Viewed", { page_name, ...(props ?? {}) });
}

export function trackButtonClick(button_name: string, location: string, props?: Record<string, unknown>) {
  trackSemanticEvent("Button Clicked", { button_name, location, ...(props ?? {}) });
}

export function trackSignupCompleted(method: "email" | "google", props?: Record<string, unknown>) {
  trackSemanticEvent("Signup Completed", { method, ...(props ?? {}) });
}

export function trackSigninCompleted(method: "email" | "google", props?: Record<string, unknown>) {
  trackSemanticEvent("Signin Completed", { method, ...(props ?? {}) });
}

export function trackShareCompleted(props: { project_id: string; share_method: "copy_link" | "email_invite" }) {
  trackSemanticEvent("Project Share Completed", props);
}

export function trackUploadCompleted(props: { project_id: string; version_number: number; file_size_bytes?: number }) {
  trackSemanticEvent("Project Upload Completed", props);
}

export function identifyUser(
  userId: string | null,
  email?: string | null,
  properties: Record<string, unknown> = {},
) {
  if (!userId) return;
  const normalizedEmail = email?.trim().toLowerCase() || undefined;
  identity = {
    ...identity,
    user_id: userId,
    email: normalizedEmail,
    plan: typeof properties.plan === "string" ? properties.plan : identity.plan,
  };
  runWhenReady(() => {
    amplitude.setUserId(userId);
    const identify = new amplitude.Identify();
    if (normalizedEmail) {
      identify.set("email", normalizedEmail);
      identify.set("email_domain", normalizedEmail.split("@")[1] ?? "");
    }
    for (const [key, value] of Object.entries({
      ...properties,
      app_surface: "web",
      app_version: APP_VERSION,
      ...getUtmProps(),
    })) {
      if (value !== undefined && value !== null) identify.set(key, value as never);
    }
    amplitude.identify(identify);

    const sessionId = amplitude.getSessionId();
    const deviceId = amplitude.getDeviceId();
    const dedupeKey = `tf_authenticated_session_${userId}_${sessionId ?? "unknown"}`;
    if (localStorage.getItem(dedupeKey) !== "1") {
      localStorage.setItem(dedupeKey, "1");
      trackSemanticEvent("Authenticated Session Started", {
        email: normalizedEmail,
        amplitude_session_id: sessionId,
        device_id: deviceId,
        entry_url: window.location.href,
        referrer: document.referrer,
      });
    }
  });
}

export function resetAnalyticsIdentity() {
  identity = { app_surface: "web", app_version: APP_VERSION };
  runWhenReady(() => amplitude.reset());
}

export function flushAnalytics() {
  runWhenReady(() => { void amplitude.flush(); });
}
