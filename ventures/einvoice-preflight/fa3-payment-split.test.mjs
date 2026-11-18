// Totals on FA(3) advance, settlement and correcting invoices (PL-006..PL-009 on KOR, PL-023..PL-025).
// The amounts are the ones in the Polish Ministry of Finance's published FA(3) examples
// ("Przykładowe pliki dla struktury logicznej e-Faktury FA(3)", ksef.podatki.gov.pl); the files
// themselves are not copied here: each case is rebuilt on this repo's own clean example.
// eval/ksef-ministry-examples.mjs runs the Ministry's 26 files themselves.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkFa3, splitPayment } from "./fa3.mjs";

const clean = readFileSync(new URL("./examples/fa3-invoice.xml", import.meta.url), "utf8");

/** The clean example with its totals, RodzajFaktury and lines replaced. */
function build(kind, totals, tail) {
  const t = Object.entries(totals).map(([k, v]) => `<${k}>${v}</${k}>`).join("\n    ");
  return clean
    .replace(/<P_13_1>[\s\S]*?<P_15>1584.00<\/P_15>/, t)
    .replace(/<RodzajFaktury>VAT<\/RodzajFaktury>[\s\S]*?<\/Fa>/, `<RodzajFaktury>${kind}</RodzajFaktury>\n${tail}\n  </Fa>`);
}
const line = (nr, net, rate, before = false, qty = 1) =>
  `<FaWiersz><NrWierszaFa>${nr}</NrWierszaFa><P_7>Towar ${nr}</P_7><P_8A>szt.</P_8A><P_8B>${qty}</P_8B><P_9A>${(net / qty).toFixed(2)}</P_9A><P_11>${net.toFixed(2)}</P_11><P_12>${rate}</P_12>${before ? "<StanPrzed>1</StanPrzed>" : ""}</FaWiersz>`;
const orderLine = (nr, net, vat, rate, before = false) =>
  `<ZamowienieWiersz><NrWierszaZam>${nr}</NrWierszaZam><P_7Z>Pozycja ${nr}</P_7Z><P_8AZ>szt.</P_8AZ><P_8BZ>1</P_8BZ><P_9AZ>${net}</P_9AZ><P_11NettoZ>${net}</P_11NettoZ><P_11VatZ>${vat}</P_11VatZ><P_12Z>${rate}</P_12Z>${before ? "<StanPrzedZ>1</StanPrzedZ>" : ""}</ZamowienieWiersz>`;
const corrected = `<PrzyczynaKorekty>korekta</PrzyczynaKorekty><TypKorekty>1</TypKorekty>
<DaneFaKorygowanej><DataWystFaKorygowanej>2026-02-15</DataWystFaKorygowanej><NrFaKorygowanej>FZ/1</NrFaKorygowanej><NrKSeFN>1</NrKSeFN></DaneFaKorygowanej>`;
const order = (value, rows) => `<Zamowienie><WartoscZamowienia>${value}</WartoscZamowienia>${rows.join("")}</Zamowienie>`;
const run = (xml) => checkFa3(xml, { today: "2099-01-01" });
const rules = (xml) => run(xml).findings.map((f) => f.rule).sort();
const schemaClean = (xml) => assert.deepEqual(run(xml).findings.filter((f) => /^PL-01[2-7]$/.test(f.rule)), []);

// Example 10: an order of 375,150.00 gross, all at 23%; an advance of 20,000.00 received.
const zal = (totals, value = "375150") => build("ZAL", totals, order(value, [orderLine(1, "300000", "69000", "23"), orderLine(2, "5000", "1150", "23")]));

test("advance (ZAL): the payment split by the art. 106f formula passes; a wrong share is PL-023", () => {
  const ok = zal({ P_13_1: "16260.16", P_14_1: "3739.84", P_15: "20000" });
  schemaClean(ok);
  assert.deepEqual(run(ok), { findings: [], skipped: [] });
  // Tax at 23% of the advance (treating the payment as net) instead of 23/123 of it.
  assert.deepEqual(rules(zal({ P_13_1: "15400.00", P_14_1: "4600.00", P_15: "20000" })), ["PL-023", "PL-023"]);
});

test("advance (ZAL): the order's value must be its lines' net plus tax (PL-024), each line qty x price (PL-025)", () => {
  assert.deepEqual(rules(zal({ P_13_1: "16260.16", P_14_1: "3739.84", P_15: "20000" }, "305000")), ["PL-024"]);
  const xml = build("ZAL", { P_13_1: "16260.16", P_14_1: "3739.84", P_15: "20000" },
    order("375150", [orderLine(1, "300000", "69000", "23").replace("<P_8BZ>1</P_8BZ>", "<P_8BZ>2</P_8BZ>"), orderLine(2, "5000", "1150", "23")]));
  assert.deepEqual(rules(xml), ["PL-025"]);
});

// Example 11: the same advance corrected because one order line was 8%, not 23%.
const korZal = (totals) => build("KOR_ZAL", { ...totals }, `${corrected}<P_15ZK>20000</P_15ZK>` + order("375150", [
  orderLine(1, "300000", "69000", "23", true), orderLine(1, "341666.67", "27333.33", "8"),
  orderLine(2, "5000", "1150", "23", true), orderLine(2, "5000", "1150", "23"),
]));

test("advance correction (KOR_ZAL): after-split minus before-split, the Ministry's example 11 amounts", () => {
  const ok = korZal({ P_13_1: "-15993.60", P_14_1: "-3678.53", P_13_2: "18214.94", P_14_2: "1457.19", P_15: "0" });
  schemaClean(ok);
  assert.deepEqual(run(ok), { findings: [], skipped: [] });
  // Moving the whole advance to 8% ignores the 23% line that stayed.
  assert.deepEqual(rules(korZal({ P_13_1: "-16260.16", P_14_1: "-3739.84", P_13_2: "18518.52", P_14_2: "1481.48", P_15: "0" })),
    ["PL-023", "PL-023", "PL-023", "PL-023"]);
});

// Examples 14 and 18: the settlement of a 337,635.00 order (307,500 at 8%, 4,500 at 23%).
const rozLines = [line(1, 307500, "8"), line(2, 4500, "23")];

test("settlement (ROZ): the remainder split by each rate's gross share of the lines", () => {
  const ok = build("ROZ", { P_13_1: "4100.16", P_14_1: "943.04", P_13_2: "280177.59", P_14_2: "22414.21", P_15: "307635" }, rozLines.join(""));
  schemaClean(ok);
  assert.deepEqual(run(ok), { findings: [], skipped: [] });
  // Totals computed as if the whole order were still due, not the remainder.
  assert.deepEqual(rules(build("ROZ", { P_13_1: "4500.00", P_14_1: "1035.00", P_13_2: "280177.59", P_14_2: "22414.21", P_15: "308126.80" }, rozLines.join(""))),
    ["PL-023", "PL-023", "PL-023", "PL-023"]);
});

test("settlement correction (KOR_ROZ): the Ministry's example 18 amounts pass; the remainder must be stated before", () => {
  const rows = [line(1, 307500, "8", true), line(1, 307500, "8"), line(2, 4500, "23", true), line(2, 4500, "23")].join("");
  const totals = { P_13_1: "101.76", P_14_1: "23.41", P_13_2: "6953.54", P_14_2: "556.29", P_15: "7635" };
  const ok = build("KOR_ROZ", totals, `${corrected}<P_15ZK>300000</P_15ZK>${rows}`);
  schemaClean(ok);
  assert.deepEqual(run(ok), { findings: [], skipped: [] });
  const noBefore = run(build("KOR_ROZ", totals, `${corrected}${rows}`));
  assert.deepEqual(noBefore.findings, []);
  assert.match(noBefore.skipped.join(" "), /no P_15ZK/);
});

test("correction (KOR) with before and after rows: totals are after minus before; the pair may share a line number", () => {
  const rows = [line(1, 1626.01, "23", true), line(1, 1463.41, "23")].join("");
  const ok = build("KOR", { P_13_1: "-162.60", P_14_1: "-37.40", P_15: "-200" }, `${corrected}${rows}`);
  schemaClean(ok);
  assert.deepEqual(run(ok), { findings: [], skipped: [] });
  // Totals that forgot to subtract the before row.
  assert.deepEqual(rules(build("KOR", { P_13_1: "1463.41", P_14_1: "336.58", P_15: "1799.99" }, `${corrected}${rows}`)), ["PL-006"]);
  // Two after rows with one number is still a duplicate.
  assert.deepEqual(rules(build("KOR", { P_13_1: "-162.60", P_14_1: "-37.40", P_15: "-200" }, `${corrected}${rows}${line(1, 0, "23")}`)), ["PL-009"]);
});

test("correction by difference (KOR, one row per change) and a lineless period discount", () => {
  assert.deepEqual(rules(build("KOR", { P_13_1: "-162.60", P_14_1: "-37.40", P_15: "-200" }, `${corrected}${line(1, -162.6, "23")}`)), []);
  const period = run(build("KOR", { P_13_1: "-40650.41", P_14_1: "-9349.59", P_15: "-50000" }, corrected));
  assert.deepEqual(period.findings, []);
  assert.match(period.skipped.join(" "), /no lines/);
  assert.deepEqual(rules(build("KOR", { P_13_1: "-40650.41", P_14_1: "-9349.59", P_15: "-49000" }, corrected)), ["PL-008"]);
});

test("amounts are compared in grosze: a one-grosz gap from gross pricing passes (the Ministry's example 1)", () => {
  const xml = build("VAT", { P_13_1: "1666.66", P_14_1: "383.33", P_13_3: "0.95", P_14_3: "0.05", P_15: "2051" },
    [line(1, 1626.01, "23"), line(2, 40.65, "23"), line(3, 0.95, "5")].join(""));
  assert.deepEqual(rules(xml), []);
  assert.deepEqual(rules(xml.replace("<P_15>2051", "<P_15>2051.02")), ["PL-008"]);
});

test("simplified invoice (UPR): lines without amounts, or P_15 alone, are not faults (the Ministry's examples 15 and 16)", () => {
  const bare = "<FaWiersz><NrWierszaFa>1</NrWierszaFa><P_7>Wiertarka</P_7></FaWiersz>";
  assert.deepEqual(rules(build("UPR", { P_13_1: "365.85", P_14_1: "84.15", P_15: "450" }, bare)), []);
  const only = run(build("UPR", { P_15: "450" }, bare.replace("</P_7>", "</P_7><P_12>23</P_12>")));
  assert.deepEqual(only.findings, []);
  assert.match(only.skipped.join(" "), /UPR/);
});

test("splitPayment rounds the share, then the tax, per rate", () => {
  const s = splitPayment(20000, [["8", 341666.67, 27333.33], ["23", 5000, 1150]]);
  assert.equal(s.get("P_13_1").toFixed(2), "266.56");
  assert.equal(s.get("P_14_1").toFixed(2), "61.31");
  assert.equal(s.get("P_13_2").toFixed(2), "18214.94");
  assert.equal(s.get("P_14_2").toFixed(2), "1457.19");
  assert.equal(splitPayment(100, [["3", 10, null]]), null);
});
