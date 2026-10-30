// Is the IRS 2027 inflation-adjustment revenue procedure out yet?
// Probes irs.gov/pub/irs-drop/rp-26-NN.pdf from the last number seen upward and
// reads each hit's first page for "inflation adjust". Exit 0 and prints the URL
// when found, exit 1 when not (the flagship `next:` item 9 stays open).
// Usage: node eval/revproc-probe.mjs [firstNumber=28] [lastNumber=80]
import { execFileSync } from 'node:child_process';

const first = Number(process.argv[2] ?? 28);
const last = Number(process.argv[3] ?? 80);
const url = (n) => `https://www.irs.gov/pub/irs-drop/rp-26-${n}.pdf`;

async function head(n) {
  try {
    const r = await fetch(url(n), { method: 'HEAD' });
    return r.status;
  } catch {
    return 0;
  }
}

function titleHasInflation(n) {
  try {
    const pdf = execFileSync('curl', ['-sS', '-m', '30', url(n)], { maxBuffer: 50e6 });
    const text = execFileSync('pdftotext', ['-l', '1', '-', '-'], { input: pdf }).toString();
    return /inflation\s+adjust/i.test(text);
  } catch {
    return false;
  }
}

let found = null;
let existing = [];
for (let n = first; n <= last; n++) {
  const s = await head(n);
  if (s === 200) {
    existing.push(n);
    if (titleHasInflation(n)) { found = n; break; }
  } else if (s === 404 && existing.length && n > existing[existing.length - 1] + 3) {
    break; // numbers are issued in order: a run of 404s past the last hit means none further
  }
}
console.log(`existing: ${existing.join(', ') || 'none'}`);
if (found) { console.log(`FOUND: ${url(found)}`); process.exit(0); }
console.log('2027 inflation revenue procedure not out');
process.exit(1);
