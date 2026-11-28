// Leitweg-ID prüfen: the creator's example XRechnung (generate.mjs) with the buyer reference
// (BT-10) carrying a Leitweg-ID, and one common mistake put in at a time. It measures what
// leitweg-id-pruefen.html says: which mistakes the official XRechnung rules catch, which only
// the check digits catch, and which nothing catches.
//
//   node leitweg-id-bench.mjs          # prints the table quoted on the page
//
// Two checks per file, both with the XRechnung profile:
//   built-in   the preflight's own rules (XR-001 missing buyer reference, XR-002 Leitweg-ID
//              check digits, and the rest). Always runs.
//   official   the published EN 16931 (CEN) and XRechnung (KoSIT) Schematron, picked by the
//              file's own specification identifier (BT-24). Runs only when slimdom and
//              fontoxpath are installed (`npm i --no-save slimdom fontoxpath`); otherwise null.
//
// The Leitweg-ID 04011000-12345-03 is the example draft's, made up, with valid check digits.
// An observation about generated files, not a legal validity claim.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { generateInvoice } from "./generate.mjs";
import { leitwegCheckDigitsValid, looksLikeLeitwegId } from "./profile.mjs";
import { isBlocking, preflightDocuments } from "./report.mjs";

export const DRAFT = new URL("./examples/draft-invoice.json", import.meta.url);
export const draft = () => JSON.parse(readFileSync(DRAFT, "utf8"));
export const GOOD = "04011000-12345-03";

/** One mistake at a time. Labels are the page's (German); `id` is what ends up in BT-10. */
export const MISTAKES = [
  ["richtig übernommen", (d) => { d.buyer_reference = GOOD; }],
  ["zwei Ziffern vertauscht (04011000-12354-03)", (d) => { d.buyer_reference = "04011000-12354-03"; }],
  ["eine Ziffer falsch (04011000-12346-03)", (d) => { d.buyer_reference = "04011000-12346-03"; }],
  ["Bindestrich verschoben (0401100-012345-03)", (d) => { d.buyer_reference = "0401100-012345-03"; }],
  ["Prüfziffer vergessen (04011000-12345)", (d) => { d.buyer_reference = "04011000-12345"; }],
  ["ohne Bindestriche (040110001234503)", (d) => { d.buyer_reference = "040110001234503"; }],
  ["Leerzeichen statt Bindestrich (04011000 12345 03)", (d) => { d.buyer_reference = "04011000 12345 03"; }],
  ["mit Vorsatz (Leitweg-ID: 04011000-12345-03)", (d) => { d.buyer_reference = "Leitweg-ID: 04011000-12345-03"; }],
  ["die Bestellnummer statt der Leitweg-ID (PO-77)", (d) => { d.buyer_reference = "PO-77"; }],
  ["gar keine Käuferreferenz", (d) => { delete d.buyer_reference; }],
  ["eine gültige, aber fremde Leitweg-ID (991-12345-73)", (d) => { d.buyer_reference = "991-12345-73"; }],
];

function split(findings) {
  const blocking = findings.filter(isBlocking).map((f) => f.rule);
  const other = findings.filter((f) => !isBlocking(f)).map((f) => `${f.rule} (${f.severity})`);
  return { blocking, other };
}

async function check(xml) {
  const profile = "xrechnung";
  const builtin = (await preflightDocuments([{ name: "x.xml", source: xml }], { profile })).reports[0];
  const withOfficial = (await preflightDocuments([{ name: "x.xml", source: xml }], { profile, schematron: true })).reports[0];
  const ran = withOfficial.schematron && withOfficial.schematron !== "unavailable";
  const builtinIds = new Set(builtin.errors.map((f) => f.rule));
  return {
    builtin: split(builtin.errors),
    official: ran ? split(withOfficial.errors.filter((f) => !builtinIds.has(f.rule) || f.source)) : null,
  };
}

/** For each mistake: what lands in BT-10, its shape and check digits, and both checks' findings. */
export async function mistakeTable() {
  const rows = [];
  for (const [label, apply] of MISTAKES) {
    const d = draft();
    apply(d);
    const out = generateInvoice(d, { format: "ubl", profile: "xrechnung" });
    if (!out.ok) throw new Error(`${label}: the creator refused the draft`);
    const id = d.buyer_reference ?? "";
    rows.push({
      label,
      id,
      shape: looksLikeLeitwegId(id),
      checkDigits: id ? leitwegCheckDigitsValid(id) : false,
      result: await check(out.xml),
    });
  }
  return rows;
}

/**
 * Every single-character typo of the example id, counted: each digit replaced by each other
 * digit, and each pair of neighbouring digits swapped (where they differ). How many still
 * pass the MOD 97-10 check digits?
 */
export function typoCounts(id = GOOD) {
  const chars = [...id];
  const positions = chars.map((c, i) => (/\d/.test(c) ? i : -1)).filter((i) => i >= 0);
  const out = { substitutions: 0, substitutionsPassing: 0, swaps: 0, swapsPassing: 0 };
  for (const i of positions) {
    for (let d = 0; d <= 9; d++) {
      if (String(d) === chars[i]) continue;
      const t = [...chars];
      t[i] = String(d);
      out.substitutions++;
      if (leitwegCheckDigitsValid(t.join(""))) out.substitutionsPassing++;
    }
  }
  for (const i of positions) {
    const j = i + 1;
    if (!positions.includes(j) || chars[i] === chars[j]) continue;
    const t = [...chars];
    [t[i], t[j]] = [t[j], t[i]];
    out.swaps++;
    if (leitwegCheckDigitsValid(t.join(""))) out.swapsPassing++;
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const show = (c) => (c ? [...c.blocking, ...c.other].join(", ") || "keine" : "n/a");
  console.log("mistake | BT-10 | shape | check digits | built-in | official");
  for (const r of await mistakeTable()) {
    console.log(`${r.label} | ${r.id} | ${r.shape} | ${r.checkDigits} | ${show(r.result.builtin)} | ${show(r.result.official)}`);
  }
  console.log("\ntypos of", GOOD, typoCounts());
}
