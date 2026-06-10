// Talks to Tunesfork edge functions.
// In production these point at the deployed Supabase Functions endpoint.
const FUNCTIONS_URL = process.env.TUNESFORK_FUNCTIONS_URL
  || "https://urrxrntdkmmmqqwaihfj.supabase.co/functions/v1";

export type PairInit = { code: string; pair_url: string; expires_in_seconds: number };
export type PollResp =
  | { status: "pending" | "expired" | "not_found" | "already_delivered" }
  | { status: "confirmed"; token: string; device_name: string; user_id: string };

export async function pairInit(deviceName: string): Promise<PairInit> {
  const r = await fetch(`${FUNCTIONS_URL}/pair-device-init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_name: deviceName }),
  });
  if (!r.ok) throw new Error(`pair-init failed: ${r.status}`);
  return r.json();
}

export async function pairPoll(code: string): Promise<PollResp> {
  const r = await fetch(`${FUNCTIONS_URL}/pair-device-poll?code=${encodeURIComponent(code)}`);
  return r.json();
}

export type CreateVersionInput = {
  project_id?: string;
  project_name?: string;
  bpm?: number;
  change_note?: string;
  zip_storage_path: string;
  file_size_bytes: number;
  plugin_list?: unknown;
  track_list?: unknown;
};

export async function createVersion(token: string, input: CreateVersionInput) {
  const r = await fetch(`${FUNCTIONS_URL}/create-version-from-desktop`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(`createVersion failed: ${r.status} ${err.error ?? ""}`);
  }
  return r.json() as Promise<{ project_id: string; version_id: string; version_number: number }>;
}
