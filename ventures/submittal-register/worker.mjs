// Reads PDFs off the main thread so a 1,000-page book does not freeze the page.
import { extractPdfLines } from "./pdf-text.mjs";
import { inflate } from "./inflate-browser.mjs";
import { linesFromPdf, linesFromText } from "./engine.mjs";

self.onmessage = async (e) => {
  try { await read(e.data.files); } catch (err) { self.postMessage({ error: String(err && err.message || err) }); }
};

async function read(files) {
  const out = [];
  let base = 0;
  for (let k = 0; k < files.length; k++) {
    const f = files[k];
    self.postMessage({ progress: `Reading ${f.name} (${k + 1} of ${files.length})` });
    const bytes = new Uint8Array(f.buffer);
    const head = String.fromCharCode(...bytes.subarray(0, 5));
    let lines;
    if (head === "%PDF-") {
      const { pages, flags } = await extractPdfLines(bytes, inflate);
      if (flags.encrypted) { self.postMessage({ note: `${f.name}: the PDF is encrypted, so its text cannot be read. Save an unlocked copy first.` }); continue; }
      if (!flags.pagesWithText) { self.postMessage({ note: `${f.name}: no text layer (a scan?). Run OCR on it first, then try again.` }); continue; }
      if (flags.pagesWithText < flags.pageCount * 0.8) self.postMessage({ note: `${f.name}: ${flags.pageCount - flags.pagesWithText} of ${flags.pageCount} pages have no text layer and were skipped.` });
      lines = linesFromPdf(pages);
    } else lines = linesFromText(new TextDecoder().decode(bytes));
    let top = base;
    for (const l of lines) { l.file = f.name; l.filePage = l.page; l.page += base; if (l.page > top) top = l.page; }
    base = top;
    for (const l of lines) out.push(l); // not push(...lines): a 2,000-page book overflows the call stack
  }
  self.postMessage({ lines: out });
}
