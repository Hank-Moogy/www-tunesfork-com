// Stub. Real impl uses keytar (Mac Keychain / Windows Credential Manager).
// Returns the paired device token + a storage upload token (for now we'll use the
// Supabase publishable anon key embedded in the binary — see uploader.ts comments).
import keytar from "keytar";

const SERVICE = "tunesfork-sync";
const ACCOUNT = "device-token";

// Public anon key — safe to embed in a desktop binary, same as web app.
const STORAGE_PUBLIC_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprenVwdmpxeWx0dnhyZ2l4cnB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMzE2MzYsImV4cCI6MjA5MDcwNzYzNn0.FmwkI4ludX6GtR_ViQpa4hFXe5jOpka3w94Y9aIYwK0";

export async function setDeviceToken(token: string) {
  await keytar.setPassword(SERVICE, ACCOUNT, token);
}

export async function getDeviceToken(): Promise<{ value: string; storageToken: string } | null> {
  const v = await keytar.getPassword(SERVICE, ACCOUNT);
  if (!v) return null;
  return { value: v, storageToken: STORAGE_PUBLIC_KEY };
}

export async function clearDeviceToken() {
  await keytar.deletePassword(SERVICE, ACCOUNT);
}
