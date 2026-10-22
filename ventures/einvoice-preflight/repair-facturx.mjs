// Repair the arithmetic of the invoice inside a Factur-X / ZUGFeRD PDF and
// write the PDF back. The embedded CII XML goes through repairCii (same
// contract: only amounts the lines fully determine change). The PDF is then
// updated incrementally: every original byte stays, a new copy of the
// attachment's stream object is appended with a new cross-reference section,
// so the visible pages are untouched. This does not re-render the page: if the
// printed totals were wrong, the page still shows them and a person must
// re-issue the PDF from the source system. PDFs with compressed
// cross-reference streams or encryption are refused, said plainly.

import { repairCii } from "./repair-cii.mjs";
import { looksLikePdf, listEmbeddedFiles, extractEmbeddedInvoice } from "./facturx.mjs";

const LATIN1 = new TextDecoder("latin1");
const UTF8 = new TextEncoder();

export async function repairFacturX(source) {
  const data = source instanceof Uint8Array ? source : new Uint8Array(source);
  if (!looksLikePdf("", data)) throw new Error("The file is not a PDF.");
  const { payload } = await extractEmbeddedInvoice(data);
  const xmlText = new TextDecoder().decode(payload);
  if (!xmlText.includes("CrossIndustryInvoice")) {
    throw new Error("The embedded invoice is not CII XML; only Factur-X / ZUGFeRD (CII) PDFs can be repaired.");
  }
  const x = repairCii(xmlText);
  const out = { ...x, pdf: data, pdfRewritten: false };
  if (!x.repaired) return out;

  const text = LATIN1.decode(data);
  if (/\/Type\s*\/XRef\b/.test(text)) {
    out.skipped = [...x.skipped, "This PDF uses a compressed cross-reference stream, which this tool does not extend. The corrected XML is returned; attach it with your PDF tool."];
    return out;
  }
  const target = (await withInvoice(data, payload));
  if (!target || target.objNum == null) {
    out.skipped = [...x.skipped, "Could not locate the attachment's object in the PDF. The corrected XML is returned."];
    return out;
  }
  const trailerAt = text.lastIndexOf("trailer");
  const trailer = trailerAt === -1 ? "" : text.slice(trailerAt);
  const root = trailer.match(/\/Root\s+(\d+\s+\d+\s+R)/);
  const size = trailer.match(/\/Size\s+(\d+)/);
  const prev = text.slice(text.lastIndexOf("startxref")).match(/startxref\s+(\d+)/);
  if (!root || !size || !prev) {
    out.skipped = [...x.skipped, "The PDF's trailer could not be read. The corrected XML is returned."];
    return out;
  }
  const extra = ["Info", "ID"].map((k) => {
    const m = trailer.match(k === "ID" ? /\/ID\s*(\[[^\]]*\])/ : /\/Info\s+(\d+\s+\d+\s+R)/);
    return m ? ` /${k} ${m[1]}` : "";
  }).join("");

  const body = UTF8.encode(x.xml);
  const objOffset = data.length;
  const head = UTF8.encode(`\n${target.objNum} ${target.gen} obj\n<< /Type /EmbeddedFile /Subtype /text#2Fxml /Length ${body.length} /Params << /Size ${body.length} >> >>\nstream\n`);
  const tail = UTF8.encode("\nendstream\nendobj\n");
  const xrefAt = objOffset + head.length + body.length + tail.length;
  const xref = UTF8.encode(
    `xref\n${target.objNum} 1\n${String(objOffset + 1).padStart(10, "0")} ${String(target.gen).padStart(5, "0")} n \n`
    + `trailer\n<< /Size ${size[1]} /Root ${root[1]}${extra} /Prev ${prev[1]} >>\nstartxref\n${xrefAt}\n%%EOF\n`,
  );
  const pdf = new Uint8Array(xrefAt + xref.length);
  pdf.set(data, 0);
  pdf.set(head, objOffset);
  pdf.set(body, objOffset + head.length);
  pdf.set(tail, objOffset + head.length + body.length);
  pdf.set(xref, xrefAt);
  out.pdf = pdf;
  out.pdfRewritten = true;
  return out;
}

async function withInvoice(data, payload) {
  const want = new TextDecoder().decode(payload);
  for (const a of listEmbeddedFiles(data)) {
    let bytes = a.payload;
    if (a.flate) {
      try {
        const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
        bytes = new Uint8Array(await new Response(s).arrayBuffer());
      } catch { continue; }
    }
    if (new TextDecoder().decode(bytes) === want) return a;
  }
  return null;
}
