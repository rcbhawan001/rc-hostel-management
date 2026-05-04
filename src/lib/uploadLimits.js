/** Must match server multer `fileSize` (see `server/src/middleware/upload.js`). */
export const MAX_CLIENT_UPLOAD_BYTES = 1024 * 1024;

export function maxClientUploadLabel() {
  return "1 MB";
}

export function assertClientUploadSize(file) {
  if (!file || typeof file.size !== "number") return true;
  return file.size <= MAX_CLIENT_UPLOAD_BYTES;
}
