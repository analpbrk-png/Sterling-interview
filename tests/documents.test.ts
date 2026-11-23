import { describe, expect, it } from "vitest";
import { sniff, validateUpload } from "@/lib/documents/validate";

// Minimal valid PDF header + body.
const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);

describe("upload validation", () => {
  it("detects by content, not by name", () => {
    expect(sniff(pdf, "cv.docx")?.mime).toBe("application/pdf");
    expect(sniff(exe, "cv.pdf")).toBeNull();
  });
  it("enforces allowed types per document kind", () => {
    expect(validateUpload("resume", "cv.pdf", pdf).ok).toBe(true);
    expect(validateUpload("resume", "photo.png", png).ok).toBe(false);
    expect(validateUpload("passport", "scan.png", png).ok).toBe(true);
    expect(validateUpload("passport", "evil.pdf", exe).ok).toBe(false);
  });
  it("enforces size limits and empty files", () => {
    const big = new Uint8Array(6 * 1024 * 1024);
    big.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(validateUpload("resume", "big.pdf", big)).toMatchObject({ ok: false });
    expect(validateUpload("resume", "e.pdf", new Uint8Array())).toMatchObject({ ok: false });
  });
  it("sanitises file names", () => {
    const r = validateUpload("resume", "../../etc/<script>.pdf", pdf);
    expect(r.ok && r.safeName).not.toMatch(/[/<>]/);
  });
});
