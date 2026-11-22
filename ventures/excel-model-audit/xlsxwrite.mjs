// Writes a minimal valid .xlsx (stored, uncompressed ZIP with CRC-32), so
// the page can build its worked example in the browser and the tests can
// build workbooks whose every cell is known.

import { parseAddr } from "./xlsx.mjs";

const te = new TextEncoder();
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

export function zipStore(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const data = typeof text === "string" ? te.encode(text) : text;
    const nb = te.encode(name), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(h.buffer), nb, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nb.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nb);
    offset += 30 + nb.length + data.length;
  }
  const csize = central.reduce((n, p) => n + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// sheets: [{ name, state?, cells: { A1: 5 | "text" | "=B1*2" | { f, v, e, shared, si } }, hiddenRows?: [n] }]
export function buildXlsx({ sheets, names = [], iterate = false, manual = false }) {
  const files = [];
  files.push(["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`]);
  files.push(["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`]);
  const nameXml = names.length ? `<definedNames>${names.map((n) => `<definedName name="${esc(n.name)}"${n.localSheetId !== undefined ? ` localSheetId="${n.localSheetId}"` : ""}>${esc(n.ref)}</definedName>`).join("")}</definedNames>` : "";
  files.push(["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}"${s.state ? ` state="${s.state}"` : ""} r:id="rId${i + 1}"/>`).join("")}</sheets>${nameXml}<calcPr calcId="191029"${iterate ? ' iterate="1"' : ""}${manual ? ' calcMode="manual"' : ""}/></workbook>`]);
  files.push(["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`]);
  sheets.forEach((s, i) => {
    const rows = new Map();
    for (const [a, val] of Object.entries(s.cells)) {
      const p = parseAddr(a);
      if (!rows.has(p.r)) rows.set(p.r, []);
      rows.get(p.r).push([p.c, a, val]);
    }
    const hidden = new Set(s.hiddenRows || []);
    const body = [...rows.keys()].sort((x, y) => x - y).map((r) => {
      const cs = rows.get(r).sort((x, y) => x[0] - y[0]).map(([, a, val]) => {
        if (typeof val === "number") return `<c r="${a}"><v>${val}</v></c>`;
        if (typeof val === "string" && val.startsWith("=")) return `<c r="${a}"><f>${esc(val.slice(1))}</f></c>`;
        if (typeof val === "string") return `<c r="${a}" t="inlineStr"><is><t>${esc(val)}</t></is></c>`;
        if (val.text !== undefined) return `<c r="${a}" t="inlineStr"><is><t>${esc(val.text)}</t></is></c>`;
        const fx = val.si !== undefined ? `<f t="shared" si="${val.si}"${val.shared ? ` ref="${val.shared}"` : ""}${val.f ? `>${esc(val.f)}</f>` : "/>"}` : val.f ? `<f>${esc(val.f)}</f>` : "";
        if (val.e) return `<c r="${a}" t="e">${fx}<v>${esc(val.e)}</v></c>`;
        if (typeof val.v === "string") return `<c r="${a}" t="str">${fx}<v>${esc(val.v)}</v></c>`;
        return `<c r="${a}">${fx}${val.v !== undefined ? `<v>${val.v}</v>` : ""}</c>`;
      }).join("");
      return `<row r="${r}"${hidden.has(r) ? ' hidden="1"' : ""}>${cs}</row>`;
    }).join("");
    files.push([`xl/worksheets/sheet${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`]);
  });
  return zipStore(files);
}
