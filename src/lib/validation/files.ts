// File-upload validation. The browser's reported MIME type is untrusted, so
// the first bytes of the file are checked against the expected signature.
// Supabase Storage enforces the same size limit and MIME allow-list on the
// bucket, and the documents table has CHECK constraints, so a bypass of this
// layer is still rejected twice more.

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_TYPES = {
  "application/pdf": { label: "PDF", ext: ["pdf"] },
  "image/png": { label: "PNG image", ext: ["png"] },
  "image/jpeg": { label: "JPEG image", ext: ["jpg", "jpeg"] },
  "text/plain": { label: "Text", ext: ["txt"] },
  "text/csv": { label: "CSV", ext: ["csv"] },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { label: "Word", ext: ["docx"] },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { label: "Excel", ext: ["xlsx"] },
} as const;

export type AllowedMime = keyof typeof ALLOWED_TYPES;

export const ACCEPT_ATTRIBUTE = Object.values(ALLOWED_TYPES)
  .flatMap((t) => t.ext.map((e) => `.${e}`))
  .join(",");

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((b, i) => bytes[i] === b);

/** Infers the MIME type from the file name, then confirms it with the content. */
export function detectMime(fileName: string, head: Uint8Array): AllowedMime | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const byExt = (Object.keys(ALLOWED_TYPES) as AllowedMime[]).find((m) =>
    (ALLOWED_TYPES[m].ext as readonly string[]).includes(ext),
  );
  if (!byExt) return null;

  switch (byExt) {
    case "application/pdf":
      return startsWith(head, [0x25, 0x50, 0x44, 0x46]) ? byExt : null; // %PDF
    case "image/png":
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ? byExt : null;
    case "image/jpeg":
      return startsWith(head, [0xff, 0xd8, 0xff]) ? byExt : null;
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return startsWith(head, [0x50, 0x4b, 0x03, 0x04]) ? byExt : null; // ZIP container
    case "text/plain":
    case "text/csv":
      // Text files must not contain NUL bytes (a cheap binary-content check).
      return head.includes(0) ? null : byExt;
  }
}

/** Keeps a readable display name; the storage key never uses it. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKC")
    .replace(/[/\\]/g, "-")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return (cleaned || "file").slice(-200);
}

export type FileCheck =
  | { ok: true; mime: AllowedMime; name: string; size: number }
  | { ok: false; message: string };

export async function checkUpload(file: File | null): Promise<FileCheck> {
  if (!file || file.size === 0) return { ok: false, message: "Choose a file to upload." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: "Files must be 5 MB or smaller." };
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const mime = detectMime(file.name, head);
  if (!mime) {
    return {
      ok: false,
      message: "That file type isn't allowed, or its contents don't match its extension. Use PDF, PNG, JPEG, TXT, CSV, DOCX or XLSX.",
    };
  }
  return { ok: true, mime, name: sanitizeFileName(file.name), size: file.size };
}
