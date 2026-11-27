// Writes a PDF whose pages are pictures only, with no text layer: what a scanner saves when its
// "searchable PDF" (OCR) setting is off. Each input is one page: a JPEG (stored as DCTDecode, as
// colour and grey scans are) or a one-strip CCITT Group 4 TIFF (stored as CCITTFaxDecode, K -1, as
// black-and-white office scans are). Each page is the picture's size at the given dpi. A page named
// "<file>@90" places its picture turned a quarter clockwise on the page (a landscape scan drawn on a
// portrait page, or a picture stored on its side and turned upright by its placement).
// Usage: node picture-pdf.mjs <dpi> <out.pdf> <page.jpg|page.tif>[@90] ...
import fs from "node:fs";

const [dpiArg, out, ...inputs] = process.argv.slice(2);
const dpi = Number(dpiArg);
if (!(dpi > 0) || !out || !inputs.length)
  throw new Error("usage: picture-pdf.mjs <dpi> <out.pdf> <pages...>");

function jpegSize(b) {
  for (let i = 2; i < b.length; ) {
    if (b[i] !== 0xff) throw new Error("not a JPEG");
    const marker = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7), comps: b[i + 9] };
    i += 2 + len;
  }
  throw new Error("no JPEG frame header");
}

function tiffG4(b) {
  if (b.toString("latin1", 0, 2) !== "II") throw new Error("expects a little-endian TIFF");
  const ifd = b.readUInt32LE(4);
  const n = b.readUInt16LE(ifd);
  const tags = {};
  for (let i = 0; i < n; i++) {
    const at = ifd + 2 + i * 12;
    const type = b.readUInt16LE(at + 2);
    const count = b.readUInt32LE(at + 4);
    tags[b.readUInt16LE(at)] = {
      count,
      value: type === 3 ? b.readUInt16LE(at + 8) : b.readUInt32LE(at + 8),
    };
  }
  if (tags[259]?.value !== 4) throw new Error("expects Group 4 compression");
  if (tags[273].count !== 1)
    throw new Error("expects one strip (-define tiff:rows-per-strip=<height>)");
  const photometric = tags[262]?.value ?? 0;
  return {
    width: tags[256].value,
    height: tags[257].value,
    data: b.subarray(tags[273].value, tags[273].value + tags[279].value),
    blackIs1: photometric === 1,
  };
}

const objects = [];
const add = (body) => objects.push(body) && objects.length;
const catalog = add(null);
const pagesObj = add(null);
const kids = [];
for (const input of inputs) {
  const turned = input.endsWith("@90");
  const file = turned ? input.slice(0, -3) : input;
  const b = fs.readFileSync(file);
  let dict;
  let data;
  let w;
  let h;
  if (b[0] === 0xff && b[1] === 0xd8) {
    const s = jpegSize(b);
    [w, h, data] = [s.width, s.height, b];
    const cs = s.comps === 1 ? "/DeviceGray" : s.comps === 3 ? "/DeviceRGB" : "/DeviceCMYK";
    dict = `/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode`;
  } else {
    const t = tiffG4(b);
    [w, h, data] = [t.width, t.height, t.data];
    dict = `/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceGray /BitsPerComponent 1 /Filter /CCITTFaxDecode /DecodeParms << /K -1 /Columns ${w} /Rows ${h}${t.blackIs1 ? " /BlackIs1 true" : ""} >>`;
  }
  const pw = +((w * 72) / dpi).toFixed(2);
  const ph = +((h * 72) / dpi).toFixed(2);
  const img = add({ dict: `${dict} /Length ${data.length}`, data });
  // Turned a quarter clockwise: the picture's right edge runs down the page, its top edge along the
  // page's right side, on a page as wide as the picture is tall.
  const cm = turned ? `0 ${-pw} ${ph} 0 0 ${pw}` : `${pw} 0 0 ${ph} 0 0`;
  const content = Buffer.from(`q ${cm} cm /Im0 Do Q\n`, "latin1");
  const contents = add({ dict: `/Length ${content.length}`, data: content });
  kids.push(
    add(
      `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${turned ? ph : pw} ${turned ? pw : ph}] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${contents} 0 R >>`,
    ),
  );
}
objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
objects[pagesObj - 1] =
  `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

const parts = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
let pos = parts[0].length;
const offsets = [];
for (const [i, o] of objects.entries()) {
  offsets.push(pos);
  const chunk =
    typeof o === "string"
      ? Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, "latin1")
      : Buffer.concat([
          Buffer.from(`${i + 1} 0 obj\n<< ${o.dict} >>\nstream\n`, "latin1"),
          o.data,
          Buffer.from("\nendstream\nendobj\n", "latin1"),
        ]);
  parts.push(chunk);
  pos += chunk.length;
}
const xref = [
  `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`,
  ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`),
].join("");
parts.push(
  Buffer.from(
    `${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${pos}\n%%EOF\n`,
    "latin1",
  ),
);
fs.writeFileSync(out, Buffer.concat(parts));
