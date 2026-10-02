import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseInvoices, analyze, summarize } from "./engine.mjs";

const fixture = readFileSync(new URL("./fixtures/invoices.csv", import.meta.url), "utf8");

test("parses client,amount and client,date,amount, quoted names and amounts, credit notes", () => {
  const two = parseInvoices("Acme,100\nBeta,50.5\nbad");
  assert.equal(two.length, 2);
  assert.equal(two.skipped, 1);
  const three = parseInvoices('Client,Date,Amount\n"Acme, Inc.",2026-01-31,"$1,200.00"\nAcme  Inc,3/5/2026,(200)');
  assert.equal(three[0].client, "Acme, Inc.");
  assert.equal(three[0].amount, 1200);
  assert.equal(three[1].amount, -200);
  assert.equal(three[1].date, Date.UTC(2026, 2, 5));
  assert.equal(parseInvoices("x,2026-02-30,5")[0].date, null);
});

test("shares, Herfindahl and effective clients are plain arithmetic", () => {
  const r = analyze(parseInvoices("A,50\nB,30\nC,20"));
  assert.equal(r.top1, 0.5);
  assert.equal(r.top3, 1);
  assert.equal(r.hhi, 3800);
  assert.ok(Math.abs(r.effective - 1 / 0.38) < 1e-9);
  assert.equal(r.withoutTop, 50);
});

test("names merge case-insensitively and credit notes net out; net-negative clients are dropped", () => {
  const r = analyze(parseInvoices("Acme,100\nacme,100\nBeta,40\nBeta,-40\nGamma,100"));
  assert.equal(r.clients, 2);
  assert.equal(r.list[0].total, 200);
});

test("thresholds: below, warn, error", () => {
  const sev = (text) => analyze(parseInvoices(text)).findings.find((f) => f.rule === "single-client-dependence")?.severity;
  assert.equal(sev("A,10\nB,10\nC,10\nD,10\nE,10\nF,10\nG,10\nH,10"), undefined);
  assert.equal(sev("A,30\nB,10\nC,10\nD,10\nE,10\nF,10\nG,10\nH,10"), "warn");
  assert.equal(sev("A,45\nB,10\nC,9\nD,9\nE,9\nF,9\nG,9"), "error");
});

test("costs: gap without the top client is an error; covered is info", () => {
  const rows = "client,date,amount\nA,2026-01-10,5000\nA,2026-02-10,5000\nB,2026-01-15,2000\nB,2026-02-15,2000\nC,2026-01-20,1000\nD,2026-02-20,1000";
  const gap = analyze(parseInvoices(rows), { monthlyCosts: 5000 });
  assert.ok(gap.findings.some((f) => f.rule === "loses-money-without-top-client" && f.severity === "error"));
  const fine = analyze(parseInvoices(rows), { monthlyCosts: 1000 });
  assert.ok(fine.findings.some((f) => f.rule === "covers-costs-without-top-client"));
});

test("window keeps only the last N months of dated rows", () => {
  const r = analyze(parseInvoices("client,date,amount\nOld,2024-01-10,1000\nNew,2026-06-01,10\nNew,2026-06-20,10"));
  assert.equal(r.clients, 1);
  assert.equal(r.list[0].client, "New");
});

test("the worked example shows the headline finding (dogfooding)", () => {
  const r = analyze(parseInvoices(fixture), { monthlyCosts: 24000 });
  const rules = r.findings.map((f) => f.rule);
  for (const want of ["single-client-dependence", "concentration-rising", "loses-money-without-top-client"]) assert.ok(rules.includes(want), want);
  assert.equal(summarize(r).status, "error");
  assert.equal(r.list[0].client, "Northwind Logistics");
});

test("empty and junk input summarise as none", () => {
  assert.equal(summarize(analyze(parseInvoices(""))).status, "none");
  assert.equal(summarize(analyze(parseInvoices("junk"))).status, "none");
});
