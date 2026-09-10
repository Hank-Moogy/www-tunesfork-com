// Centralized desktop-app download config.
// Downloads never depend on the GitHub API: the stable /releases/latest/download
// URLs redirect directly to the current published asset. The API is only used
// as a progressive enhancement for the version copy, with a generic fallback.

export const DESKTOP_APP_VERSION_LABEL = "Latest public build";

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

type GitHubReleasePayload = {
  tag_name?: unknown;
  name?: unknown;
};

export function desktopReleaseLabelFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const { tag_name: tagName, name } = payload as GitHubReleasePayload;
  if (typeof tagName !== "string" || !/^v[0-9A-Za-z][0-9A-Za-z._-]*$/.test(tagName)) return null;

  const isUnsigned = typeof name === "string" && name.toLowerCase().includes("unsigned");
  return isUnsigned ? `${tagName} · unsigned build` : tagName;
}

export async function fetchDesktopAppVersionLabel(): Promise<string | null> {
  if (!REPO_SLUG) return null;
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO_SLUG}/releases/latest`, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return null;
    return desktopReleaseLabelFromPayload(await response.json());
  } catch {
    return null;
  }
}
