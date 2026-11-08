import { describe, expect, it } from "vitest";
import { checkUpload, detectMime, MAX_FILE_BYTES, sanitizeFileName } from "./files";
import { makePdf } from "../seed-files";

const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new TextEncoder().encode(s);

describe("detectMime", () => {
  it("accepts files whose content matches the extension", () => {
    expect(detectMime("brief.pdf", text("%PDF-1.7"))).toBe("application/pdf");
    expect(detectMime("logo.PNG", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(detectMime("photo.jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(detectMime("plan.docx", bytes(0x50, 0x4b, 0x03, 0x04))).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(detectMime("notes.txt", text("hello"))).toBe("text/plain");
  });

  it("rejects a renamed executable", () => {
    expect(detectMime("invoice.pdf", text("MZ\x90\x00"))).toBeNull();
  });

  it("rejects binary content in a text file", () => {
    expect(detectMime("data.csv", bytes(0x61, 0x00, 0x62))).toBeNull();
  });

  it("rejects extensions that aren't on the allow-list", () => {
    expect(detectMime("script.html", text("<script>"))).toBeNull();
    expect(detectMime("archive.zip", bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull();
    expect(detectMime("noextension", text("x"))).toBeNull();
  });
});

describe("sanitizeFileName", () => {
  it("removes path separators and control characters", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("..-..-etc-passwd");
    expect(sanitizeFileName("a\u0000b\nc.txt")).toBe("abc.txt");
  });
  it("falls back to a default name", () => {
    expect(sanitizeFileName("   ")).toBe("file");
  });
  it("keeps the extension when truncating", () => {
    const long = `${"x".repeat(300)}.pdf`;
    expect(sanitizeFileName(long)).toHaveLength(200);
    expect(sanitizeFileName(long).endsWith(".pdf")).toBe(true);
  });
});

describe("checkUpload", () => {
  it("accepts a valid PDF", async () => {
    const file = new File([makePdf(["Test"])], "test.pdf", { type: "application/pdf" });
    await expect(checkUpload(file)).resolves.toMatchObject({ ok: true, mime: "application/pdf", name: "test.pdf" });
  });
  it("ignores the browser-reported MIME type", async () => {
    const file = new File(["MZ fake exe"], "report.pdf", { type: "application/pdf" });
    await expect(checkUpload(file)).resolves.toMatchObject({ ok: false });
  });
  it("rejects empty and missing files", async () => {
    await expect(checkUpload(null)).resolves.toMatchObject({ ok: false });
    await expect(checkUpload(new File([], "empty.txt"))).resolves.toMatchObject({ ok: false });
  });
  it("rejects files over 5 MB", async () => {
    const file = new File([new Uint8Array(MAX_FILE_BYTES + 1)], "big.txt");
    await expect(checkUpload(file)).resolves.toEqual({ ok: false, message: "Files must be 5 MB or smaller." });
  });
});
