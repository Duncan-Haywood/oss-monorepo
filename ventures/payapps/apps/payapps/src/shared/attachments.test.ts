import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_TYPES,
  attachmentProblem,
  cameraPhotoName,
  cleanFileName,
  convertedSize,
  convertibleToJpeg,
  extensionOf,
  formatBytes,
  jpegName,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_CHANGE_ORDER,
  MAX_ATTACHMENTS_PER_PAY_APP,
  MAX_CONVERTED_PIXELS,
  MAX_FILE_NAME_LENGTH,
  packetTypeProblem,
} from "./attachments";

const room = { usedBytes: 0, limitBytes: 1024 * 1024 * 1024 };

describe("cleanFileName", () => {
  it("drops paths, quotes and control characters", () => {
    expect(cleanFileName("C:\\Users\\pm\\Desktop\\Invoice 1042.pdf")).toBe("Invoice 1042.pdf");
    expect(cleanFileName('../../etc/"pass\nwd".txt')).toBe("pass wd.txt");
    expect(cleanFileName("  ...hidden.png ")).toBe("hidden.png");
    expect(cleanFileName("a   b\tc.pdf")).toBe("a b c.pdf");
  });

  it("shortens a long name and keeps its extension", () => {
    const out = cleanFileName(`${"x".repeat(300)}.xlsx`);
    expect(out.length).toBe(MAX_FILE_NAME_LENGTH);
    expect(out.endsWith(".xlsx")).toBe(true);
  });
});

describe("attachmentProblem", () => {
  it("accepts a PDF of backup", () => {
    expect(attachmentProblem({ name: "Stored materials.PDF", sizeBytes: 1000 }, 0, room)).toBe(
      null,
    );
    expect(extensionOf("Stored materials.PDF")).toBe("pdf");
    expect(ATTACHMENT_TYPES.pdf).toBe("application/pdf");
  });

  it("refuses types that could run as a page or a program", () => {
    for (const name of ["page.html", "image.svg", "setup.exe", "script.js", "noextension"]) {
      expect(attachmentProblem({ name, sizeBytes: 10 }, 0, room)).toMatch(/not a file type/);
    }
  });

  it("refuses empty, oversized and nameless files", () => {
    expect(attachmentProblem({ name: "a.pdf", sizeBytes: 0 }, 0, room)).toMatch(/empty/);
    expect(
      attachmentProblem({ name: "a.pdf", sizeBytes: MAX_ATTACHMENT_BYTES + 1 }, 0, room),
    ).toMatch(/limit is 15 MB/);
    expect(attachmentProblem({ name: "///", sizeBytes: 10 }, 0, room)).toMatch(/needs a name/);
  });

  it("caps the files per change order at its own limit", () => {
    const co = { max: MAX_ATTACHMENTS_PER_CHANGE_ORDER, noun: "change order" };
    expect(attachmentProblem({ name: "a.pdf", sizeBytes: 10 }, 19, room, co)).toBeNull();
    expect(attachmentProblem({ name: "a.pdf", sizeBytes: 10 }, 20, room, co)).toBe(
      "This change order already has 20 files; delete one first or combine them into one PDF",
    );
  });

  it("caps the files per pay application and the plan's storage", () => {
    expect(
      attachmentProblem({ name: "a.pdf", sizeBytes: 10 }, MAX_ATTACHMENTS_PER_PAY_APP, room),
    ).toMatch(/already has 40 files/);
    expect(
      attachmentProblem({ name: "a.pdf", sizeBytes: 10 }, 0, { usedBytes: 95, limitBytes: 100 }),
    ).toMatch(/storage \(100 B\) is full/);
    expect(
      attachmentProblem({ name: "a.pdf", sizeBytes: 5 }, 0, { usedBytes: 95, limitBytes: 100 }),
    ).toBe(null);
  });
});

describe("formatBytes", () => {
  it("reads like a person would say it", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(15 * 1024 * 1024)).toBe("15 MB");
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe("1.5 GB");
  });
});

describe("cameraPhotoName", () => {
  const at = new Date(2026, 10, 25, 14, 5, 9).getTime(); // local time, as the phone's clock
  it("names a camera shot by when it was taken, whatever the phone called it", () => {
    expect(cameraPhotoName({ name: "image.jpg", type: "image/jpeg", lastModified: at })).toBe(
      "Photo 2026-11-25 14.05.09.jpg",
    );
    expect(
      cameraPhotoName({ name: "1764079509000.JPEG", type: "image/jpeg", lastModified: at }),
    ).toBe("Photo 2026-11-25 14.05.09.jpg");
  });
  it("takes the extension from the type when the name has none, and the result is accepted", () => {
    const name = cameraPhotoName({ name: "capture", type: "image/png", lastModified: at });
    expect(name).toBe("Photo 2026-11-25 14.05.09.png");
    expect(
      attachmentProblem({ name, sizeBytes: 3_000_000 }, 0, { usedBytes: 0, limitBytes: 1e9 }),
    ).toBeNull();
    expect(cameraPhotoName({ name: "blob", type: "", lastModified: at })).toBe(
      "Photo 2026-11-25 14.05.09.jpg",
    );
  });
});

describe("HEIC and WebP photos converted for the packet", () => {
  it("converts HEIC and WebP by extension, nothing else", () => {
    expect(convertibleToJpeg("IMG_0412.HEIC")).toBe(true);
    expect(convertibleToJpeg("site.webp")).toBe(true);
    for (const n of ["a.jpg", "a.jpeg", "a.png", "a.pdf", "heic", "a.heic.pdf"]) {
      expect(convertibleToJpeg(n)).toBe(false);
    }
  });
  it("keeps the name and swaps the extension, and the result is a packet type", () => {
    expect(jpegName("IMG_0412.HEIC")).toBe("IMG_0412.jpg");
    expect(jpegName("Photo 2026-11-25 14.05.09.heic")).toBe("Photo 2026-11-25 14.05.09.jpg");
    expect(jpegName(".webp")).toBe("Photo.jpg");
    expect(ATTACHMENT_TYPES[extensionOf(jpegName("x.webp"))]).toBe("image/jpeg");
    expect(packetTypeProblem("image/jpeg")).toBeNull();
  });
  it("keeps a 12-megapixel photo whole and scales larger ones to 12, keeping the shape", () => {
    expect(convertedSize(4032, 3024)).toEqual({ width: 4032, height: 3024 });
    expect(convertedSize(3024, 4032)).toEqual({ width: 3024, height: 4032 });
    expect(convertedSize(800, 600)).toEqual({ width: 800, height: 600 });
    const big = convertedSize(8064, 6048); // 48 MP
    expect(big).toEqual({ width: 4032, height: 3024 });
    const tall = convertedSize(4284, 5712); // 24 MP portrait
    expect(tall.width * tall.height).toBeLessThanOrEqual(MAX_CONVERTED_PIXELS);
    expect(tall.width / tall.height).toBeCloseTo(4284 / 5712, 3);
    // under iOS Safari's canvas limit of 16,777,216 pixels
    expect(MAX_CONVERTED_PIXELS).toBeLessThan(16_777_216);
  });
  it("tells the user why a HEIC that stayed HEIC is not in the packet", () => {
    expect(packetTypeProblem("image/heic")).toMatch(/Safari/);
    expect(packetTypeProblem("image/webp")).toMatch(/converted to JPEG on upload/);
  });
});
