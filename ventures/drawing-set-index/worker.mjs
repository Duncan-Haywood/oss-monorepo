// Reads drawing set PDFs off the main thread, so a 200-sheet set does not freeze the page.
import { extractPdfRuns } from "./pdf-text.mjs";
import { inflate } from "./inflate-browser.mjs";
import { indexSet } from "./engine.mjs";

self.onmessage = async (e) => {
  try { await read(e.data); } catch (err) { self.postMessage({ error: String(err && err.message || err) }); }
};

// Each message is one issue of the set: one PDF, or several (one per sheet,
// or one per discipline) read as one set in the order given.
async function read({ files, tag }) {
  const pages = [];
  const notes = [];
  for (let k = 0; k < files.length; k++) {
    const f = files[k];
    self.postMessage({ progress: `Reading ${f.name} (${k + 1} of ${files.length})` });
    const { pages: ps, flags } = await extractPdfRuns(new Uint8Array(f.buffer), inflate);
    if (flags.notPdf) { notes.push(`${f.name}: not a PDF.`); continue; }
    if (flags.encrypted) { notes.push(`${f.name}: the PDF is encrypted, so its text cannot be read. Save an unlocked copy first.`); continue; }
    if (!flags.pagesWithText) notes.push(`${f.name}: no text layer (a scan?). Sheet numbers cannot be read without OCR.`);
    ps.forEach((p, i) => { p.file = f.name; p.filePage = i + 1; pages.push(p); });
  }
  self.postMessage({ tag, index: indexSet(pages), notes });
}
