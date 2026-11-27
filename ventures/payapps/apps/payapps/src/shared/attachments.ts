// Files attached to a pay application: the backup a GC asks for with it (invoices for stored
// materials, certified payroll, insurance certificates), job photos and the signed certificate
// returned afterwards. Pure rules shared by the Worker (services/payapps/attachments.ts) and the
// upload form, so the browser refuses a file before sending it and the Worker refuses it again.

export const ATTACHMENT_CATEGORIES = ["backup", "photo", "signed", "other"] as const;
export type AttachmentCategory = (typeof ATTACHMENT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  backup: "Backup (invoices, payroll, certificates)",
  photo: "Job photo",
  signed: "Signed or certified application",
  other: "Other",
};

/**
 * The same four kinds on a change order, worded for it: the backup a GC asks for before signing,
 * photos of the condition that caused the change, and the change order signed by both sides.
 */
export const CHANGE_ORDER_CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  backup: "Pricing backup (quotes, T&M tickets, invoices)",
  photo: "Photo of the condition or work",
  signed: "Signed change order",
  other: "Other",
};

/**
 * Files kept with a California preliminary notice recorded as given: what Cal. Civ. Code § 8118(b)
 * says goes with the proof of notice declaration when the notice was mailed (the receipt for
 * registered, certified or express mail or an overnight carrier; the return receipt, tracking record
 * or returned envelope), and the signed declaration itself. The kinds reuse the stored categories.
 */
export const CA_NOTICE_CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  backup: "Mailing receipt (certified, registered or express mail, or overnight carrier)",
  photo: "Proof of delivery (return receipt, tracking record or the returned envelope)",
  signed: "Signed proof of notice declaration",
  other: "Other",
};

/**
 * Files kept with one of the company's insurance certificates: the certificate itself (usually an
 * ACORD 25 from the agent), the endorsements a subcontract asks for alongside it (additional insured,
 * waiver of subrogation, primary and non-contributory), and the policy's own pages. The kinds reuse
 * the stored categories.
 */
export const INSURANCE_CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  backup: "Certificate of insurance (e.g. ACORD 25)",
  photo: "Photo or scan",
  signed: "Endorsement (additional insured, waiver of subrogation)",
  other: "Other (policy pages, the agent's letter)",
};

/** Files kept with a company document (services/company-document-files.ts). */
export const COMPANY_DOCUMENT_CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  backup: "The document (license card, bonding letter, W-9, certificate)",
  photo: "Photo or scan",
  signed: "Signed or stamped copy",
  other: "Other (renewal letter, board printout)",
};

/**
 * Files kept with an RFI: the marked-up sheet or detail the question is about and photos of the
 * condition (both go with the RFI to the GC), and the response that comes back (a sketch, an ASI or
 * the RFI returned answered), which is the GC's, so it stays out of the RFI's own packet.
 */
export const RFI_CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  backup: "Marked-up sheet or detail (what the question is about)",
  photo: "Photo of the condition",
  signed: "Response from the GC or design team (sketch, ASI, answered RFI)",
  other: "Other",
};

/**
 * Files kept with one submittal revision: what goes to the reviewer (product data sheets, shop
 * drawings, calculations, certificates), photos of a sample or mock-up, and the copy the reviewer
 * returns with their stamp. The kinds reuse the stored categories; the transmittal lists every file
 * but the returned copy as enclosed.
 */
export const SUBMITTAL_CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  backup: "Product data or shop drawings (sent to the reviewer)",
  photo: "Photo of a sample or mock-up",
  signed: "Reviewed copy returned (stamped)",
  other: "Other",
};

/**
 * Files kept with one daily report: photos of the day's work and conditions (the record a delay or
 * change-order claim leans on), the delivery tickets and inspection reports from that day, and a
 * signed copy of the report when a GC asks for one. The kinds reuse the stored categories.
 */
export const DAILY_REPORT_CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  backup: "Delivery ticket, inspection or test report",
  photo: "Job photo",
  signed: "Signed copy of the report",
  other: "Other",
};

/**
 * Files kept with one close-out document: the document itself as sent (the warranty letter, the O&M
 * manual, the as-built set), photos (attic stock delivered, a tag on installed equipment), and the
 * GC's receipt or acceptance when it comes back, which is theirs, so it stays out of the binder.
 */
export const CLOSEOUT_CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  backup: "The document as sent (warranty, manual, drawings, report)",
  photo: "Photo (attic stock delivered, installed equipment)",
  signed: "Receipt or acceptance from the GC",
  other: "Other",
};

/**
 * Files kept with one T&M ticket: photos of the extra work (before, during, after: what a GC
 * disputing the hours asks to see), the material backup priced on the ticket (delivery tickets,
 * receipts, supplier invoices), and a scan of the ticket when the GC signed a paper copy. The kinds
 * reuse the stored categories; every one goes behind the ticket in its packet, the signed scan
 * included, since on a paper-signed ticket that scan is the signature.
 */
export const TM_TICKET_CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  backup: "Material backup (delivery ticket, receipt, supplier invoice)",
  photo: "Photo of the extra work",
  signed: "Signed paper ticket (scan or photo)",
  other: "Other",
};

/** Short kind names for a submittal's transmittal "Enclosed" list and its packet index. */
export const SUBMITTAL_FILE_KIND: Record<AttachmentCategory, string> = {
  backup: "Product data / drawings",
  photo: "Sample photo",
  signed: "Reviewed copy",
  other: "Other",
};

/** One file. A phone photo or a scanned invoice packet fits; a whole drawing set does not. */
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
/** Files on one pay application. */
export const MAX_ATTACHMENTS_PER_PAY_APP = 40;
/** Files on one change order. */
export const MAX_ATTACHMENTS_PER_CHANGE_ORDER = 20;
/** Files on one RFI (marked-up sheets, photos, the response). */
export const MAX_ATTACHMENTS_PER_RFI = 20;
/** Files on one preliminary notice record (receipts, the green card, the signed proof). */
export const MAX_ATTACHMENTS_PER_NOTICE = 10;
/** Files on one insurance certificate (the certificate, its endorsements, the policy pages). */
export const MAX_ATTACHMENTS_PER_CERTIFICATE = 10;
/**
 * Files on one company document (the license card, the bonding letter PDF, a signed W-9, a renewal
 * letter): a handful per document, renewals usually go on a new record.
 */
export const MAX_ATTACHMENTS_PER_COMPANY_DOCUMENT = 10;
/** Files on one submittal revision (data sheets, drawings, the stamped copy). */
export const MAX_ATTACHMENTS_PER_SUBMITTAL = 20;
/** Files on one daily report (a day's photos, tickets and reports). */
export const MAX_ATTACHMENTS_PER_DAILY_REPORT = 30;
/** Files on one close-out document: an O&M manual can come as a PDF per piece of equipment. */
export const MAX_ATTACHMENTS_PER_CLOSEOUT_ITEM = 30;
/** Files on one T&M ticket (photos of the work, material receipts, the signed paper copy). */
export const MAX_ATTACHMENTS_PER_TM_TICKET = 20;
export const MAX_FILE_NAME_LENGTH = 120;

/**
 * The file types accepted, by extension, and the Content-Type stored and served for each. The type
 * comes from this table, never from the browser, and downloads are always `attachment`, so nothing
 * uploaded is ever rendered as a page on our origin.
 */
export const ATTACHMENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  webp: "image/webp",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain",
};

export const ACCEPT_ATTRIBUTE = Object.keys(ATTACHMENT_TYPES)
  .map((e) => `.${e}`)
  .join(",");

export const extensionOf = (name: string) => {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name.trim());
  return m ? (m[1] as string).toLowerCase() : "";
};

/**
 * A safe display and download name: path parts, control characters and quotes removed, spaces
 * collapsed, at most MAX_FILE_NAME_LENGTH characters with the extension kept.
 */
export function cleanFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const printable = [...base.replace(/\s/g, " ")].filter((ch) => {
    const code = ch.charCodeAt(0);
    return code >= 0x20 && code !== 0x7f && !'"<>|*?:;'.includes(ch);
  });
  let s = printable.join("").replace(/\s+/g, " ").trim();
  s = s.replace(/^\.+/, "");
  if (s.length > MAX_FILE_NAME_LENGTH) {
    const ext = extensionOf(s);
    const keep = MAX_FILE_NAME_LENGTH - (ext ? ext.length + 1 : 0);
    s = `${s.slice(0, keep).trimEnd()}${ext ? `.${ext}` : ""}`;
  }
  return s;
}

/** What the "Take a photo" button asks the phone for: JPEG or PNG, so the photo fits the packet. */
export const CAMERA_ACCEPT = "image/jpeg,image/png";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A name for a photo taken with the phone's camera from the upload form. Phones name these
 * "image.jpg" (iOS, every time) or a bare number (some Android browsers), so a pay application's
 * photo list would read "image.jpg" ten times. The name is the capture time instead, in the phone's
 * own clock (the file's lastModified), to the second: "Photo 2026-11-25 14.05.09.jpg". The extension
 * follows the file's type when the name has none.
 */
export function cameraPhotoName(file: { name: string; type: string; lastModified: number }) {
  const ext =
    extensionOf(file.name) ||
    (file.type === "image/png" ? "png" : file.type === "image/heic" ? "heic" : "jpg");
  const d = new Date(file.lastModified);
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
  return `Photo ${day} ${time}.${ext === "jpeg" ? "jpg" : ext}`;
}

export interface AttachmentCandidate {
  name: string;
  sizeBytes: number;
}

/** Why a file cannot be attached, or null when it can. */
export function attachmentProblem(
  file: AttachmentCandidate,
  existingCount: number,
  storage: { usedBytes: number; limitBytes: number },
  holder: { max: number; noun: string } = {
    max: MAX_ATTACHMENTS_PER_PAY_APP,
    noun: "pay application",
  },
): string | null {
  const name = cleanFileName(file.name);
  if (!name) return "The file needs a name";
  const ext = extensionOf(name);
  if (!ATTACHMENT_TYPES[ext]) {
    return `"${name}" is not a file type PayApps keeps. Attach a PDF, a photo (JPEG, PNG, HEIC, WebP), a spreadsheet (XLSX, XLS, CSV), a Word document or a text file.`;
  }
  if (file.sizeBytes <= 0) return `"${name}" is empty`;
  if (file.sizeBytes > MAX_ATTACHMENT_BYTES) {
    return `"${name}" is ${formatBytes(file.sizeBytes)}; the limit is ${formatBytes(MAX_ATTACHMENT_BYTES)} a file. Split the PDF or attach a smaller scan.`;
  }
  if (existingCount >= holder.max) {
    return `This ${holder.noun} already has ${holder.max} files; delete one first or combine them into one PDF`;
  }
  if (storage.usedBytes + file.sizeBytes > storage.limitBytes) {
    return `Your plan's file storage (${formatBytes(storage.limitBytes)}) is full: ${formatBytes(storage.usedBytes)} used. Delete files you no longer need or change plans.`;
  }
  return null;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1).replace(/\.0$/, "")} GB`;
}

/**
 * Which files the backup packet (one PDF of the application and its backup) can hold: PDFs and
 * JPEG or PNG photos. Shared so the pay-app page shows what will be left out before downloading.
 */
export function packetTypeProblem(contentType: string): string | null {
  if (
    contentType === "application/pdf" ||
    contentType === "image/jpeg" ||
    contentType === "image/png"
  ) {
    return null;
  }
  if (contentType === "image/heic") {
    return "This HEIC photo was attached from a browser that cannot read HEIC, so it stayed HEIC and cannot be placed in the PDF. Attach it again from Safari (which converts it to JPEG on upload), or as JPEG (on an iPhone: Settings > Camera > Formats > Most Compatible), or send it separately.";
  }
  if (contentType === "image/webp")
    return "This WebP image was attached before PayApps converted WebP to JPEG, or from a browser that could not read it. Attach it again (it is converted to JPEG on upload), or send it separately.";
  return "Only PDFs and JPEG or PNG photos go into the packet. Send this file separately, or print it to PDF and attach that.";
}

/**
 * Photo types the packet cannot hold but a browser may be able to decode: HEIC (an iPhone's default;
 * Safari decodes it, Chrome and Firefox do not) and WebP (every current browser). The upload form
 * converts these to JPEG before sending, when the browser can, so the photo goes in the packet
 * (`client/lib/packet-photo.ts`). Judged by extension, as the Worker judges the stored type.
 */
export function convertibleToJpeg(name: string): boolean {
  const ext = extensionOf(name);
  return ext === "heic" || ext === "webp";
}

/** The converted photo's name: the same name with a .jpg extension ("IMG_0412.HEIC" -> "IMG_0412.jpg"). */
export function jpegName(name: string): string {
  const ext = extensionOf(name);
  const stem = ext ? name.trim().slice(0, -(ext.length + 1)) : name.trim();
  return `${stem || "Photo"}.jpg`;
}

/**
 * The largest photo the converter writes, in pixels: 4032 x 3024, an iPhone's 12-megapixel frame.
 * iOS Safari will not draw a canvas larger than 16,777,216 pixels (it draws nothing), and a 24 or 48
 * megapixel frame re-encoded as JPEG can pass the 15 MB file limit, so larger photos are scaled down
 * to this area, keeping their shape. A 12-megapixel photo or smaller keeps every pixel.
 */
export const MAX_CONVERTED_PIXELS = 4032 * 3024;

/** The size to draw a width x height photo at so it fits MAX_CONVERTED_PIXELS (never scaled up). */
export function convertedSize(width: number, height: number): { width: number; height: number } {
  const area = width * height;
  if (area <= MAX_CONVERTED_PIXELS) return { width, height };
  const k = Math.sqrt(MAX_CONVERTED_PIXELS / area);
  return {
    width: Math.max(1, Math.floor(width * k)),
    height: Math.max(1, Math.floor(height * k)),
  };
}

/**
 * Shrinking large photos before upload (Attachments part 3). A phone's 12-megapixel JPEG is 2.5 to
 * 5 MB, so the free plan's 250 MB holds about 60 of them and each takes seconds to send from a job
 * site. Redrawn with the long side at SHRINK_LONG_EDGE pixels it is usually under 1 MB and still
 * prints at over 250 dpi across a letter page's 8.5 inches, sharper than the packet needs. Only JPEG
 * photos (what phone cameras write) and HEIC or WebP photos being converted anyway; a PNG is often a
 * screenshot or a drawing, where JPEG blurs the text, so it is left alone. The contractor can turn
 * it off for photos that must stay full size.
 */
export const SHRINK_LONG_EDGE = 2560;
/** A JPEG at or under this size is sent as it is: shrinking it saves too little to be worth it. */
export const SHRINK_MIN_BYTES = 1024 * 1024;
/** JPEG quality for shrunk photos. */
export const SHRINK_JPEG_QUALITY = 0.85;
/** The shrunk photo is kept only when it is at most this share of the original's bytes. */
export const SHRINK_MAX_RATIO = 0.8;

/** A photo the upload form may shrink: a JPEG over SHRINK_MIN_BYTES. Judged by extension. */
export function shrinkable(file: { name: string; sizeBytes: number }): boolean {
  const ext = extensionOf(file.name);
  return (ext === "jpg" || ext === "jpeg") && file.sizeBytes > SHRINK_MIN_BYTES;
}

/** The size to draw a photo at so its long side is at most SHRINK_LONG_EDGE (never scaled up). */
export function shrunkSize(width: number, height: number): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= SHRINK_LONG_EDGE) return { width, height };
  const k = SHRINK_LONG_EDGE / long;
  return {
    width: Math.max(1, Math.round(width * k)),
    height: Math.max(1, Math.round(height * k)),
  };
}
