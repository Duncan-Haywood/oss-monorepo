// Benchmark for drawing-review: the sample drawing plus TEXTS random text runs
// and PATHS random segments. Usage: PATHS=0 TEXTS=16000 N=21 node platform/perf/drawing-review-bench.mjs
// Prints the median time and a hash of the full output (same hash = same answers).
import { extractPdfLines } from "../../ventures/machine-shop-guides/pdf-text.mjs";
import { readDrawing } from "../../ventures/machine-shop-guides/drawing.mjs";
import { sampleDrawingPdf } from "../../ventures/machine-shop-guides/sample-drawing.mjs";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
const inflate = async (b) => { try { return new Uint8Array(zlib.inflateSync(b)); } catch { return null; } };
const PATHS = +(process.env.PATHS ?? 60000), TEXTS = +(process.env.TEXTS ?? 4000);
const base = new TextDecoder("latin1").decode(sampleDrawingPdf());
// heavy content: sample body + CAD-like vector geometry + many dimension labels
const m = base.match(/stream\n([\s\S]*?)endstream/);
let extra = "";
let s = 7;
const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let i = 0; i < PATHS; i++) extra += `${(100 + r()*900).toFixed(3)} ${(200 + r()*500).toFixed(3)} m ${(100 + r()*900).toFixed(3)} ${(200 + r()*500).toFixed(3)} l S\n`;
for (let i = 0; i < TEXTS; i++) extra += `BT /F1 6 Tf 1 0 0 1 ${(100 + r()*800).toFixed(2)} ${(200 + r()*500).toFixed(2)} Tm (${(r()*10).toFixed(3)}) Tj ET\n`;
const body = m[1] + extra;
const comp = zlib.deflateSync(Buffer.from(body, "latin1"));
const objs = [];
objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
objs[2] = "<< /Type /Pages /Kids [4 0 R] /Count 1 >>";
objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
objs[4] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1224 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>";
let out = "%PDF-1.5\n"; const offs = [];
for (let n = 1; n < 5; n++) { offs[n] = out.length; out += `${n} 0 obj\n${objs[n]}\nendobj\n`; }
offs[5] = out.length;
const head = `5 0 obj\n<< /Length ${comp.length} /Filter /FlateDecode >>\nstream\n`;
let parts = [Buffer.from(out + head, "latin1"), comp, Buffer.from("\nendstream\nendobj\n", "latin1")];
let pre = Buffer.concat(parts); const xref = pre.length;
let tail = `xref\n0 6\n0000000000 65535 f \n` + offs.slice(1).map(o => String(o).padStart(10,"0")+" 00000 n \n").join("") + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
const bytes = new Uint8Array(Buffer.concat([pre, Buffer.from(tail, "latin1")]));
console.error(`pdf ${bytes.length} bytes, content ${body.length}`);
const N = +(process.env.N ?? 5); const ts = []; let last;
for (let i = 0; i < N; i++) { const t0 = performance.now(); const ex = await extractPdfLines(bytes, inflate); const d = readDrawing(ex); ts.push(performance.now() - t0); last = JSON.stringify([ex, d]); }
ts.sort((a,b)=>a-b);
console.log(`median ${ts[N>>1].toFixed(1)} ms  min ${ts[0].toFixed(1)}  hash ${createHash("sha256").update(last).digest("hex").slice(0,16)}`);
