// A lien waiver (packages/lien-waivers WaiverDocument) as a one- or two-page letter PDF. The
// document's blocks are printed in order and nothing is added to the form's body; the citation and
// disclaimers go in a footer band, outside the form. Statutory notices are printed in bold at the
// largest type size on the page (12 pt), as Ariz. Rev. Stat. § 33-1008(D)(2) and (4), Nev. Rev.
// Stat. § 108.2457(5)(b) and (d) and Tex. Prop. Code § 53.284(c)(1) and (e)(1) (bold, at least the
// largest type and not under 10 pt) require. Texas's notice is the form's first block, so it prints
// at the top. A form whose statute sets a floor for the whole form (Georgia's "at least 12 point
// font", O.C.G.A. § 44-14-366(d), (e)) carries `minFontPt`, and every block on it prints at that
// size or larger; the footer band is outside the form. Preliminary notices (noticePdf) share the
// layout.
import type { Block, NoticeDocument, WaiverDocument } from "@lien-waivers";
import { PdfDocument, type PdfPage, wrapText } from "./pdf";

const W = 612;
const H = 792;
const M = 54;
const BODY_PT = 10;
/** Title and notices share the largest size on the page. */
const LARGEST_PT = 12;

/** The sample job's waivers are invented: never a real waiver. */
export const SAMPLE_WAIVER_MARK = "SAMPLE DATA - NOT A REAL LIEN WAIVER";

export function waiverPdf(doc: WaiverDocument, opts: { sample?: boolean } = {}): Uint8Array {
  const foot = [
    doc.source === "statutory"
      ? `Form: ${doc.citation ?? "statutory form"}. Printed by PayApps from packages/lien-waivers.`
      : "General form, not a statutory form. Printed by PayApps from packages/lien-waivers.",
    ...doc.disclaimers.slice(-1),
  ].join(" ");
  return formPdf(
    doc.title,
    [doc.blocks],
    foot,
    opts.sample ? SAMPLE_WAIVER_MARK : null,
    doc.minFontPt,
  );
}

/** The sample job's notices are invented: never a real notice. */
export const SAMPLE_NOTICE_MARK = "SAMPLE DATA - NOT A REAL NOTICE";

/**
 * A preliminary notice of right to lien (packages/lien-waivers NoticeDocument): the notice, then
 * the attachment its form names (Wyoming's blank lien waiver) starting on a new page. Same layout,
 * notice type and footer band as a waiver.
 */
export function noticePdf(doc: NoticeDocument, opts: { sample?: boolean } = {}): Uint8Array {
  const foot = [
    `Form: ${doc.citation}${doc.attachment ? "; the attached lien waiver form is printed blank" : ""}. Printed by PayApps from packages/lien-waivers.`,
    ...doc.disclaimers.slice(-1),
  ].join(" ");
  const sections = [doc.blocks, ...(doc.attachment ? [doc.attachment.blocks] : [])];
  return formPdf(doc.title, sections, foot, opts.sample ? SAMPLE_NOTICE_MARK : null, doc.minFontPt);
}

/** Prints each section's blocks in order, each section from a new page, with the footer band. */
function formPdf(
  title: string,
  sections: readonly (readonly Block[])[],
  footText: string,
  mark: string | null,
  minFontPt = 0,
): Uint8Array {
  const BODY = Math.max(BODY_PT, minFontPt);
  const LARGEST = Math.max(LARGEST_PT, minFontPt);
  const pdf = new PdfDocument({ title });
  let page: PdfPage = pdf.addPage(W, H);
  let y = M;
  const width = W - 2 * M;
  const footerTop = H - M - 40;

  const ensure = (h: number) => {
    if (y + h > footerTop) {
      page = pdf.addPage(W, H);
      y = M;
    }
  };
  const lines = (text: string, size: number, font: "regular" | "bold" = "regular", gap = 6) => {
    const wrapped = wrapText(text, width, size, font);
    for (const l of wrapped) {
      ensure(size + 3);
      page.text(M, y + size, l, { size, font });
      y += size + 3;
    }
    y += gap;
  };

  sections.forEach((blocks, si) => {
    if (si > 0) {
      page = pdf.addPage(W, H);
      y = M;
    }
    for (const b of blocks) {
      switch (b.type) {
        case "title":
          lines(b.text, LARGEST, "bold", 10);
          break;
        case "heading":
          lines(b.text, BODY + 1, "bold", 4);
          break;
        case "paragraph":
          lines(b.text, BODY);
          break;
        case "notice":
          lines(b.text, LARGEST, "bold", 10);
          break;
        case "field":
          lines(`${b.label}: ${b.value}`, BODY, "regular", 2);
          break;
        case "spacer":
          y += 12;
          break;
        case "signature":
          for (const l of b.lines) {
            ensure(26);
            y += 16;
            page.text(M, y, `${l.label}:`, { size: BODY, font: "bold" });
            page.line(M + 110, y + 2, M + 360, y + 2);
            if (l.value) page.text(M + 114, y - 1, l.value, { size: BODY });
            y += 8;
          }
          y += 8;
          break;
      }
    }
  });

  // Footer on every page: where the wording comes from and the disclaimer.
  const foot = footText.replaceAll("§§", "Secs.").replaceAll("§", "Sec.");
  pdf.pages.forEach((p, i) => {
    // Above the form, outside its body, like the footer band.
    if (mark) p.text(W - M, 30, mark, { size: 9, font: "bold", align: "right" });
    let fy = H - M - 30;
    p.line(M, fy - 8, W - M, fy - 8, 0.3);
    for (const l of wrapText(foot, width - 40, 7)) {
      p.text(M, fy, l, { size: 7 });
      fy += 9;
    }
    p.text(W - M, H - M - 30, `${i + 1}/${pdf.pages.length}`, { size: 7, align: "right" });
  });
  return pdf.toBytes();
}
