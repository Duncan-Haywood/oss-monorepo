import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readStatement } from "./bank.mjs";

const read = (f) => readStatement(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));
const view = (r) => r.rows.map((x) => [x.date, x.cents, x.desc]);

test("Sparkasse CSV: the payee is kept next to the purpose text", () => {
  const r = read("sparkasse-de.csv");
  assert.deepEqual(view(r), [["2026-03-02", -125000, "Hausverwaltung GmbH - Miete Maerz"], ["2026-03-05", 340050, "Kunde AG - Rechnung 1042"]]);
  assert.deepEqual(r.problems, []);
});

test("DKB CSV: account line above the header, payee column joins the purpose", () => {
  const r = read("dkb-de.csv");
  assert.deepEqual(view(r), [["2026-03-02", -3999, "Vodafone - Rechnung"], ["2026-03-05", 340050, "Kunde AG - Re 1042"]]);
});

test("Deutsche Bank style Soll/Haben: payee on money out, payer on money in; Valuta is a date, not a currency", () => {
  const r = read("deutsche-bank-de.csv");
  assert.deepEqual(view(r), [["2026-03-02", -3999, "Vodafone - Rechnung"], ["2026-03-05", 340050, "Kunde AG - Re 1042"]]);
  assert.deepEqual(r.problems, [], "no false 'mixes currencies' from the Valuta date column");
});

test("a real second currency in a Waehrung column is still flagged", () => {
  const t = readFileSync(new URL("./fixtures/deutsche-bank-de.csv", import.meta.url), "utf8").replace("39,99;;EUR", "39,99;;USD");
  assert.ok(readStatement(t).problems.some((p) => /mixes currencies/.test(p)));
});
