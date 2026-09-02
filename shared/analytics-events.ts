export const EVENT_SCHEMA_VERSION = 1 as const;

export const SEMANTIC_EVENT_NAMES = [
  "Product Screen Viewed", "Button Clicked", "Authenticated Session Started",
  "Landing CTA Clicked", "Signup Started", "Signup Completed", "Signin Completed",
  "Desktop Download Started", "Desktop App First Launched",
  "Device Pairing Started", "Device Pairing Completed",
  "Folder Selection Started", "Folder Selection Completed",
  "Project Import Started", "Project Import Completed", "Project Import Failed",
  "Project Save Detected", "Incremental Upload Negotiated",
  "Project Upload Completed", "Project Upload Failed",
  "Project Restore Started", "Project Restore Completed", "Project Restore Failed",
  "Project Share Completed", "Invitation Accepted", "Pricing Plan Selected",
  "Checkout Started", "Checkout Completed", "Subscription Activated",
  "Subscription Cancelled", "Payment Failed", "Storage Warning Reached",
  "Storage Quota Rejected Upload",
] as const;

export type SemanticEventName = typeof SEMANTIC_EVENT_NAMES[number];

export const UPLOAD_EVENT_PROPERTIES = [
  "logical_bytes", "uploaded_bytes", "reused_bytes", "deduplication_percentage",
  "duration_ms", "file_count", "result", "error_code", "app_version", "plan",
] as const;

const SECRET_QUERY_KEYS = new Set([
  "token", "access_token", "refresh_token", "signature", "sig",
  "x-amz-signature", "x-amz-credential", "x-amz-security-token",
]);

export function sanitizeAnalyticsValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (typeof value === "string") {
    if (/^(\/Users\/|[A-Za-z]:\\)/.test(value)) return "[LOCAL_PATH]";
    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        if (url.pathname.includes("/storage/v1/")) url.search = "";
        for (const key of [...url.searchParams.keys()]) {
          if (SECRET_QUERY_KEYS.has(key.toLowerCase())) url.searchParams.set(key, "[REDACTED]");
        }
        return url.toString();
      } catch { return value; }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeAnalyticsValue(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SECRET_QUERY_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : sanitizeAnalyticsValue(item, depth + 1),
    ]));
  }
  return value;
}
