import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, sampleReport, sampleBrokenReport, parseAmount, parseDate, parseMapping, defaultMapping, toXeroJournalCsv, toQboJournalCsv, toIif, journalsCsv, buildReport, parsePayouts, rowCategory, royaltySummary, uncategorisedRows } from "./calc.mjs";

const ok = () => validate(sampleReport());
const jr = (r, cur, period) => r.journals.find((j) => j.currency === cur && j.period === period);
const line = (j, cat) => j.lines.find((l) => l.category === cat);
const ONE = [["2026-09", "Spotify", "Song", "I1", 1000, 100, 0, "USD"], ["2026-09", "iTunes", "Song", "I1", 5, 60, 20, "USD"]];

test("the sample reconciles: every row total holds and every journal balances", () => {
  const r = ok();
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.ok(r.reconciliation.every((x) => x.agrees === true));
  for (const j of r.journals) assert.equal(j.lines.reduce((a, l) => a + l.debit - l.credit, 0), 0);
});

test("a history spanning a month end becomes one journal per month inside its own month", () => {
  const usd = ok().journals;
  assert.deepEqual(usd.map((j) => [j.period, j.date, j.currency]), [["2026-08", "2026-08-31", "USD"], ["2026-09", "2026-09-30", "USD"]]);
  assert.equal(jr(ok(), "USD", "2026-08").clearing, 6820);
  assert.equal(jr(ok(), "USD", "2026-09").clearing, 4825);
});

test("earnings are booked gross by kind of store and by store", () => {
  const aug = jr(ok(), "USD", "2026-08");
  assert.equal(aug.lines.filter((l) => l.category === "streaming").length, 3);
  assert.equal(line(aug, "download").credit, 540);
  assert.equal(line(aug, "social").credit, 1280);
  assert.match(line(aug, "download").memo, /iTunes/);
  const sep = jr(ok(), "USD", "2026-09");
  assert.equal(sep.lines.find((l) => /Spotify/.test(l.memo)).credit, 2940 + 1030);
});

test("songwriter royalties withheld are their own debit and the receivable is net", () => {
  const sep = jr(ok(), "USD", "2026-09");
  assert.equal(line(sep, "withheld").debit, 120);
  assert.equal(line(sep, "clearing").debit, 4825);
});

test("net mode adds the withheld amount back onto income and leaves the receivable unchanged", () => {
  const csv = "Sale Month,Store,Earnings (USD),Songwriter Royalties Withheld\n2026-09,Spotify,94.00,6.00\n";
  const sep = validate(csv), net = validate(csv, { withheldMode: "net" });
  assert.equal(sep.journals[0].clearing, 8800);
  assert.equal(net.journals[0].clearing, 9400);
  assert.equal(line(net.journals[0], "streaming").credit, 10000);
  assert.equal(line(net.journals[0], "withheld").debit, 600);
});

test("stores map loosely: downloads before streams, social and video apart, unknown stores reviewed", () => {
  assert.equal(rowCategory("Spotify"), "streaming");
  assert.equal(rowCategory("Apple Music"), "streaming");
  assert.equal(rowCategory("YouTube Music"), "streaming");
  assert.equal(rowCategory("Amazon Music"), "streaming");
  assert.equal(rowCategory("iTunes"), "download");
  assert.equal(rowCategory("Amazon MP3"), "download");
  assert.equal(rowCategory("TikTok"), "social");
  assert.equal(rowCategory("Instagram/Facebook"), "social");
  assert.equal(rowCategory("YouTube Content ID"), "social");
  assert.equal(rowCategory("Zorbo Radio"), "uncategorised");
  assert.equal(rowCategory(""), "uncategorised");
});

test("the summary gives gross by store and the withheld share of gross", () => {
  const s = ok().summaryByMarket;
  assert.equal(s.gross, 11765);
  assert.equal(s.withheld, 120);
  assert.ok(s.withheldShare > 0.0100 && s.withheldShare < 0.0105);
  assert.ok(s.rows.some((x) => x.market === "Spotify" && x.category === "streaming" && x.currency === "USD" && x.units === 21300));
  assert.equal(royaltySummary([]).withheldShare, null);
});

test("an altered row Total is an error naming the row and the difference", () => {
  const r = validate(sampleBrokenReport());
  const f = r.findings.find((x) => /does not match its own columns/.test(x.title));
  assert.match(f.title, /Total on Night Bus Home/);
  assert.match(f.detail, /off by 85\.30 USD/);
});

test("the broken sample names the altered total, the bad amount and the unknown store", () => {
  const r = validate(sampleBrokenReport());
  const titles = r.findings.map((x) => x.title).join("\n");
  assert.match(titles, /An amount on Salt Flats is not a number/);
  assert.match(titles, /1 item no rule recognised/);
  assert.match(titles, /Rows add up to .* but the report's total is/);
  assert.ok(r.reconciliation.some((x) => x.agrees === false));
});

test("an unrecognised store is journalled to uncategorised, never dropped", () => {
  const r = validate(sampleBrokenReport());
  const l = r.journals.flatMap((x) => x.lines).find((x) => x.category === "uncategorised");
  assert.equal(l.credit, 90);
  assert.match(l.memo, /Zorbo Radio/);
  assert.equal(uncategorisedRows(r.payouts).length, 1);
  assert.equal(uncategorisedRows(r.payouts)[0].units, 40);
});

test("a Total row that matches the rows reconciles and is not journalled as a row", () => {
  const r = validate(buildReport({ items: ONE, totalRow: true }));
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(r.summary.rows, 2);
  assert.equal(r.reconciliation[0].stated, 14000);
  assert.equal(r.reconciliation[0].agrees, true);
});

test("a Total row that disagrees with the rows is an error with the amount", () => {
  const r = validate(buildReport({ items: ONE, totalRow: true, totalOverride: { royalty: 20000 } }));
  assert.ok(r.findings.some((f) => f.severity === "error" && /Rows add up to 160\.00 USD but the Total row says 200\.00 USD \(royalty\)/.test(f.title)));
});

test("a dropped row breaks the Total row check", () => {
  const r = validate(buildReport({ items: ONE, totalRow: true, skip: [1] }));
  assert.ok(r.findings.some((f) => f.severity === "error" && /Total row says/.test(f.title)));
  assert.equal(r.reconciliation[0].agrees, false);
});

test("a Total row cannot be checked across currencies and the page says so", () => {
  const r = validate(buildReport({ items: [...ONE, ["2026-09", "Spotify", "Song", "I1", 1, 5, 0, "EUR"]], totalRow: true }));
  assert.ok(r.findings.some((f) => /Total row was found in a multi-currency file/.test(f.title)));
  assert.deepEqual([...new Set(r.journals.map((j) => j.currency))].sort(), ["EUR", "USD"]);
});

test("without any total, completeness cannot be proved and the page says so", () => {
  const csv = "Sale Month,Store,Earnings\n2026-09,Spotify,100.00\n";
  const r = validate(csv);
  assert.equal(r.reconciliation[0].agrees, null);
  assert.ok(r.findings.some((f) => /No Total column or Total row/.test(f.title)));
  assert.ok(r.findings.some((f) => /No currency in the file/.test(f.title)));
  assert.equal(r.journals[0].currency, "USD");
  assert.equal(validate(csv, { currency: "eur" }).journals[0].currency, "EUR");
});

test("an entered payment that differs from the rows is a warning", () => {
  const csv = buildReport({ items: ONE });
  assert.ok(validate(csv, { expected: 99999 }).findings.some((f) => /do not add up to the amount you entered/.test(f.title)));
  assert.ok(!validate(csv, { expected: 14000 }).findings.some((f) => /do not add up to the amount you entered/.test(f.title)));
});

test("split none keeps one journal per currency", () => {
  assert.equal(validate(sampleReport(), { split: "none" }).journals.length, 1);
});

test("amounts parse symbols, parentheses, US and European forms to cents", () => {
  assert.equal(parseAmount("12.34"), 1234);
  assert.equal(parseAmount("$1,234.56"), 123456);
  assert.equal(parseAmount("£12.00"), 1200);
  assert.equal(parseAmount("(12.00)"), -1200);
  assert.equal(parseAmount("-12,34"), -1234);
  assert.equal(parseAmount("1.234,56"), 123456);
  assert.equal(parseAmount(""), null);
  assert.ok(Number.isNaN(parseAmount("12..5")));
});

test("dates parse ISO, month-only values, month names and slashed per the chosen order", () => {
  assert.equal(parseDate("2026-09-28 12:00:00"), "2026-09-28");
  assert.equal(parseDate("2026-09"), "2026-09-30");
  assert.equal(parseDate("2026-02"), "2026-02-28");
  assert.equal(parseDate("September 2026"), "2026-09-30");
  assert.equal(parseDate("Sep 28, 2026"), "2026-09-28");
  assert.equal(parseDate("28.09.2026"), "2026-09-28");
  assert.equal(parseDate("09/28/2026"), "2026-09-28");
  assert.equal(parseDate("28/09/2026", "dmy"), "2026-09-28");
  assert.equal(parseDate("2026-13"), null);
  assert.equal(parseDate("31.02.2026"), null);
});

test("a file without the DistroKid columns is refused with a pointer to the right export", () => {
  const r = validate("name,total\nx,5\n");
  assert.equal(r.findings[0].severity, "error");
  assert.match(r.findings[0].detail, /Bank/);
});

test("tab-separated exports and a BOM are read", () => {
  const tsv = "﻿" + sampleReport().replace(/,/g, "\t");
  assert.ok(validate(tsv).reconciliation.every((x) => x.agrees === true));
});

test("quoted titles containing commas do not shift the columns", () => {
  const csv = buildReport({ items: [["2026-09", "Spotify", "Salt, Signal and Sea", "I1", 1, 10, 0, "USD"]] });
  const r = validate(csv);
  assert.equal(r.reconciliation[0].agrees, true);
  assert.equal(r.journals[0].clearing, 1000);
});

test("account mapping overrides names, reports bad lines, and reaches the exports", () => {
  const { mapping, errors } = parseMapping("withheld = 5100\nbogus = 1\nnot a line\n# note\nclearing = 1200");
  assert.equal(mapping.withheld, "5100");
  assert.equal(errors.length, 2);
  const j = validate(sampleReport(), { mapping }).journals;
  assert.match(toXeroJournalCsv(j), /,5100,Tax Exempt,/);
  assert.match(toIif(j), /\t1200\t/);
  assert.equal(defaultMapping().withheld, "Distributor Withholdings");
});

test("Xero export: debits positive, credits negative, balanced per journal", () => {
  const lines = toXeroJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*Narration,*Date,Description,*AccountCode,*TaxRate,*Amount");
  assert.ok(lines.slice(1).every((l) => /^DistroKid earnings 2026-\d\d \(USD\),/.test(l)));
  const by = {};
  for (const l of lines.slice(1)) { const c = l.split(","); by[c[0] + c[1]] = (by[c[0] + c[1]] || 0) + Number(c[c.length - 1]); }
  assert.equal(Object.keys(by).length, 2);
  for (const v of Object.values(by)) assert.ok(Math.abs(v) < 0.005);
});

test("QuickBooks Online export: debit and credit columns, journal numbers disambiguated by month, currency column set", () => {
  const lines = toQboJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*JournalNo,*JournalDate,*AccountName,Debits,Credits,Description,Name,Currency");
  assert.ok(lines.some((l) => /^DK-USD-2026-08,08\/31\/2026,Music Streaming Income,,31\.20,.*,,USD$/.test(l)));
});

test("IIF export: every transaction's lines sum to zero and end with ENDTRNS", () => {
  assert.equal(toIif(ok().journals).split("\r\nENDTRNS").length - 1, 2);
  for (const b of toIif(ok().journals).split("\r\nENDTRNS").slice(0, -1)) {
    const amounts = b.split("\r\n").filter((l) => /^(TRNS|SPL)\t/.test(l)).map((l) => Number(l.split("\t")[5]));
    assert.ok(Math.abs(amounts.reduce((a, x) => a + x, 0)) < 0.005);
  }
});

test("tabs and newlines in account names cannot break IIF rows", () => {
  const { mapping } = parseMapping("streaming = Bad\tName");
  assert.ok(!/Bad\tName/.test(toIif(validate(sampleReport(), { mapping }).journals)));
});

test("generic journals CSV carries currency, category and both columns", () => {
  assert.match(journalsCsv(ok().journals), /^group,period,date,currency,category,account,debit,credit,memo\r\n/);
});

test("parsePayouts on an empty string reports an error and does not throw", () => {
  assert.equal(parsePayouts("").findings[0].severity, "error");
});

test("a real-looking header with Reporting Date, Team Percentage and Country columns is read", () => {
  const tsv = ["Reporting Date\tSale Month\tStore\tArtist\tTitle\tISRC\tUPC\tQuantity\tTeam Percentage\tSong/Album\tCountry of Sale\tSongwriter Royalties Withheld\tEarnings (USD)",
    "2026-10-02\t2026-08\tSpotify\tHarbor Static\tNight Bus Home\tUSXX00000001\t\t9400\t100\tSong\tUS\t0\t31.2"].join("\n");
  const r = validate(tsv);
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(r.journals[0].period, "2026-08");
  assert.equal(r.journals[0].clearing, 3120);
});
