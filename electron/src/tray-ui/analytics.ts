import * as amplitude from "@amplitude/unified";
import { EVENT_SCHEMA_VERSION, sanitizeAnalyticsValue, type SemanticEventName } from "../../../shared/analytics-events";

export type DesktopEventName = SemanticEventName;

type DesktopIdentity = {
  user_id?: string;
  email?: string;
  plan?: string;
  app_surface: "desktop";
  app_version: string;
};
type AnalyticsEvent = { event_properties?: Record<string, unknown>; [key: string]: unknown };

const API_KEY = import.meta.env.VITE_AMPLITUDE_API_KEY;
const SERVER_ZONE = import.meta.env.VITE_AMPLITUDE_SERVER_ZONE === "EU" ? "EU" : "US";
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "0.1.0-alpha.13";
const queue: Array<() => void> = [];
let identity: DesktopIdentity = { app_surface: "desktop", app_version: APP_VERSION };
let ready = false;
let initialization: Promise<void> | null = null;

const enrichmentPlugin = {
  name: "tunesfork-desktop-identity-enrichment",
  type: "enrichment",
  setup: async () => undefined,
  execute: async (event: AnalyticsEvent) => {
    event.event_properties = sanitizeAnalyticsValue({
      ...(event.event_properties ?? {}), ...identity,
    }) as Record<string, unknown>;
    return event;
  },
};

function whenReady(operation: () => void) {
  if (!API_KEY) return;
  if (ready) operation();
  else queue.push(operation);
}

function releaseQueue() {
  ready = true;
  queue.splice(0).forEach((operation) => {
    try { operation(); } catch (error) { console.warn("[analytics] queued operation failed", error); }
  });
}

export function initializeDesktopAnalytics() {
  if (initialization) return initialization;
  if (!API_KEY) {
    console.warn("[analytics] VITE_AMPLITUDE_API_KEY is not configured");
    ready = true;
    initialization = Promise.resolve();
    return initialization;
  }
  try { amplitude.add(enrichmentPlugin as unknown as Parameters<typeof amplitude.add>[0]); }
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
            deadClicks: true, rageClicks: true, errorClicks: true, thrashedCursor: true,
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
          blockSelector: ["input[type='password']", "[data-analytics-secret]"],
          unmaskSelector: ["[data-amp-unmask]"],
        },
      } as unknown as NonNullable<Parameters<typeof amplitude.initAll>[1]>["sessionReplay"],
    }),
    new Promise<void>((resolve) => window.setTimeout(resolve, 3000)),
  ]).then(releaseQueue).catch((error) => {
    console.warn("[analytics] initialization failed", error);
    releaseQueue();
  });

  const flush = () => {
    try { void amplitude.flush(); }
    catch (error) { console.warn("[analytics] flush failed", error); }
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  return initialization;
}

export function trackDesktopEvent(eventName: DesktopEventName, properties: Record<string, unknown> = {}) {
  whenReady(() => amplitude.track(eventName, {
    ...identity, event_schema_version: EVENT_SCHEMA_VERSION, ...properties,
  }));
}

export function identifyDesktopUser(input: {
  userId: string;
  email?: string | null;
  plan?: string | null;
  storageUsedBytes?: number;
  storageLimitBytes?: number | null;
}) {
  const email = input.email?.trim().toLowerCase() || undefined;
  identity = { ...identity, user_id: input.userId, email, plan: input.plan || "free" };
  whenReady(() => {
    amplitude.setUserId(input.userId);
    const identify = new amplitude.Identify();
    if (email) {
      identify.set("email", email);
      identify.set("email_domain", email.split("@")[1] ?? "");
    }
    identify.set("plan", input.plan || "free");
    identify.set("storage_used_bytes", input.storageUsedBytes ?? 0);
    if (input.storageLimitBytes != null) identify.set("storage_limit_bytes", input.storageLimitBytes);
    identify.set("app_surface", "desktop");
    identify.set("app_version", APP_VERSION);
    amplitude.identify(identify);

    const sessionId = amplitude.getSessionId();
    const dedupeKey = `tf_authenticated_session_${input.userId}_${sessionId ?? "unknown"}`;
    if (localStorage.getItem(dedupeKey) !== "1") {
      localStorage.setItem(dedupeKey, "1");
      trackDesktopEvent("Authenticated Session Started", {
        email,
        amplitude_session_id: sessionId,
        device_id: amplitude.getDeviceId(),
        entry_url: window.location.href,
      });
    }
  });
}

export function resetDesktopAnalytics() {
  identity = { app_surface: "desktop", app_version: APP_VERSION };
  whenReady(() => amplitude.reset());
}

export function flushDesktopAnalytics() {
  whenReady(() => { void amplitude.flush(); });
}
