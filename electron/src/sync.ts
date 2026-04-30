// Wires it all together. Called from the tray UI after a folder has been selected.
import { watchFolders } from "./watcher";
import { findProjectFolder } from "./projectFolder";
import { zipProjectFolder } from "./zipper";
import { uploadZip } from "./uploader";
import { createVersion } from "./api";
import { getDeviceToken } from "./auth";
import { getLink, ensureLink } from "./linker";

export function startSync(folders: string[], log: (msg: string) => void) {
  return watchFolders(folders, async (alsPath) => {
    try {
      log(`save detected: ${alsPath}`);
      const projectFolder = findProjectFolder(alsPath);
      if (!projectFolder) return log(`no project folder near ${alsPath}`);

      const link = await ensureLink(projectFolder);
      const token = await getDeviceToken();
      if (!token) return log("not paired — open the tray to sign in");

      log(`zipping ${projectFolder}…`);
      const { zipPath, size } = await zipProjectFolder(projectFolder);

      log(`uploading ${(size / 1e6).toFixed(1)} MB…`);
      const objectPath = await uploadZip({
        filePath: zipPath,
        userId: link.userId,
        storageAccessToken: token.storageToken,
        onProgress: (pct) => log(`upload ${pct.toFixed(0)}%`),
      });

      const result = await createVersion(token.value, {
        project_id: link.projectId,
        project_name: link.projectName,
        zip_storage_path: objectPath,
        file_size_bytes: size,
      });
      log(`✓ uploaded v${result.version_number}`);
    } catch (e) {
      log(`✗ ${(e as Error).message}`);
    }
  });
}
