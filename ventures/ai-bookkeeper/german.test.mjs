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

// DKB's online banking changed in 2023 (layouts from the MIT beancount-dkb extractors' field lists, cloned at run time; rows made up).
test("DKB 2023 account export: Betrag (€), two-digit years, status, payee by direction", () => {
  const r = read("dkb-2023-giro.csv");
  assert.equal(r.bank, "dkb");
  assert.deepEqual(view(r), [["2023-06-15", -867, "EDEKA//MUENCHEN/DE - EDEKA SAGT DANKE"], ["2023-06-16", 120050, "Kunde AG - Rechnung 1042"]]);
  assert.ok(r.problems.some((p) => /Vorgemerkt/.test(p)), "the pending row is skipped and said so");
});

test("DKB 2023 credit-card export: Belegdatum is the date", () => {
  const r = read("dkb-2023-credit.csv");
  assert.equal(r.bank, "dkb-card");
  assert.deepEqual(view(r), [["2023-01-30", -2234, "Amazon EU"], ["2023-01-28", 10000, "Zahlung Danke"]]);
  assert.deepEqual(r.problems, []);
});
