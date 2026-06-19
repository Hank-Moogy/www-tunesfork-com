// Centralized desktop-app download config.
// Do not gate downloads on the GitHub releases API in the browser: that
// request can be rate-limited or blocked and previously left production stuck
// on "Checking latest release…". The stable /releases/latest/download URLs
// redirect directly to the current published asset.

export const DESKTOP_APP_VERSION_LABEL = "Latest alpha · unsigned build";

export const REPO_SLUG: string | null = "Hank-Moogy/www-tunesfork-com";

const MAC_ASSET = "Tunesfork-Sync-mac-universal.dmg";
const WIN_ASSET = "Tunesfork-Sync-win-x64.exe";
export const DESKTOP_ASSETS = {
  mac: MAC_ASSET,
  windows: WIN_ASSET,
};

export const PUBLISHED_DESKTOP_ASSETS = {
  mac: true,
  windows: false,
} as const;

export const DOWNLOAD_URLS = {
  mac: REPO_SLUG && PUBLISHED_DESKTOP_ASSETS.mac
    ? `https://github.com/${REPO_SLUG}/releases/latest/download/${MAC_ASSET}`
    : null,
  windows: REPO_SLUG && PUBLISHED_DESKTOP_ASSETS.windows
    ? `https://github.com/${REPO_SLUG}/releases/latest/download/${WIN_ASSET}`
    : null,
};

export type DesktopPlatform = "mac" | "windows" | "other";

export function detectPlatform(): DesktopPlatform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator.platform || "").toLowerCase();
  if (ua.includes("mac") || platform.includes("mac")) return "mac";
  if (ua.includes("win") || platform.includes("win")) return "windows";
  return "other";
}

export const DOWNLOADS_AVAILABLE = Boolean(DOWNLOAD_URLS.mac || DOWNLOAD_URLS.windows);

export type DesktopDownloadUrls = typeof DOWNLOAD_URLS;
