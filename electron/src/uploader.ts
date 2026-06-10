// TUS resumable upload to Supabase Storage's project-zips bucket.
// Mirrors the web app's uploadZipResumable in src/components/UploadModal.tsx.
import * as tus from "tus-js-client";
import fs from "node:fs";
import path from "node:path";

const SUPABASE_PROJECT_ID = process.env.TUNESFORK_SUPABASE_PROJECT_ID || "urrxrntdkmmmqqwaihfj";

// We obtain a short-lived storage upload token by exchanging the desktop token for one.
// For M2 alpha, we'll embed the storage anon key (publishable) and rely on RLS-equivalent
// checks performed server-side in create-version-from-desktop. The desktop token authorizes
// the *registration*, the upload itself goes to a user-scoped path.
//
// The cleaner long-term flow: add a `mint-storage-upload-url` edge function that returns
// a one-shot signed upload URL. Tracked as v1.1.

export async function uploadZip(opts: {
  filePath: string;
  userId: string;
  storageAccessToken: string; // Supabase publishable/anon key works for resumable uploads to project-zips
  onProgress?: (pct: number, bytes: number, total: number) => void;
}): Promise<string> {
  const objectPath = `${opts.userId}/${Date.now()}.zip`;
  const fileStream = fs.createReadStream(opts.filePath);
  const fileSize = fs.statSync(opts.filePath).size;

  const endpoint = `https://${SUPABASE_PROJECT_ID}.storage.supabase.co/storage/v1/upload/resumable`;

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(fileStream as never, {
      endpoint,
      uploadSize: fileSize,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${opts.storageAccessToken}` },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 50 * 1024 * 1024,
      metadata: {
        bucketName: "project-zips",
        objectName: objectPath,
        contentType: "application/zip",
        cacheControl: "3600",
      },
      onError: reject,
      onProgress: (bytes, total) => opts.onProgress?.((bytes / total) * 100, bytes, total),
      onSuccess: () => resolve(),
    });
    upload.start();
  });

  return objectPath;
}
