// Reads Rio de Janeiro's Tabela de Códigos de Serviços (the six-digit service codes a Nota
// Carioca NFS-e writes in CodigoTributacaoMunicipio) into rio-service-codes-data.mjs.
//
// Sources (municipal acts are public law; the texts are read, the codes and descriptions kept):
//   base         Portaria F/SUBTF/CIS 256/2018 (DO-Rio 1 Aug 2018) as published, from
//                contabeis.com.br's copy of the act: 963 codes;
//   consolidated the same act as consolidated by normasbrasil.com.br, which marks what
//                Portaria SUBTF/CIS 269/2020 and FP/SUBEX/REC-RIO/CIS 282/2021 added and
//                FP/SUBEX/REC-RIO/CIS 286/2022 excluded (a second, independent copy of the base:
//                its 963 base texts match the first one's);
//   p321         Portaria CIS/F/REC-RIO 321/2025 (DO-Rio 18 Dec 2025, in force 1 Jan 2026), which
//                adds 30 codes and excludes 19.
//
//   node build-rio-codes.mjs                      (downloads the three pages)
//   RIO_PAGES=<dir> node build-rio-codes.mjs      (reads base.html, consolidated.html, p321.html)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PAGES = {
  base: "https://www.contabeis.com.br/legislacao/3776863/portaria-f-subtf-cis-256-2018/",
  consolidated: "https://www.normasbrasil.com.br/norma/portaria-256-2018-rio-de-janeiro_365678.html",
  p321: "https://www.normasbrasil.com.br/norma/portaria-321-2025-rio-de-janeiro_488072.html",
};

async function load(key) {
  let buf;
  if (process.env.RIO_PAGES) buf = readFileSync(join(process.env.RIO_PAGES, `${key}.html`));
  else {
    const r = await fetch(PAGES[key], { headers: { "user-agent": "Mozilla/5.0" } });
    if (!r.ok) throw new Error(`${key}: HTTP ${r.status}`);
    buf = Buffer.from(await r.arrayBuffer());
  }
  let html = buf.toString("utf8");
  if (html.includes("�")) html = buf.toString("latin1");
  const ent = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ordm: "º", ordf: "ª", ndash: "–", mdash: "—", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", deg: "°", sect: "§", hellip: "…" };
  const MARK = { acute: "\u0301", grave: "\u0300", circ: "\u0302", tilde: "\u0303", uml: "\u0308", cedil: "\u0327" };
  const named = (e) => ent[e.toLowerCase()] ?? (/^([A-Za-z])(acute|grave|circ|tilde|uml|cedil)$/.test(e) ? (e[0] + MARK[e.slice(1)]).normalize("NFC") : null);
  return withoutTags(withoutScripts(html).replace(/<br\s*\/?>|<\/p>|<\/tr>|<\/td>|<\/li>/gi, "\n"))
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => e[0] === "#" ? codePointOr(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : named(e) ?? m);
}

// Drop script and style elements. An end tag matches in any case and with whitespace before its
// `>` (`</script >`), and an element left open runs to the end of the page. The pass repeats
// until nothing changes, so a page that nests one tag inside another's name
// (`<scr<script></script>ipt>`) cannot rebuild an element the pass removed.
function withoutScripts(html) {
  let out = html;
  let prev;
  do {
    prev = out;
    out = out.replace(/<(script|style)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, "");
  } while (out !== prev);
  return out;
}

// Remove the remaining tags, repeated until none is left (`<<b>p>` cannot rebuild one).
function withoutTags(html) {
  let out = html;
  let prev;
  do {
    prev = out;
    out = out.replace(/<[^>]+>/g, "");
  } while (out !== prev);
  return out;
}

// A code starts a line or follows text; consolidated copies write one typo, "16.02.2005".
const CODE = /(?<![\d.])(\d{2})\.(\d{2})\.(?:20)?(\d{2})(?!\d)\s*[-–]\s*/g;
function table(text, from = 0, to = text.length) {
  const part = text.slice(from, to);
  const ms = [...part.matchAll(CODE)];
  const out = new Map();
  ms.forEach((m, i) => {
    const end = i + 1 < ms.length ? ms[i + 1].index : part.length;
    const desc = part.slice(m.index + m[0].length, end).replace(/\s+/g, " ").replace(/\s*(Receba noticias|--!?>|Página Inicial)[\s\S]*$/, "").trim();
    out.set(`${m[1]}.${m[2]}.${m[3]}`, desc);
  });
  return out;
}
const norm = (s) => s.replace(/\((?:Código )?(?:Acrescentado|Excluído)[^)]*\)\.?:?/gi, "").replace(/[\W_]+/g, "").toLowerCase();
const clip = (s) => { s = s.replace(/\s*\((?:Código )?(?:Acrescentado|Excluído)[^)]*\)\.?:?/gi, "").replace(/[;.]\s*(e)?$/, "").trim(); return s.length > 140 ? `${s.slice(0, 137).replace(/\s+\S*$/, "")} ...` : s; };

const baseText = await load("base");
const start = baseText.indexOf("TABELA DE CÓDIGOS DE SERVIÇOS");
if (start < 0) throw new Error("base: no annex heading");
const base = table(baseText, start);
if (base.size !== 963) throw new Error(`base: ${base.size} codes, expected 963`);

const consText = await load("consolidated");
const cons = table(consText, consText.indexOf("ANEXO") >= 0 ? consText.indexOf("ANEXO") : 0);
for (const [k, v] of base) {
  if (!cons.has(k)) throw new Error(`consolidated copy lacks base code ${k}`);
  if (norm(v).slice(0, 60) !== norm(cons.get(k)).slice(0, 60)) throw new Error(`${k}: the two copies' texts differ`);
}
// What the consolidated copy marks: additions (with the act) and 286/2022's exclusions.
const added = [], excluded286 = [];
for (const [k, v] of cons) {
  if (!base.has(k)) {
    const act = /269/.test(v) ? "269/2020" : /282/.test(v) ? "282/2021" : null;
    if (!act) throw new Error(`${k}: added by an act the build does not know: ${v.slice(0, 120)}`);
    added.push([k, act, v]);
  }
}
for (const m of consText.matchAll(/\(Excluído pela Portaria FP\/SUBEX\/REC-RIO\/CIS Nº 286 DE 08\/07\/2022\):\s*(\d{2}\.\d{2}\.\d{2})/g)) excluded286.push(m[1]);
if (excluded286.length !== 18) throw new Error(`286/2022: ${excluded286.length} exclusions marked, expected 18`);

const p321 = await load("p321");
const art1 = p321.slice(p321.indexOf("Art. 1º"), p321.indexOf("Art. 2º"));
const art2 = p321.slice(p321.indexOf("Art. 2º"), p321.indexOf("Art. 3º"));
const add321 = [...art1.matchAll(/(\d{2}\.\d{2}\.\d{2})\s*-\s*["“]?([^"”?]+)/g)].map((m) => [m[1], m[2]]);
const del321 = [...art2.matchAll(/(\d{2}\.\d{2}\.\d{2})/g)].map((m) => m[1]);
if (add321.length !== 30 || del321.length !== 19) throw new Error(`321/2025: ${add321.length} added, ${del321.length} excluded; expected 30 and 19`);

// [code, description, from, to]: from/to are the first and last day the code was on the table
// ("" = since the 2018 table / still on it).
const FROM = { "269/2020": "2020-02-04", "282/2021": "2021-12-20", "321/2025": "2026-01-01" };
const rows = new Map();
for (const [k, v] of base) rows.set(k, [k, clip(v), "", ""]);
for (const [k, act, v] of added) rows.set(k, [k, clip(v), FROM[act], ""]);
for (const k of excluded286) { if (!rows.has(k)) throw new Error(`286: ${k} not on the table`); rows.get(k)[3] = "2022-07-13"; }
for (const [k, v] of add321) { if (rows.has(k) && !rows.get(k)[3]) throw new Error(`321: ${k} already on the table`); rows.set(k, [k, clip(v), FROM["321/2025"], ""]); }
for (const k of del321) { if (!rows.has(k)) throw new Error(`321: ${k} not on the table`); rows.get(k)[3] = "2025-12-31"; }
const all = [...rows.values()].sort((a, b) => a[0].localeCompare(b[0]));

const header = `// Generated by build-rio-codes.mjs; do not edit, rebuild.
// Rio de Janeiro's Tabela de Códigos de Serviços (Portaria F/SUBTF/CIS 256/2018 as amended by
// Portarias 269/2020, 282/2021, 286/2022 and 321/2025): code, description, first day, last day
// ("" = on the 2018 table / still on it), tab-separated.
export const SOURCE = "Portaria F/SUBTF/CIS 256/2018 (Rio de Janeiro) as amended to Portaria CIS/F/REC-RIO 321/2025";
export const COUNTS = ${JSON.stringify({ base: base.size, added: added.length + add321.length, excluded: excluded286.length + del321.length, rows: all.length })};
`;
writeFileSync(new URL("./rio-service-codes-data.mjs", import.meta.url), `${header}export default ${JSON.stringify(all.map((r) => r.join("\t")).join("\n"))};\n`);
console.log(`rio-service-codes-data.mjs: ${all.length} rows (${base.size} in 2018, ${added.length + add321.length} added, ${excluded286.length + del321.length} excluded)`);

// A character reference or escape past U+10FFFF (or not a number) becomes U+FFFD,
// as HTML parsers do, instead of throwing a RangeError on a stranger's input.
function codePointOr(n) { return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "\uFFFD"; }
