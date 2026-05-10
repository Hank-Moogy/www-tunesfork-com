// Centralized desktop-app download config.
// Update REPO_SLUG once the GitHub repo exists. Until then, the page shows
// a "coming soon" state instead of broken links.

export const DESKTOP_APP_VERSION = "0.1.0-alpha.5.1";
export const DESKTOP_APP_VERSION_LABEL = "v0.1.0 alpha.5.1 · unsigned build";

export const REPO_SLUG: string | null = "Hank-Moogy/www-tunesfork-com";

const MAC_ASSET = "Tunesfork-Sync-mac-universal.dmg";
const WIN_ASSET = "Tunesfork-Sync-win-x64.exe";
export const DESKTOP_ASSETS = {
  mac: MAC_ASSET,
  windows: WIN_ASSET,
};

export const GITHUB_LATEST_RELEASE_API = REPO_SLUG
  ? `https://api.github.com/repos/${REPO_SLUG}/releases/latest`
  : null;

export const DOWNLOAD_URLS = {
  mac: REPO_SLUG
    ? `https://github.com/${REPO_SLUG}/releases/latest/download/${MAC_ASSET}`
    : null,
  windows: REPO_SLUG
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

export const DOWNLOADS_AVAILABLE = REPO_SLUG !== null;

export type DesktopDownloadUrls = typeof DOWNLOAD_URLS;
