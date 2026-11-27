// Builds a small fillable PDF (an AcroForm) for tests: fields named by their fully qualified names,
// split on "." into a field tree the way real forms nest them ("1 Other .0.1.0"), each terminal
// with one widget on page 1. Written with a classic xref table, or an (unfiltered) xref stream.
export interface FixtureField {
  name: string;
  kind: "text" | "checkbox";
  maxLen?: number;
  /** A value already in the form, as a used form downloaded again would carry. */
  value?: string;
  /** Check box "on" state name. */
  on?: string;
}

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
const lit = (s: string) => `(${s.replace(/[\\()]/g, (c) => `\\${c}`)})`;

export function makeFormPdf(
  fields: FixtureField[],
  opts: { xrefStream?: boolean } = {},
): Uint8Array {
  const objs: string[] = []; // index = object number - 1
  const add = (body: string) => {
    objs.push(body);
    return objs.length;
  };
  const catalog = add(""); // 1
  const pages = add(""); // 2
  const page = add(""); // 3
  const helv = add("<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>");
  const offAp = add("<</Length 0>>\nstream\n\nendstream");
  const onAp = add("<</Length 0>>\nstream\n\nendstream");

  interface Node {
    part: string;
    num: number;
    kids: Map<string, Node>;
    field?: FixtureField;
  }
  const root: Node = { part: "", num: 0, kids: new Map() };
  for (const f of fields) {
    let n = root;
    for (const p of f.name.split(".")) {
      let k = n.kids.get(p);
      if (!k) {
        k = { part: p, num: add(""), kids: new Map() };
        n.kids.set(p, k);
      }
      n = k;
    }
    n.field = f;
  }
  const widgets: number[] = [];
  let y = 760;
  const fill = (n: Node, parent: number) => {
    const parentKey = parent ? `/Parent ${parent} 0 R` : "";
    if (n.field) {
      const f = n.field;
      const rect = `/Rect[20 ${y} 200 ${y + 12}]`;
      y = y > 30 ? y - 14 : 760;
      widgets.push(n.num);
      if (f.kind === "text") {
        const ml = f.maxLen !== undefined ? `/MaxLen ${f.maxLen}` : "";
        const v = f.value !== undefined ? `/V ${lit(f.value)}` : "";
        objs[n.num - 1] =
          `<</Type/Annot/Subtype/Widget/FT/Tx/T ${lit(n.part)}${parentKey}${rect}/P ${page} 0 R/DA (/Helv 0 Tf 0 g)${ml}${v}>>`;
      } else {
        const on = f.on ?? "Yes";
        const v = f.value ? `/V/${f.value}/AS/${f.value}` : "/AS/Off";
        objs[n.num - 1] =
          `<</Type/Annot/Subtype/Widget/FT/Btn/T ${lit(n.part)}${parentKey}${rect}/P ${page} 0 R/DA (/ZaDb 0 Tf 0 g)/AP<</N<</${on} ${onAp} 0 R/Off ${offAp} 0 R>>>>${v}>>`;
      }
      return;
    }
    const kids = [...n.kids.values()];
    objs[n.num - 1] =
      `<</T ${lit(n.part)}${parentKey}/Kids[${kids.map((k) => `${k.num} 0 R`).join(" ")}]>>`;
    for (const k of kids) fill(k, n.num);
  };
  const top = [...root.kids.values()];
  for (const k of top) fill(k, 0);

  objs[catalog - 1] =
    `<</Type/Catalog/Pages ${pages} 0 R/AcroForm<</Fields[${top.map((k) => `${k.num} 0 R`).join(" ")}]/DA (/Helv 0 Tf 0 g)/DR<</Font<</Helv ${helv} 0 R>>>>>>>>`;
  objs[pages - 1] = `<</Type/Pages/Kids[${page} 0 R]/Count 1>>`;
  objs[page - 1] =
    `<</Type/Page/Parent ${pages} 0 R/MediaBox[0 0 612 792]/Annots[${widgets.map((w) => `${w} 0 R`).join(" ")}]>>`;

  const parts: Uint8Array[] = [enc("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")];
  let pos = parts[0]?.length as number;
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    const chunk = enc(`${i + 1} 0 obj\n${body}\nendobj\n`);
    offsets.push(pos);
    parts.push(chunk);
    pos += chunk.length;
  });
  const xrefAt = pos;
  const size = objs.length + 1;
  if (opts.xrefStream) {
    const n = size; // the xref stream is the next object
    const rows = [[0, 0, 65535], ...offsets.map((o) => [1, o, 0]), [1, xrefAt, 0]];
    const data = new Uint8Array(rows.length * 7);
    rows.forEach(([t, o, g], i) => {
      const b = i * 7;
      data[b] = t as number;
      data[b + 1] = ((o as number) >>> 24) & 0xff;
      data[b + 2] = ((o as number) >>> 16) & 0xff;
      data[b + 3] = ((o as number) >>> 8) & 0xff;
      data[b + 4] = (o as number) & 0xff;
      data[b + 5] = ((g as number) >> 8) & 0xff;
      data[b + 6] = (g as number) & 0xff;
    });
    parts.push(
      enc(
        `${n} 0 obj\n<</Type/XRef/Size ${n + 1}/W[1 4 2]/Root ${catalog} 0 R/Length ${data.length}>>\nstream\n`,
      ),
      data,
      enc("\nendstream\nendobj\n"),
    );
  } else {
    let s = `xref\n0 ${size}\n0000000000 65535 f\r\n`;
    for (const o of offsets) s += `${String(o).padStart(10, "0")} 00000 n\r\n`;
    s += `trailer\n<</Size ${size}/Root ${catalog} 0 R>>\n`;
    parts.push(enc(s));
  }
  parts.push(enc(`startxref\n${xrefAt}\n%%EOF\n`));
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
