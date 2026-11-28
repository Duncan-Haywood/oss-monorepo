// Skonto in XRechnung: the creator's example invoice (generate.mjs) with the payment terms
// (BT-20) written one way at a time. It measures which forms the official KoSIT rule BR-DE-18
// refuses, which pass it although no buyer system can read them (only XR-013 sees those), and
// that the creator now keeps the line break BR-DE-18 needs after a Skonto line.
//
//   node skonto-bench.mjs          # prints the table; the official column needs
//                                  # `npm i --no-save slimdom fontoxpath`, else n/a
//
// Each variant is put into the file byte for byte (the "file" columns), and separately typed
// into the creator's `terms` field (the "creator" column). An observation about generated
// files, not a legal validity claim.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { generateInvoice } from "./generate.mjs";
import { isBlocking, preflightDocuments } from "./report.mjs";

const DRAFT = new URL("./examples/draft-invoice.json", import.meta.url);
const draft = () => JSON.parse(readFileSync(DRAFT, "utf8"));

/** [label, BT-20 text]. The first five are correct XRechnung Skonto. */
export const VARIANTS = [
  ["richtig", "#SKONTO#TAGE=10#PROZENT=2.00#\n"],
  ["richtig, mit Basisbetrag", "#SKONTO#TAGE=10#PROZENT=2.00#BASISBETRAG=300.00#\n"],
  ["richtig, zwei Staffeln", "#SKONTO#TAGE=10#PROZENT=3.00#\n#SKONTO#TAGE=20#PROZENT=2.00#\n"],
  ["richtig, unter einem Text", "Zahlbar innerhalb 30 Tagen\n#SKONTO#TAGE=10#PROZENT=2.00#\n"],
  ["richtig, Windows-Zeilenende", "#SKONTO#TAGE=10#PROZENT=2.00#\r\n"],
  ["kein Zeilenumbruch am Ende", "#SKONTO#TAGE=10#PROZENT=2.00#"],
  ["Dezimalkomma (2,00)", "#SKONTO#TAGE=10#PROZENT=2,00#\n"],
  ["Kleinbuchstaben", "#skonto#tage=10#prozent=2.00#\n"],
  ["eine Nachkommastelle (2.0)", "#SKONTO#TAGE=10#PROZENT=2.0#\n"],
  ["ohne Nachkommastellen (2)", "#SKONTO#TAGE=10#PROZENT=2#\n"],
  ["mit Prozentzeichen", "#SKONTO#TAGE=10#PROZENT=2.00%#\n"],
  ["Leerzeichen", "#SKONTO# TAGE=10 #PROZENT=2.00#\n"],
  ["zwei Staffeln in einer Zeile", "#SKONTO#TAGE=10#PROZENT=3.00##SKONTO#TAGE=20#PROZENT=2.00#\n"],
  ["schließendes # fehlt", "#SKONTO#TAGE=10#PROZENT=2.00\n"],
  ["führendes # fehlt", "SKONTO#TAGE=10#PROZENT=2.00#\n"],
  ["nur in Worten", "2 % Skonto bei Zahlung innerhalb von 10 Tagen"],
];

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\r/g, "&#13;");
const ids = (report) => report.errors.map((f) => (isBlocking(f) ? f.rule : `${f.rule} (${f.severity})`));

async function check(xml, schematron) {
  const report = (await preflightDocuments([{ name: "x.xml", source: xml }], { profile: "xrechnung", schematron })).reports[0];
  if (schematron && (!report.schematron || report.schematron === "unavailable")) return null;
  return ids(report);
}

/** For each variant and syntax: built-in findings, official findings, the creator's file's findings. */
export async function skontoTable({ schematron = true } = {}) {
  const rows = [];
  for (const format of ["ubl", "cii"]) {
    for (const [label, terms] of VARIANTS) {
      const d = draft();
      d.terms = "BT20PLACEHOLDER";
      const placed = generateInvoice(d, { format, profile: "xrechnung" }).xml.replace("BT20PLACEHOLDER", escape(terms));
      const typed = draft();
      typed.terms = terms;
      const made = generateInvoice(typed, { format, profile: "xrechnung" });
      rows.push({
        format,
        label,
        builtin: await check(placed, false),
        official: schematron ? await check(placed, true) : null,
        creator: made.ok ? (schematron ? await check(made.xml, true) : await check(made.xml, false)) : "refused",
      });
    }
  }
  return rows;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const show = (c) => (c === null ? "n/a" : typeof c === "string" ? c : c.join(", ") || "keine");
  console.log("syntax | BT-20 | built-in | built-in + official | creator's file");
  for (const r of await skontoTable()) console.log(`${r.format} | ${r.label} | ${show(r.builtin)} | ${show(r.official)} | ${show(r.creator)}`);
}
