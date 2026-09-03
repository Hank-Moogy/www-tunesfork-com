import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ code: "AUTH_REQUIRED", error: "Authentication required" }, 401);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: authData } = await admin.auth.getUser(token);
    const userId = authData.user?.id;
    if (!userId) return json({ code: "AUTH_INVALID", error: "Invalid session" }, 401);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "reserve");

    if (action === "reserve") {
      const versionId = String(body.version_id ?? "");
      const size = Number(body.size_bytes);
      const contentType = String(body.content_type ?? "audio/mpeg").slice(0, 120);
      if (!/^[0-9a-f-]{36}$/i.test(versionId) || !Number.isSafeInteger(size) || size < 0) {
        return json({ code: "PREVIEW_REQUEST_INVALID", error: "Invalid preview upload request" }, 400);
      }
      const { data: reservation, error } = await admin.rpc("reserve_audio_preview_upload", {
        _uploader_id: userId,
        _version_id: versionId,
        _size_bytes: size,
      });
      if (error || !reservation?.reservation_id) {
        const message = error?.message ?? "PREVIEW_RESERVATION_FAILED";
        const code = [
          "QUOTA_EXCEEDED",
          "PREVIEW_SIZE_INVALID",
          "PREVIEW_UPLOAD_FORBIDDEN",
          "VERSION_NOT_FOUND",
        ].find((candidate) => message.includes(candidate)) ?? "PREVIEW_RESERVATION_FAILED";
        const status = code === "QUOTA_EXCEEDED" ? 413
          : code === "PREVIEW_UPLOAD_FORBIDDEN" ? 403
          : code === "VERSION_NOT_FOUND" ? 404
          : 400;
        return json({ code, error: message }, status);
      }
      const { data: signed, error: signError } = await admin.storage.from("audio-previews")
        .createSignedUploadUrl(reservation.object_path, { upsert: false });
      if (signError || !signed?.signedUrl) {
        await admin.rpc("cancel_upload_reservation", {
          _reservation_id: reservation.reservation_id,
          _uploader_id: userId,
        });
        throw signError ?? new Error("Could not authorize preview upload");
      }
      return json({
        reservation_id: reservation.reservation_id,
        object_path: reservation.object_path,
        signed_url: signed.signedUrl,
        token: signed.token,
        content_type: contentType,
        usage: reservation.usage,
      });
    }

    if (action === "finalize") {
      const reservationId = String(body.reservation_id ?? "");
      const versionId = String(body.version_id ?? "");
      const { data: reservation } = await admin.from("upload_reservations")
        .select("id,uploader_id,kind,status,object_path,reserved_bytes,expires_at")
        .eq("id", reservationId).eq("uploader_id", userId).maybeSingle();
      if (!reservation || reservation.kind !== "audio_preview" || reservation.status !== "active"
        || new Date(reservation.expires_at).getTime() <= Date.now()) {
        return json({ code: "RESERVATION_EXPIRED", error: "Preview reservation is unavailable" }, 409);
      }
      const slash = reservation.object_path.lastIndexOf("/");
      const folder = reservation.object_path.slice(0, slash);
      const name = reservation.object_path.slice(slash + 1);
      const { data: objects, error: listError } = await admin.storage.from("audio-previews")
        .list(folder, { search: name, limit: 10 });
      if (listError) throw listError;
      const object = objects?.find((candidate) => candidate.name === name);
      const actualSize = Number(object?.metadata?.size ?? -1);
      if (!object || actualSize !== Number(reservation.reserved_bytes)) {
        return json({ code: "BLOB_SIZE_MISMATCH", error: "Uploaded preview size did not match" }, 409);
      }
      const { data: publicData } = admin.storage.from("audio-previews").getPublicUrl(reservation.object_path);
      const { data: usage, error: finalizeError } = await admin.rpc("finalize_audio_preview_upload", {
        _reservation_id: reservationId,
        _uploader_id: userId,
        _version_id: versionId,
        _public_url: publicData.publicUrl,
        _size_bytes: actualSize,
      });
      if (finalizeError) {
        const code = ["RESERVATION_EXPIRED", "VERSION_NOT_FOUND"]
          .find((candidate) => finalizeError.message.includes(candidate)) ?? "PREVIEW_FINALIZATION_FAILED";
        return json({ code, error: finalizeError.message }, code === "VERSION_NOT_FOUND" ? 404 : 409);
      }
      return json({ audio_preview_url: publicData.publicUrl, usage });
    }

    return json({ code: "ACTION_INVALID", error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("[set-version-audio-preview]", error);
    return json({ code: "PREVIEW_UPLOAD_FAILED", error: (error as Error).message }, 500);
  }
});
