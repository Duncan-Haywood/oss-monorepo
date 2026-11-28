// First article balloons: placed beside each characteristic of a real Chromium-printed drawing
// (test/fixtures/pdf/bracket-drawing-chrome.pdf), numbered as the Form 3 draft numbers them, and
// appended as a valid incremental update (classic xref table, and a cross-reference stream).
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { balloonDrawing, balloonPdf, balloonStream, matchKey } from "./fai-balloons";
import { draftCharacteristics } from "./fai-characteristics";
import { latin1 } from "./pdf-pages";
import { extractPdfText, readPdfLayout } from "./pdf-text";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../../test/fixtures/pdf/${name}`, import.meta.url)));
const bytes = (s: string) => new Uint8Array(Buffer.from(s, "latin1"));

/** Every entry of the update's xref table points at "num gen obj". */
function checkClassicXref(pdf: Uint8Array) {
  const text = latin1(pdf);
  const at = Number([...text.matchAll(/startxref\s+(\d+)/g)].at(-1)?.[1]);
  expect(text.slice(at, at + 4)).toBe("xref");
  const table = text.slice(at, text.indexOf("trailer", at));
  const entries = [...table.matchAll(/(\d+) 1\n(\d{10}) (\d{5}) n\r\n/g)];
  expect(entries.length).toBeGreaterThan(0);
  for (const [, num, off, gen] of entries) {
    expect(text.slice(Number(off), Number(off) + 20)).toMatch(
      new RegExp(`^${num} ${Number(gen)} obj\\n`),
    );
  }
  return text;
}

describe("matchKey", () => {
  it("matches the characteristic reader's sign rules without spaces or case", () => {
    expect(matchKey("1.250 +/- .005")).toBe("1.250±.005");
    expect(matchKey("⌀.010 – a")).toBe("Ø.010-A");
  });
});

describe("balloonDrawing on a Chromium-printed drawing", () => {
  it("puts one balloon per characteristic beside its text, numbered like the Form 3 draft", async () => {
    const pdf = fixture("bracket-drawing-chrome.pdf");
    const text = (await extractPdfText(pdf)) ?? "";
    const draft = draftCharacteristics(text);
    const res = await balloonDrawing(pdf, text);
    expect(res).not.toBeNull();
    if (!res) return;
    // 4X makes rows 3.1-3.4 and one balloon "3".
    expect(draft.characteristics.filter((c) => c.no.startsWith("3.")).length).toBe(4);
    const bases = [...new Set(draft.characteristics.map((c) => c.no.split(".")[0]))];
    expect(res.placements.map((p) => p.label)).toEqual(bases);
    expect(res.unplaced).toEqual([]);
    const at = (label: string) => res.placements.find((p) => p.label === label);
    const layout = await readPdfLayout(pdf);
    const run = (s: string) => layout?.runs.find((r) => r.text.startsWith(s));
    // "4.000 ±.005" (balloon 1): left of the text's start, on its line.
    const dim = run("4.000");
    const b1 = at("1");
    expect(b1 && dim && b1.x < dim.x0 && dim.x0 - b1.x < 15).toBe(true);
    expect(b1 && dim && Math.abs(b1.y - dim.y0) < 6).toBe(true);
    // The vertical "2.200 ±.005" reads bottom to top: its balloon is below the text's start.
    const vert = run("2.200");
    const b2 = at("2");
    expect(vert?.upX).toBeCloseTo(-1);
    expect(b2 && vert && Math.abs(b2.x - vert.x0) < 6 && b2.y < vert.y0).toBe(true);
    // A note's balloon sits before its number, not on it.
    const note = run("1. BREAK");
    const noteBalloon = res.placements.find(
      (p) => note && Math.abs(p.y - note.y0) < 8 && p.x < note.x0,
    );
    expect(noteBalloon).toBeTruthy();
    // No two balloons overlap.
    for (const a of res.placements)
      for (const b of res.placements)
        if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r);
  });

  it("appends an incremental update: original bytes untouched, xref valid, page wraps its contents", async () => {
    const pdf = fixture("bracket-drawing-chrome.pdf");
    const res = await balloonDrawing(pdf, (await extractPdfText(pdf)) ?? "");
    if (!res) throw new Error("no result");
    expect(Buffer.from(res.pdf.subarray(0, pdf.length)).equals(Buffer.from(pdf))).toBe(true);
    const text = checkClassicXref(res.pdf);
    const prev = /startxref\s+(\d+)/.exec(latin1(pdf).slice(-64))?.[1];
    expect(text.slice(pdf.length)).toContain(`/Prev ${prev}`);
    // The new page revision: q-stream, the original streams, then the balloons.
    const layout = await readPdfLayout(res.pdf);
    const page = layout?.objects.get(layout.pages[0]?.num ?? -1)?.body ?? "";
    const refs = [...(/\/Contents\s*\[([^\]]*)\]/.exec(page)?.[1]?.matchAll(/(\d+) \d+ R/g) ?? [])];
    expect(refs.length).toBeGreaterThanOrEqual(3);
    // The text still reads the same after the update.
    expect(await extractPdfText(res.pdf)).toBe(await extractPdfText(pdf));
  });

  it("refuses a file that is not a PDF, and returns no placements when nothing matches", async () => {
    expect(await balloonDrawing(bytes("not a pdf"), "1.000 ±.005")).toBeNull();
    const pdf = fixture("drawing-1-chrome.pdf");
    const res = await balloonDrawing(pdf, "1.000 ±.005");
    expect(res?.placements).toEqual([]);
    expect(res?.unplaced).toEqual(["1"]);
    expect(res?.pdf).toBe(pdf);
  });
});

/** A one-page PDF 1.5 whose page sits in a compressed object stream and whose xref is a stream. */
function xrefStreamPdf(rotate = 0) {
  const content = "BT /F1 10 Tf 100 300 Td (1.250 +/-.005) Tj ET";
  const page = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]${rotate ? ` /Rotate ${rotate}` : ""} /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  // Object stream 6 holds objects 1, 2, 3 (the page) and 5 (the font).
  const packed = [objs[0], objs[1], page, objs[2]] as string[];
  const nums = [1, 2, 3, 5];
  let header = "";
  let body = "";
  packed.forEach((o, i) => {
    header += `${nums[i]} ${body.length} `;
    body += `${o}\n`;
  });
  const objstm = deflateSync(Buffer.from(header + body, "latin1"));
  let out = "%PDF-1.5\n";
  const off4 = out.length;
  out += `4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`;
  const off6 = out.length;
  out += `6 0 obj\n<< /Type /ObjStm /N 4 /First ${header.length} /Length ${objstm.length} /Filter /FlateDecode >>\nstream\n`;
  const head = Buffer.from(out, "latin1");
  const mid = Buffer.from("\nendstream\nendobj\n", "latin1");
  const off7 = head.length + objstm.length + mid.length;
  // Entries 0-7, W [1 2 1]: type, offset or object stream number, generation or index.
  const row = (t: number, a: number, b: number) => [t, (a >> 8) & 0xff, a & 0xff, b];
  const xref = Buffer.from([
    ...row(0, 0, 255),
    ...row(2, 6, 0),
    ...row(2, 6, 1),
    ...row(2, 6, 2),
    ...row(1, off4, 0),
    ...row(2, 6, 3),
    ...row(1, off6, 0),
    ...row(1, off7, 0),
  ]);
  const xhead = Buffer.from(
    `7 0 obj\n<< /Type /XRef /Size 8 /W [1 2 1] /Root 1 0 R /Length ${xref.length} >>\nstream\n`,
    "latin1",
  );
  const xtail = Buffer.from(`\nendstream\nendobj\nstartxref\n${off7}\n%%EOF\n`, "latin1");
  return new Uint8Array(Buffer.concat([head, objstm, mid, xhead, xref, xtail]));
}

describe("balloonPdf on a PDF 1.5 file (object streams, cross-reference stream)", () => {
  it("writes the update as a cross-reference stream whose offsets point at the new objects", async () => {
    const pdf = xrefStreamPdf();
    const res = await balloonPdf(pdf, draftCharacteristics("1.250 ±.005"));
    if (!res) throw new Error("no result");
    expect(res.placements.map((p) => p.label)).toEqual(["1"]);
    const text = latin1(res.pdf);
    const at = Number([...text.matchAll(/startxref\s+(\d+)/g)].at(-1)?.[1]);
    const dict = text.slice(at, text.indexOf("stream", at));
    expect(dict).toMatch(
      /^10 0 obj\n<< \/Type \/XRef \/Size 11 \/Root 1 0 R \/Prev \d+ \/Index \[/,
    );
    const index = (/\/Index \[([^\]]*)\]/.exec(dict)?.[1] ?? "").split(" ").map(Number);
    const raw = res.pdf.subarray(text.indexOf("stream\n", at) + 7);
    for (let i = 0; i < index.length / 2; i++) {
      const num = index[2 * i] as number;
      const e = raw.subarray(7 * i, 7 * i + 7);
      expect(e[0]).toBe(1);
      const off =
        ((e[1] as number) << 24) |
        ((e[2] as number) << 16) |
        ((e[3] as number) << 8) |
        (e[4] as number);
      expect(text.slice(off, off + 12)).toMatch(new RegExp(`^${num} 0 obj\\n`));
    }
    // Page 3 now lives as a plain object in the update, with the wrapped contents.
    expect(text.slice(pdf.length)).toMatch(
      /3 0 obj\n<< \/Type \/Page [\s\S]*\/Contents \[8 0 R 4 0 R 9 0 R\]/,
    );
  });

  it("draws upright on a page shown rotated", async () => {
    const res = await balloonPdf(xrefStreamPdf(90), draftCharacteristics("1.250 ±.005"));
    if (!res) throw new Error("no result");
    expect(latin1(res.pdf.subarray(xrefStreamPdf(90).length))).toMatch(
      /q 0 1 -1 0 [\d.]+ [\d.]+ cm/,
    );
  });
});

describe("balloonStream", () => {
  it("draws a circle and stroked digits for each label, nothing for other characters", () => {
    const s = balloonStream([{ label: "12", page: 0, x: 100, y: 200, r: 8, zone: null }], 0);
    expect(s).toMatch(/^q 1 0 0 1 100 200 cm/);
    // One circle (four Bézier arcs, filled and stroked) for the two digits.
    expect((s.match(/ c(?= )/g) ?? []).length).toBe(4);
    expect((s.match(/ c B/g) ?? []).length).toBe(1);
    expect(s).toContain("S Q");
  });
});
