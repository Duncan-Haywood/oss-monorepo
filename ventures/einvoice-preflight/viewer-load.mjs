// File in, invoice model out, for xrechnung-anzeigen.html: unwraps a ZUGFeRD /
// Factur-X PDF, tells UBL from CII and parses with the checker's own readers
// (ubl.mjs, cii.mjs), so the view and the check read a file the same way.
// Errors are in German, for the page.
import { parseUblInvoice } from "./ubl.mjs";
import { parseCiiInvoice, looksLikeCii } from "./cii.mjs";
import { looksLikePdf, extractEmbeddedInvoice } from "./facturx.mjs";
import { describeSpecification } from "./viewer.mjs";

export const MAX_BYTES = 20 * 1024 * 1024;

function decodeText(bytes) {
  if (typeof bytes === "string") return bytes.replace(/^\uFEFF/, "");
  // UTF-16 with a byte-order mark; everything else is read as UTF-8, the
  // encoding EN 16931's syntaxes use in practice.
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
}

export async function loadInvoiceForView(name, bytes) {
  if (!bytes || bytes.length === 0) throw new Error("Die Datei ist leer.");
  if (bytes.length > MAX_BYTES) throw new Error("Die Datei ist größer als 20 MB. Eine E-Rechnung ist meist wenige Kilobyte groß: Ist es die richtige Datei?");
  let text;
  let wrapper = "";
  if (looksLikePdf(name, bytes)) {
    let extracted;
    try {
      extracted = await extractEmbeddedInvoice(bytes);
    } catch {
      throw new Error("In dieser PDF steckt keine lesbare E-Rechnung. ZUGFeRD- und Factur-X-PDFs tragen eine XML-Datei als Anhang; eine gewöhnliche oder eingescannte PDF ist keine E-Rechnung, und eine verschlüsselte PDF kann diese Seite nicht öffnen.");
    }
    text = decodeText(extracted.payload);
    wrapper = "PDF";
  } else {
    text = decodeText(bytes);
  }
  if (!text.trimStart().startsWith("<")) {
    throw new Error("Das ist keine XML-Datei. Eine XRechnung endet meist auf .xml; eine ZUGFeRD-Rechnung ist eine PDF.");
  }
  const cii = looksLikeCii(text);
  let invoice;
  try {
    invoice = cii ? parseCiiInvoice(text) : parseUblInvoice(text);
  } catch (error) {
    const detail = error && error.message ? ` (${error.message})` : "";
    throw new Error(`Diese Datei ließ sich nicht als E-Rechnung nach EN 16931 lesen${detail}. Angezeigt werden XRechnung (UBL oder CII), ZUGFeRD 2.x, Factur-X und Peppol BIS; ZUGFeRD 1.0 und nationale Formate anderer Länder nicht.`);
  }
  const syntax = cii ? "CII" : "UBL";
  const standard = describeSpecification(invoice.specification_id) || "E-Rechnung";
  const source = wrapper ? `${standard}, aus der PDF entpackte ${syntax}-XML` : `${standard} (${syntax})`;
  return { invoice, source };
}
