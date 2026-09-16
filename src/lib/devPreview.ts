/**
 * Dev-only preview fixtures.
 *
 * The onboarding steps after setup happen on the dashboard and on a project
 * page, both of which need real data that a reviewer will not have. Rather
 * than build a separate mock screen — which would drift from the real one and
 * quietly stop representing it — preview mode injects fixtures into the actual
 * pages, so what you review is the shipping component.
 *
 * Everything here is gated on import.meta.env.DEV and disappears from
 * production builds.
 */

const PREVIEW_PARAM = import.meta.env.DEV ? "tf_preview" : "";

export function isDevPreview(search: string): boolean {
  if (!import.meta.env.DEV) return false;
  return new URLSearchParams(search).get(PREVIEW_PARAM) === "1";
}

export const PREVIEW_PROJECT_ID = import.meta.env.DEV ? "tf-preview-project" : "";

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();

export const previewProjects = import.meta.env.DEV ? [
  { id: PREVIEW_PROJECT_ID, name: "Breakbeat 909", bpm: 174, archived: false,
    handoff_status: "ready", owner_id: "preview", share_token: null,
    handoff_locked_by: null, created_at: daysAgo(40), updated_at: daysAgo(0) },
  { id: "tf-preview-2", name: "Midnight Pad", bpm: 96, archived: false,
    handoff_status: "in_progress", owner_id: "preview", share_token: null,
    handoff_locked_by: null, created_at: daysAgo(22), updated_at: daysAgo(2) },
  { id: "tf-preview-3", name: "Rust Garden", bpm: 132, archived: false,
    handoff_status: "in_progress", owner_id: "preview", share_token: null,
    handoff_locked_by: null, created_at: daysAgo(9), updated_at: daysAgo(5) },
] : [];

export const previewVersion = import.meta.env.DEV ? {
  id: "tf-preview-version",
  project_id: PREVIEW_PROJECT_ID,
  version_number: 1,
  is_main_version: true,
  change_note: "First save captured by Sync",
  file_size_bytes: 48_211_904,
  created_at: daysAgo(0),
  ableton_version: "12.1",
  audio_preview_url: null,
} : null;

export const previewHeatmap = import.meta.env.DEV ? Array.from({ length: 190 }, (_, i) => {
  const d = new Date(now.getTime() - (189 - i) * 86400000);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const burst = Math.sin(i / 17) > 0.4;
  return { d: iso, c: burst ? (i % 9) : i % 3 === 0 ? 1 : 0 };
}) : [];

/** Pre-built preview routes, so no call site has to inline the dev query
 *  string in a runtime branch where rollup cannot fold it away. */
export const previewDashboardPath = import.meta.env.DEV ? "/dashboard?tf_preview=1" : "";
export const previewSharePath = import.meta.env.DEV
  ? `/project/${PREVIEW_PROJECT_ID}?onboard=share&tf_preview=1`
  : "";
