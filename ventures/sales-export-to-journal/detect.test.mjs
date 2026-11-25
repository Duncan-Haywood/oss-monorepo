import { test } from "node:test";
import assert from "node:assert/strict";
import { PLATFORMS, detect, convert, sampleReport, sampleBrokenReport, platform } from "./calc.mjs";

for (const p of PLATFORMS) {
  test(`${p.id}: its own sample report is detected as ${p.id} and balances`, () => {
    const text = sampleReport(p.id);
    const d = detect(text);
    assert.equal(d.id, p.id, JSON.stringify(d.ranked));
    const c = convert(text);
    assert.equal(c.platform.id, p.id);
    assert.ok(c.result.journals.length > 0);
    for (const j of c.result.journals) {
      const dr = j.lines.reduce((s, l) => s + (l.debit || 0), 0), cr = j.lines.reduce((s, l) => s + (l.credit || 0), 0);
      assert.equal(dr, cr, `${p.id} journal ${j.narration} balances`);
    }
  });

  test(`${p.id}: the broken sample still detects as ${p.id}`, () => {
    assert.equal(detect(sampleBrokenReport(p.id)).id, p.id);
  });

  // A month of a busy shop is hundreds of rows. The signature boost was a flat 400 points while every
  // kept row is worth ten, so a reader that half-understood a foreign file outscored the right one past
  // ~270 to ~460 rows (Shopify read as AdSense, Gumroad as KDP). 800 rows covers every old flip point.
  test(`${p.id}: an 800-row export still detects as ${p.id}`, () => {
    const [head, ...rest] = sampleReport(p.id).split(/\r?\n/);
    const body = rest.filter(Boolean), rows = [head];
    while (rows.length <= 800) rows.push(...body);
    const d = detect(rows.join("\n"));
    assert.equal(d.id, p.id, JSON.stringify(d.ranked.slice(0, 3)));
  });

  test(`${p.id}: forcing another platform does not silently use ${p.id}`, () => {
    const other = PLATFORMS.find((q) => q.id !== p.id);
    const c = convert(sampleReport(p.id), { platform: other.id });
    assert.equal(c.platform.id, other.id);
  });
}

test("garbage and empty input are refused, not guessed", () => {
  for (const t of ["", "hello world", "a,b,c\n1,2,3"]) {
    const c = convert(t);
    assert.equal(c.platform, null);
    assert.equal(c.findings[0].severity, "error");
  }
});

test("every platform ships a default mapping the hub can show", () => {
  for (const p of PLATFORMS) assert.ok(Object.keys(platform(p.id).engine.defaultMapping()).length > 3);
});

test("the hub and engines never touch the network", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const files = ["calc.mjs", ...readdirSync(new URL("./engines/", import.meta.url)).map((f) => `engines/${f}`)];
  for (const f of files) assert.doesNotMatch(readFileSync(new URL(`./${f}`, import.meta.url), "utf8"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/, f);
});

// Fixes that reached the single-platform tools but, until sync-engines.mjs, not the hub. The rows are
// the tools' own hand-checked fixtures (gumroad-sales-to-journal and square-sales-to-journal calc.test.mjs).
const sumOf = (j, cat) => j.lines.filter((l) => l.category === cat).reduce((a, l) => a + (l.debit || 0) - (l.credit || 0), 0);

test("Gumroad's real payout CSV (Sale Price incl. shipping, Totals row) is read as Gumroad and agrees", () => {
  const csv = "Type,Date,Purchase ID,Item Name,Buyer Name,Buyer Email,Taxes ($),Shipping ($),Sale Price ($),Gumroad Fees ($),Net Total ($)\n" +
    "Sale,2026-10-02,s1,Zine,A,a@x,0,5.00,34.00,3.90,30.10\n" +
    "Sale,2026-10-03,s2,Course,B,b@x,0,0,149.00,15.40,133.60\n" +
    "Full Refund,2026-10-05,s1,Zine,A,a@x,0,-5.00,-34.00,-3.90,-30.10\n" +
    "Subtotal - activity paid out by Gumroad,,,,,,0,0,149.00,15.40,133.60\n" +
    "Totals,,,,,,0,0,149.00,15.40,133.60\n";
  const c = convert(csv);
  assert.equal(c.platform.id, "gumroad", JSON.stringify(c.detection.ranked.slice(0, 3)));
  assert.equal(c.findings.filter((f) => f.severity === "error").length, 0, JSON.stringify(c.findings));
  assert.equal(c.result.reconciliation[0].agrees, true);
  assert.equal(sumOf(c.result.journals[0], "shipping"), -500);
  assert.equal(sumOf(c.result.journals[0], "clearing"), 13360);
});

test("a Square export with cash and gift-card tenders is read as Square; the deposit is the card money only", () => {
  const csv = ["Date,Gross Sales,Discounts,Net Sales,Gift Card Sales,Tax,Tip,Partial Refunds,Total Collected,Card,Cash,Square Gift Card,Other Tender,Fees,Net Total,Payment ID,Deposit ID,Transaction Status",
    "2026-10-03,30.00,0.00,30.00,0.00,2.40,0.00,0.00,32.40,32.40,0.00,0.00,0.00,-1.13,31.27,P1,D200,Complete",
    "2026-10-04,10.00,0.00,10.00,0.00,0.80,0.00,0.00,10.80,0.00,10.80,0.00,0.00,0.00,10.80,P2,,Complete",
    "2026-10-05,20.00,0.00,20.00,0.00,1.60,0.00,0.00,21.60,0.00,0.00,21.60,0.00,0.00,21.60,P3,,Complete"].join("\n");
  const c = convert(csv);
  assert.equal(c.platform.id, "square");
  const j = c.result.journals[0];
  assert.equal(sumOf(j, "cash"), 1080);
  assert.equal(sumOf(j, "giftredeemed"), 2160);
  assert.equal(sumOf(j, "clearing"), 3127); // before the sync the hub put 63.67 through Square Clearing
  assert.equal(c.result.deposits.find((d) => d.id === "D200").net, 3127);
});
