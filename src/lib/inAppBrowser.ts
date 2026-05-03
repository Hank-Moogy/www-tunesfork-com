// Detects in-app browsers (WhatsApp, Instagram, Facebook/Messenger, LinkedIn, etc.)
// Google blocks OAuth inside these embedded webviews via its `disallowed_useragent` policy.

export type InAppBrowserName =
  | "Facebook"
  | "Messenger"
  | "Instagram"
  | "WhatsApp"
  | "LinkedIn"
  | "Snapchat"
  | "TikTok"
  | "Line"
  | "WeChat"
  | "Twitter"
  | "In-app browser";

export function getInAppBrowserName(): InAppBrowserName | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";

  if (/FBAN|FBAV|FB_IAB/i.test(ua)) {
    return /Messenger/i.test(ua) ? "Messenger" : "Facebook";
  }
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/WhatsApp/i.test(ua)) return "WhatsApp";
  if (/LinkedInApp/i.test(ua)) return "LinkedIn";
  if (/Snapchat/i.test(ua)) return "Snapchat";
  if (/TikTok|musical_ly|Bytedance/i.test(ua)) return "TikTok";
  if (/Line\//i.test(ua)) return "Line";
  if (/MicroMessenger/i.test(ua)) return "WeChat";
  if (/Twitter/i.test(ua)) return "Twitter";

  // Generic Android WebView
  if (/Android/.test(ua) && /; wv\)/.test(ua)) return "In-app browser";

  // iOS WKWebView (no Safari token while on iOS) — skip real Chrome/Firefox/Edge on iOS
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const hasSafariToken = /Safari\//.test(ua);
  const isRealIOSBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  if (isIOS && !hasSafariToken && !isRealIOSBrowser) return "In-app browser";

  return null;
}

export function isInAppBrowser(): boolean {
  return getInAppBrowserName() !== null;
}

// Best-effort attempt to escape the in-app browser. There's no reliable cross-platform way.
// On Android we can try an `intent://` URL. On iOS we fall back to copying the URL.
export async function tryOpenInExternalBrowser(url: string): Promise<"opened" | "copied" | "failed"> {
  if (typeof window === "undefined") return "failed";
  const ua = navigator.userAgent || "";
  const isAndroid = /Android/.test(ua);

  if (isAndroid) {
    try {
      const stripped = url.replace(/^https?:\/\//, "");
      const intent = `intent://${stripped}#Intent;scheme=https;package=com.android.chrome;end`;
      window.location.href = intent;
      return "opened";
    } catch {
      // fall through to copy
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
