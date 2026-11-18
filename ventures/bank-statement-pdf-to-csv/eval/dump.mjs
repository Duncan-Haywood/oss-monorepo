// Prints the text lines the PDF reader recovers from a statement, with x positions:
//   node eval/dump.mjs statement.pdf
import { readFileSync } from 'node:fs';
import { inflate } from '../inflate-browser.mjs';
import { extractPdfLines } from '../pdf-text.mjs';
const { pages, flags } = await extractPdfLines(new Uint8Array(readFileSync(process.argv[2])), inflate);
console.log(JSON.stringify(flags));
for (const p of pages) for (const l of p.lines) console.log(`p${l.page} | ${l.items.map((i) => `${i.text}@${Math.round(i.x)}`).join("  ")}`);
