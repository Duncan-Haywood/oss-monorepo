// Decrypting PDFs that open with an empty user password (owner-password "restrictions" only), on files
// encrypted by pypdf and LibreOffice (test/fixtures/README.md, "Encrypted PDF fixtures"), and the
// primitives checked against Node's own crypto.
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { importSovFile } from "@shared/sov-import";
import { describe, expect, it } from "vitest";
import { aesCbcDecrypt, md5, rc4 } from "./crypt";
import { PdfReader, PdfUnreadable } from "./reader";
import { extractText } from "./text";

const fixture = (n: string) =>
  new Uint8Array(readFileSync(new URL(`../../../test/fixtures/${n}`, import.meta.url)));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

describe("primitives", () => {
  it("MD5 matches Node's for every length around the block boundaries", () => {
    for (const n of [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 1000]) {
      const data = new Uint8Array(randomBytes(n));
      expect(hex(md5(data))).toBe(createHash("md5").update(data).digest("hex"));
    }
  });

  it("RC4 matches the published test vectors", () => {
    const enc = new TextEncoder();
    expect(hex(rc4(enc.encode("Key"), enc.encode("Plaintext")))).toBe("bbf316e8d940af0ad3");
    expect(hex(rc4(enc.encode("Wiki"), enc.encode("pedia")))).toBe("1021bf0420");
  });

  it("AES-128 and AES-256 CBC decrypt what Node encrypts", () => {
    for (const bits of [128, 256]) {
      const key = randomBytes(bits / 8);
      const iv = randomBytes(16);
      const plain = randomBytes(16 * 37);
      const c = createCipheriv(`aes-${bits}-cbc`, key, iv).setAutoPadding(false);
      const cipher = Buffer.concat([c.update(plain), c.final()]);
      expect(
        hex(aesCbcDecrypt(new Uint8Array(key), new Uint8Array(iv), new Uint8Array(cipher))),
      ).toBe(plain.toString("hex"));
    }
  });
});

describe("encrypted PDFs that open without a password", () => {
  const plain = "schedule-of-values-example.pdf";

  it.each([
    ["encrypted-rc4-40.pdf", "RC4 40-bit, revision 2"],
    ["encrypted-aes-128.pdf", "AES-128, revision 4 with crypt filters"],
    ["encrypted-aes-256-r5.pdf", "AES-256, revision 5 (Acrobat 9)"],
    ["encrypted-aes-256.pdf", "AES-256, revision 6"],
  ])("reads %s (%s) exactly as the unencrypted original", async (name) => {
    const reader = await PdfReader.open(fixture(name));
    expect(reader.wasEncrypted).toBe(true);
    expect(reader.wasRecovered).toBe(false);
    expect(await extractText(fixture(name))).toEqual(await extractText(fixture(plain)));
    const a = await importSovFile(name, fixture(name));
    const b = await importSovFile(plain, fixture(plain));
    expect(a.ok).toBe(true);
    expect(a).toEqual(b);
  });

  it("imports a schedule of values from a LibreOffice PDF with restricted permissions (RC4 128-bit)", async () => {
    const r = await importSovFile("restricted.pdf", fixture("encrypted-libreoffice-rc4-128.pdf"));
    const original = await importSovFile("sov.pdf", fixture("sov-libreoffice-csv.pdf"));
    if (!r.ok || !original.ok) throw new Error("import failed");
    expect(r.lines).toHaveLength(90);
    expect(r.lines).toEqual(original.lines);
    expect(r.totalCents).toBe(original.totalCents);
  });

  it("still refuses a file that needs a password to open, and says so", async () => {
    await expect(PdfReader.open(fixture("locked-user-password.pdf"))).rejects.toThrow(
      new PdfUnreadable("needs a password to open"),
    );
    const r = await importSovFile("locked.pdf", fixture("locked-user-password.pdf"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^This PDF needs a password to open\./);
  });

  it("decrypts after rebuilding a damaged cross-reference", async () => {
    const bytes = fixture("encrypted-aes-128.pdf");
    // Break the startxref offset: the reader must scan for objects, then find the trailer's
    // /Encrypt and /ID before reading them.
    const text = Buffer.from(bytes).toString("latin1");
    const at = text.lastIndexOf("startxref");
    const broken = Buffer.from(`${text.slice(0, at)}startxref\n999999999\n%%EOF\n`, "latin1");
    const reader = await PdfReader.open(new Uint8Array(broken));
    expect(reader.wasRecovered).toBe(true);
    expect(reader.wasEncrypted).toBe(true);
    expect(await extractText(new Uint8Array(broken))).toEqual(await extractText(fixture(plain)));
  });

  it("names a certificate-encrypted file instead of guessing", async () => {
    const body = [
      "%PDF-1.7",
      "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
      "2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj",
      "3 0 obj << /Filter /Adobe.PubSec /SubFilter /adbe.pkcs7.s5 /V 4 /R 4 >> endobj",
      "trailer << /Root 1 0 R /Encrypt 3 0 R >>",
      "%%EOF",
    ].join("\n");
    await expect(PdfReader.open(new TextEncoder().encode(body))).rejects.toThrow(
      /certificate or a security plug-in/,
    );
  });
});
