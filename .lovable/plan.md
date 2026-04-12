

## Add Zip Upload Support to Upload Modal

### What changes
Update the upload modal's Step 1 to accept both folder selection and direct `.zip` file uploads. When a zip is uploaded, extract and validate its contents client-side using JSZip, then skip re-zipping during upload.

### Steps

1. **Update Step 1 UI copy** — Change the drag area text to "Drop your Ableton project folder or .zip here", add "Supports folders and .zip files" helper text.

2. **Add zip detection in `handleFolderSelect`** — If the dropped/selected input is a single `.zip` file, read it with JSZip, extract the file list, and run the same `validateFolder` logic on the extracted entries.

3. **Store a flag for pre-zipped uploads** — Add a `preZippedBlob` state. When a zip is uploaded directly, store the blob so we skip the zipping step during upload.

4. **Update `handleUpload`** — If `preZippedBlob` exists, use it directly instead of re-zipping the folder contents.

5. **Add a secondary file input** — Add a small "or select a .zip file" link below the folder drop zone that opens a standard file picker filtered to `.zip`.

### Files modified
- `src/components/UploadModal.tsx` — All changes in this single file

