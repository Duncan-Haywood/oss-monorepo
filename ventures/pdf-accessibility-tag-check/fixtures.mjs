// Hand-built minimal PDF byte fixtures for tests. These are not
// spec-complete PDFs (no real xref table) -- this venture's parser is
// deliberately lenient and scans for "N G obj ... endobj" directly, which
// is exactly what these fixtures exercise. See pdf-parser.mjs's header
// comment for why that's a reasonable thing for a v0 evidence tool to do.

import { bytesToBinaryString, binaryStringToBytes } from './pdf-parser.mjs';

/**
 * @param {Array<{num: number, dict: string, stream?: Uint8Array|string}>} objects
 * @param {string} trailerDict
 */
export function buildPdf(objects, trailerDict) {
  let out = '%PDF-1.7\n';
  for (const obj of objects) {
    out += `${obj.num} 0 obj\n${obj.dict}\n`;
    if (obj.stream !== undefined) {
      const streamStr = typeof obj.stream === 'string' ? obj.stream : bytesToBinaryString(obj.stream);
      out += `stream\n${streamStr}\nendstream\n`;
    }
    out += 'endobj\n';
  }
  out += `trailer\n${trailerDict}\n%%EOF`;
  return binaryStringToBytes(out);
}

/** A minimal, fully accessible one-page, one-image PDF: tagged, titled,
 * a valid /Lang, DisplayDocTitle on, one image with a matching /Alt
 * structure element, and a content stream with real text (Tj). Tests
 * start from this and delete/break one thing at a time. */
export function accessiblePdfObjects() {
  return [
    { num: 1, dict: '<< /Type /Catalog /Pages 2 0 R /MarkInfo 5 0 R /StructTreeRoot 6 0 R /Lang (en-US) /ViewerPreferences 7 0 R >>' },
    { num: 2, dict: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
    { num: 3, dict: '<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im0 8 0 R >> >> /Contents 4 0 R /MediaBox [0 0 612 792] >>' },
    { num: 4, dict: '<< /Length 27 >>', stream: 'BT /F1 12 Tf (Hello) Tj ET' },
    { num: 5, dict: '<< /Marked true >>' },
    { num: 6, dict: '<< /Type /StructTreeRoot /K [9 0 R] >>' },
    { num: 7, dict: '<< /DisplayDocTitle true >>' },
    { num: 8, dict: '<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 4 >>', stream: new Uint8Array([1, 2, 3, 4]) },
    { num: 9, dict: '<< /Type /StructElem /S /Figure /Alt (A red circle logo) >>' },
    { num: 10, dict: '<< /Title (Sample Document) /Producer (Fixture) >>' },
  ];
}

export const ACCESSIBLE_TRAILER = '<< /Root 1 0 R /Info 10 0 R >>';

export async function fakeInflate() { return null; } // never invoked in tests that don't use it
