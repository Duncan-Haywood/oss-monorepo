// Clicks the page through in a real browser: the multi-account OFX flow
// (file picker -> one select per account -> Import) and the example load.
// Needs Playwright and a Chromium: `node eval/browser-click.mjs` (skips with
// exit 0 and a message when neither is installed). If `playwright` is not
// importable it tries PLAYWRIGHT_PATH (a file or a package directory) and then
// /opt/node-tools/node_modules/playwright, where cloud containers keep it.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
let chromium;
// playwright is not on the default import path in cloud containers; try the
// env override (a file or a package directory) and the known container path.
const { existsSync, statSync } = await import("node:fs");
const candidates = ["playwright", process.env.PLAYWRIGHT_PATH, "/opt/node-tools/node_modules/playwright", "playwright-core"].filter(Boolean).map((c) => {
  if (!c.startsWith("/") || !existsSync(c)) return c;
  return statSync(c).isDirectory() ? join(c, "index.mjs") : c;
});
for (const c of candidates) {
  try { ({ chromium } = await import(c.startsWith("/") ? "file://" + c : c)); break; } catch {}
}
if (!chromium) { console.log("skipped: playwright not installed"); process.exit(0); }
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json" };
const server = createServer(async (req, res) => {
  try {
    const p = join(root, req.url.split("?")[0] === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0]));
    const body = await readFile(p);
    res.writeHead(200, { "content-type": types[extname(p)] || "text/plain" }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed++; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(url);

check(await page.locator("#ofx-map").isHidden(), "account pickers hidden before a file is chosen");
await page.setInputFiles("#file", join(root, "fixtures/two-accounts.ofx"));
await page.locator("#ofx-map").waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
const selects = await page.locator("#ofx-map-rows select").count();
check(selects === 2, `two-accounts.ofx shows one picker per account (got ${selects})`);
console.log("     note:", await page.locator("#ofx-map-note").textContent());
for (let i = 0; i < selects; i++) {
  const opts = await page.locator(`#ofx-acct-${i} option`).evaluateAll((o) => o.map((x) => x.value));
  check(opts.length >= 2, `picker ${i} offers Leave out plus bank accounts (${opts.join(",")})`);
  if (opts.length >= 2) await page.selectOption(`#ofx-acct-${i}`, opts[Math.min(i + 1, opts.length - 1)]);
}
await page.click("#import");
await page.waitForFunction(() => /added across/.test(document.querySelector("#import-status").textContent), null, { timeout: 5000 }).catch(() => {});
const status = await page.locator("#import-status").textContent();
console.log("     status:", status);
check(/added across 2 accounts/.test(status), "import reports lines added across 2 accounts");
check(await page.locator("#ofx-map").isHidden(), "pickers hidden again after import");

// A Quicken QIF with two !Account sections splits per account too.
await page.setInputFiles("#file", join(root, "fixtures/two-accounts.qif"));
await page.locator("#ofx-map").waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
{
  const n = await page.locator("#ofx-map-rows select").count();
  check(n === 2, `two-accounts.qif shows one picker per account (got ${n})`);
  for (let i = 0; i < n; i++) {
    const opts = await page.locator(`#ofx-acct-${i} option`).evaluateAll((o) => o.map((x) => x.value));
    if (opts.length >= 2) await page.selectOption(`#ofx-acct-${i}`, opts[Math.min(i + 1, opts.length - 1)]);
  }
  await page.click("#import");
  await page.waitForFunction(() => /3 lines added across 2 accounts/.test(document.querySelector("#import-status").textContent), null, { timeout: 5000 }).catch(() => {});
  const st = await page.locator("#import-status").textContent();
  console.log("     status:", st);
  check(/3 lines added across 2 accounts/.test(st), "QIF import reports 3 lines across 2 accounts");
}

// A single-account OFX must not show pickers.
await page.setInputFiles("#file", join(root, "fixtures/checking.ofx"));
await page.waitForTimeout(300);
check(await page.locator("#ofx-map").isHidden(), "single-account OFX shows no pickers");

// A statement PDF (Chromium-printed fixture) is read in the tab and imported.
await page.setInputFiles("#file", join(root, "fixtures/statement-table.pdf"));
await page.click("#import");
await page.waitForFunction(() => /added to/.test(document.querySelector("#import-status").textContent), null, { timeout: 8000 }).catch(() => {});
{
  const st = await page.locator("#import-status").textContent();
  console.log("     status:", st);
  check(/7 lines added/.test(st) && /agrees with the statement's running balance/.test(st), "a statement PDF imports 7 lines and agrees with its running balance");
}

await page.click("#example");
await page.waitForFunction(() => /synthetic months/.test(document.querySelector("#import-status").textContent), null, { timeout: 5000 }).catch(() => {});
check(/synthetic months/.test(await page.locator("#import-status").textContent()), "example books load by click");

check((await page.locator("#nec").textContent()).trim().length > 0, "the 1099-NEC card renders (a table or a no-contractors note)");
{
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }).catch(() => null), page.click("#nec-filing-csv")]);
  check(!!dl && dl.suggestedFilename() === "contractors-1099-nec-filing-prep.csv", "the filing-prep button downloads the 1099-NEC CSV");
  if (dl) {
    const { readFile } = await import("node:fs/promises");
    const text = await readFile(await dl.path(), "utf8");
    check(text.startsWith("Tax year,Recipient name,Recipient TIN"), "the file has the form's box-name header");
  }
}
// Equipment register: add an asset, see it in the register, sell it.
await page.fill("#fa-name", "Laptop");
await page.fill("#fa-date", "2026-01-15");
await page.fill("#fa-cost", "1800");
await page.click("#fa-add");
await page.waitForFunction(() => /added/.test(document.querySelector("#fa-status").textContent), null, { timeout: 5000 }).catch(() => {});
check(/FA-1 Laptop added/.test(await page.locator("#fa-status").textContent()), "an asset is added to the register");
check((await page.locator("#fa-register").textContent()).includes("Laptop"), "the register table lists the asset");
await page.fill("#fa-date", "2026-03-10");
await page.fill("#fa-proceeds", "900");
await page.click('button[aria-label="Dispose of Laptop"]');
await page.waitForFunction(() => /disposed/.test(document.querySelector("#fa-status").textContent), null, { timeout: 5000 }).catch(() => {});
check(/FA-1 disposed on 2026-03-10/.test(await page.locator("#fa-status").textContent()), "the asset is sold");
check((await page.locator("#fa-register").textContent()).includes("Disposed 2026-03-10"), "the register shows it disposed");
// Tax depreciation: set a MACRS treatment on an asset and read the worksheet.
await page.fill("#fa-name", "Truck");
await page.fill("#fa-date", "2026-02-01");
await page.fill("#fa-cost", "10000");
await page.click("#fa-add");
await page.waitForFunction(() => /Truck added/.test(document.querySelector("#fa-status").textContent), null, { timeout: 5000 }).catch(() => {});
await page.selectOption("#tx-asset", "FA-2");
await page.fill("#tx-179", "1000");
await page.fill("#tx-year", "2026");
await page.click("#tx-set");
await page.waitForFunction(() => /MACRS 5-year/.test(document.querySelector("#tx-status").textContent), null, { timeout: 5000 }).catch(() => {});
check(/FA-2: MACRS 5-year, section 179 1,000.00/.test(await page.locator("#tx-status").textContent()), "a tax treatment is set");
const sheet = await page.locator("#tx-sheet").textContent();
check(sheet.includes("Truck") && sheet.includes("2,800.00"), "the worksheet shows 179 plus the first-year MACRS (2,800.00)");
// Opening balances: paste a trial balance that does not balance, set it, remove it.
await page.fill("#open-date", "2025-12-31");
await page.fill("#open-paste", "code,amount\n1000,5000.00\n2000,1200.00");
await page.click("#open-set");
await page.waitForFunction(() => /opening balances set/.test(document.querySelector("#open-status").textContent), null, { timeout: 5000 }).catch(() => {});
const ost = await page.locator("#open-status").textContent();
console.log("     status:", ost);
check(/3 opening balances set as of 2025-12-31/.test(ost) && /3,800.00 did not balance/.test(ost), "a trial balance is set and its plug to 3000 is reported");
check(await page.locator("#open-clear").isVisible(), "the remove button shows once balances are set");
await page.click("#open-clear");
check(/removed/.test(await page.locator("#open-status").textContent()), "opening balances are removed");
// Miles and home office: log a trip, set a home office, see lines 9 and 30 in the Schedule C table.
await page.fill("#trip-date", "2026-03-14");
await page.fill("#trip-miles", "100");
await page.fill("#trip-purpose", "Client visit");
await page.click("#trip-add");
check(/Added 100 miles/.test(await page.locator("#deduct-status").textContent()), "a trip is logged");
await page.fill("#ho-sqft", "150");
await page.click("#ho-set");
const dtext = await page.locator("#deduct").textContent();
console.log("     deduct:", dtext.slice(0, 160));
check(/100 business miles/.test(dtext) && /home office 150 sq ft/.test(dtext), "the card shows miles and home office");
const sctext = await page.locator("#schedc").textContent();
check(/Car and truck/i.test(sctext) && /Home office|business use of your home/i.test(sctext), "Schedule C table carries the mileage line");
await page.click("text=Remove 2026-03-14");
check(/0 business miles/.test(await page.locator("#deduct").textContent()), "a trip is removed");
await page.fill("#ho-sqft", "0");
await page.click("#ho-set");
// Prepaid expenses: register a 12-month policy on the example books and read the register.
await page.fill("#pp-name", "Liability policy");
await page.fill("#pp-date", "2026-01-01");
await page.fill("#pp-amount", "2400.00");
await page.fill("#pp-months", "12");
await page.click("#pp-add");
check(/PP-1 Liability policy added/.test(await page.locator("#pp-status").textContent()), "a prepaid item is registered");
const pptext = await page.locator("#pp-register").textContent();
check(/2,?400\.00/.test(pptext) && /Still paid ahead/.test(pptext), "the prepaid register shows the amount and what is still ahead");
await page.fill("#pp-months", "1");
await page.click("#pp-add");
check(/Months must be/.test(await page.locator("#pp-status").textContent()), "a one-month prepaid is refused");
// Stock: buy 100 for 450, sell 40, then selling more than is on hand is refused.
await page.selectOption("#iv-kind", "buy");
await page.fill("#iv-sku", "MUG-BLUE");
await page.fill("#iv-date", "2026-01-05");
await page.fill("#iv-qty", "100");
await page.fill("#iv-amount", "450.00");
await page.click("#iv-add");
check(/INV-1 recorded/.test(await page.locator("#iv-status").textContent()), "a stock purchase is recorded");
await page.selectOption("#iv-kind", "sell");
await page.fill("#iv-date", "2026-01-20");
await page.fill("#iv-qty", "40");
await page.click("#iv-add");
const ivtext = await page.locator("#iv-register").textContent();
check(/MUG-BLUE/.test(ivtext) && /270\.00/.test(ivtext) && /180\.00/.test(ivtext), "the stock register shows 60 left worth 270.00 and 180.00 cost of goods sold");
await page.fill("#iv-qty", "500");
await page.click("#iv-add");
check(/only 60 on hand/.test(await page.locator("#iv-status").textContent()), "selling more than is on hand is refused");
// Loans: add a 36-month loan on the example books, read the register, split nothing (no matching bank line), refuse a bad rate.
await page.fill("#ln-name", "Van loan");
await page.fill("#ln-amount", "12000.00");
await page.fill("#ln-rate", "6.5");
await page.fill("#ln-months", "36");
await page.fill("#ln-first", "2026-02-01");
await page.click("#ln-add");
check(/LN-1 Van loan added: payment 367\.\d\d/.test(await page.locator("#ln-status").textContent()), "a loan is added with its level payment");
const lntext = await page.locator("#ln-register").textContent();
check(/12,?000\.00 at 6\.5%/.test(lntext) && /0 of 36/.test(lntext), "the loan register shows terms and no payments split");
await page.click("#ln-apply");
check(/No unfiled bank payment matches/.test(await page.locator("#ln-status").textContent()), "no bank line matches a scheduled payment, so none is split");
await page.fill("#ln-rate", "250");
await page.click("#ln-add");
check(/Rate is an annual percentage/.test(await page.locator("#ln-status").textContent()), "a 250% rate is refused");
// Bill-pay planner: the example books hold no bills, so the card says so.
await page.click("#bp-plan");
check(/No open bills/.test(await page.locator("#bp-status").textContent()), "the bill-pay card says so when there are no open bills");
// Same card with real open bills: three bills loaded from the invoices-and-bills card, due on the last example day and just after.
const lastDay = await page.evaluate(() => { const m = document.body.textContent.match(/\b20\d\d-\d\d-\d\d\b/g) || []; return m.sort().at(-1); });
const plus = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
await page.fill("#docs-paste", `type,number,date,due,party,amount,account\nbill,B-1,${plus(lastDay, -20)},${plus(lastDay, 3)},Acme Supply,300.00,6100\nbill,B-2,${plus(lastDay, -10)},${plus(lastDay, 10)},Print Shop,150.00,6100\nbill,B-3,${plus(lastDay, -5)},${plus(lastDay, 20)},Landlord,9999999.00,6100\n`);
await page.click("#docs-load");
await page.fill("#bp-reserve", "100");
await page.click("#bp-plan");
const bptext = await page.locator("#bp-result").textContent();
console.log("     bill plan:", bptext.slice(0, 300), "|", await page.locator("#bp-status").textContent());
check(/B-1/.test(bptext) && /B-2/.test(bptext) && /B-3/.test(bptext), "the plan lists each open bill");
check(/cannot fit/.test(bptext), "a bill larger than any cash on hand is reported as one that cannot fit");
check(/lowest balance/.test(await page.locator("#bp-status").textContent()), "the plan states the lowest balance");
// Supplier terms on the same card: a discount for Acme Supply and a malformed line.
await page.fill("#bp-terms", "Acme Supply, 2, 30, 5");
await page.click("#bp-plan");
check(/early-payment discount .* taken|late fee about/.test(await page.locator("#bp-result").textContent()), "supplier terms show a discount taken or a late fee in the plan");
await page.fill("#bp-terms", "Acme Supply, lots");
await page.click("#bp-plan");
check(/Supplier terms line 1/.test(await page.locator("#bp-status").textContent()), "a malformed terms line is refused");
await page.fill("#bp-terms", "");
// Budget against actual: set a monthly budget on the example books and read the table.
await page.selectOption("#budget-account", { index: 0 });
await page.fill("#budget-amount", "50.00");
await page.click("#budget-set");
check(/Budget set: 50.00 a month/.test(await page.locator("#budget-status").textContent()), "a monthly budget is set");
const btext = await page.locator("#budget").textContent();
// Receipts: paste two receipts onto the example books, one of which has a bank line.
await page.fill("#receipts-text", "Hiscox Insurance\n2026-01-01\nTotal 48.00\n---\nCorner Cafe\n01/03/2026\nTotal 12.40");
await page.click("#receipts-read");
const rtext = await page.locator("#receipts").textContent();
check(/2 receipts on file: 1 matched, 1 without a bank line/.test(rtext), "receipts are read and one is paired with its bank line");
check(/HISCOX/.test(rtext) && /Corner Cafe/.test(rtext) && /with no receipt/.test(rtext), "the receipt tables and the missing-receipt list show");
// Split a matched receipt by its items: Hiscox on 2026-01-01 is a 48.00 insurance line; a second receipt with two kinds of item is added.
await page.click("#receipts-clear");
await page.fill("#receipts-text", "Hiscox Insurance\n2026-01-01\nLiability policy insurance 40.00\nCafe lunch 8.00\nTotal 48.00");
await page.click("#receipts-read");
const splitBtn = page.getByRole("button", { name: /Split Hiscox.* by items/ });
check((await splitBtn.count()) === 1, "a matched receipt with items of two kinds offers a split");
if (await splitBtn.count()) { await splitBtn.click(); check(/Split Hiscox/.test(await page.locator("#receipts-status").textContent()), "the split button posts the split"); }
check(/Net profit/.test(btext) && /(better|worse|on budget)/.test(btext), "the budget table shows a status and the net line");
// Processor payouts: a Shopify-layout report that matches no bank line is planned, then a bad file is refused.
await page.fill("#po-paste", "Transaction Date,Type,Amount,Fee,Net,Payout Date,Payout ID\n2026-03-01,charge,100.00,3.20,96.80,2026-03-04,111\n");
await page.click("#po-plan");
const potext = await page.locator("#po-result").textContent();
check(/111/.test(potext) && /not matched/.test(potext), "a payout report is read and shown with its unmatched payout");
// PayPal and Square layouts: each is read from a paste and shown in the card.
await page.fill("#po-paste", "Date,Time,Type,Status,Gross,Fee,Net,Transaction ID\n03/01/2026,10:00:00,Website Payment,Completed,100.00,-3.00,97.00,T1\n03/04/2026,09:00:00,General Withdrawal,Completed,-97.00,0.00,-97.00,W1\n");
await page.click("#po-plan");
check(/W1/.test(await page.locator("#po-result").textContent()), "a PayPal activity paste is grouped under its withdrawal");
await page.fill("#po-paste", "Payout ID,Payout Date,Payment ID,Payment Date,Type,Gross Sales,Fees,Net Total\nsq9,2026-03-05,p1,2026-03-03,Card,100.00,-3.20,96.80\n");
await page.click("#po-plan");
check(/sq9/.test(await page.locator("#po-result").textContent()), "a Square payout paste is read and shown");
await page.fill("#po-paste", "nonsense\n1\n");
await page.click("#po-plan");
check(/column|payout id/i.test(await page.locator("#po-status").textContent()), "a report with no payout columns is refused");
// Reconcile to a paper statement: a wrong balance names a difference; the books' own balance then agrees.
await page.selectOption("#recon-account", "1000");
await page.fill("#recon-date", "2026-12-31");
await page.fill("#recon-balance", "1.00");
await page.click("#recon-check");
const rc1 = await page.locator("#recon").textContent();
console.log("     recon:", rc1.slice(0, 160));
check(/Difference/.test(rc1) && /statement 1\.00/.test(rc1), "a wrong closing balance reports a difference");
const bookBal = /books ([\d,.-]+),/.exec(rc1)?.[1];
await page.fill("#recon-balance", bookBal.replace(/,/g, ""));
await page.click("#recon-check");
check(/They agree/.test(await page.locator("#recon").textContent()), "typing the books' own balance agrees");
await page.fill("#recon-balance", "abc");
await page.click("#recon-check");
check(/closing balance/.test(await page.locator("#recon-status").textContent()), "a non-number is refused");
// Year-end close: 2026 is refused while example lines still need an account; 2025 has no lines and closes.
await page.fill("#ye-year", "2026");
await page.click("#ye-close");
check(/still need an account/.test(await page.locator("#ye-status").textContent()), "closing a year with unfiled lines is refused");
await page.fill("#ye-year", "2025");
await page.click("#ye-close");
check(/2025 closed. Locked through 2025-12-31/.test(await page.locator("#ye-status").textContent()), "a year is closed and the books lock");
const yetext = await page.locator("#yearend").textContent();
check(/Locked through 2025-12-31/.test(yetext) && /2025/.test(yetext), "the close table shows the year");
await page.click("#ye-close");
check(/already closed/.test(await page.locator("#ye-status").textContent()), "closing twice is refused");
await page.click("#ye-reopen");
check(/2025 reopened/.test(await page.locator("#ye-status").textContent()) && /No year is closed/.test(await page.locator("#yearend").textContent()), "the latest year reopens");
// Printable invoice: load one invoice, save the seller's details, press Print and read the opened page.
await page.fill("#docs-paste", "type,number,date,due,party,amount,account\ninvoice,INV-900,2026-01-05,2026-02-04,Acme Corp,1200.00,4000");
await page.click("#docs-load");
await page.waitForTimeout(300);
await page.evaluate(() => { document.querySelector("#profile").open = true; });
await page.fill("#pf-name", "Kestrel Design Ltd");
await page.fill("#pf-payTo", "IBAN GB00 TEST 0000 0000");
await page.click("#pf-save");
const printBtn = page.getByRole("button", { name: "Print invoice INV-INV-900" });
check((await printBtn.count()) === 1, "an open invoice has a Print button");
if (await printBtn.count()) {
  const [pop] = await Promise.all([page.context().waitForEvent("page", { timeout: 5000 }).catch(() => null), printBtn.click()]);
  if (pop) { await pop.waitForLoadState(); const t = await pop.locator("body").textContent(); check(/Kestrel Design Ltd/.test(t) && /INV-900/.test(t) && /1,200\.00/.test(t) && /IBAN GB00/.test(t), "the opened invoice shows seller, number, amount and how to pay"); }
  else check(false, "Print opens the invoice page");
}
// A credit note leaves the open list but can still be printed from the settled list.
await page.fill("#docs-paste", "type,number,date,due,party,amount,account,against\ninvoice,INV-900,2026-01-05,2026-02-04,Acme Corp,1200.00,4000,\ncredit note,CN-1,2026-01-20,,Acme Corp,1200.00,4000,INV-900");
await page.click("#docs-load");
await page.waitForTimeout(300);
const cnBtn = page.getByRole("button", { name: /^Print (credit note|invoice) / });
check((await cnBtn.count()) >= 1, "a settled invoice or credit note has a Print button");
const cnOnly = page.getByRole("button", { name: /Print credit note/ });
if (await cnOnly.count()) {
  const [pop2] = await Promise.all([page.context().waitForEvent("page", { timeout: 5000 }).catch(() => null), cnOnly.first().click()]);
  if (pop2) { await pop2.waitForLoadState(); check(/Credit note/.test(await pop2.locator("body").textContent()), "the opened page is a credit note"); }
  else check(false, "Print opens the credit note");
} else check(false, "a credit note has its own Print button");
// Recurring payments and cash forecast. The made-up example has no steady payee (its gaps are uneven), so the card says so;
// then a statement with monthly rent and a monthly software charge fills the table and the forecast.
check(/No payee has three or more lines at a steady interval/.test(await page.locator("#recurring").textContent()), "the recurring card says so when no payee is steady (example books)");
const steady = ["Date,Description,Amount"];
for (const m of ["01", "02", "03", "04"]) steady.push(`2026-${m}-01,ACME LANDLORD RENT,-1200.00`, `2026-${m}-12,CLOUDSOFT SUBSCRIPTION,-29.00`);
await page.setInputFiles("#file", { name: "steady.csv", mimeType: "text/csv", buffer: Buffer.from(steady.join("\n") + "\n") });
await page.click("#import");
await page.waitForFunction(() => /added/.test(document.querySelector("#import-status").textContent), null, { timeout: 5000 }).catch(() => {});
const rtab = await page.locator("#recurring").textContent();
const ftab = await page.locator("#forecast").textContent();
check(/landlord/i.test(rtab) && /monthly/.test(rtab) && /cloudsoft/i.test(rtab) && /1,200\.00/.test(rtab), "the recurring table lists the monthly rent and subscription");
check(/Forecast \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}: start/.test(ftab) && /lowest/.test(ftab), "the 90-day forecast line shows start, end and lowest balance");
// UK VAT worksheet: load a small invoice and bill list with VAT, set the dates, read the boxes.
await page.fill("#docs-paste", [
  "type,number,date,due,party,amount,account",
  "invoice,V1,2026-04-10,,Alpha Ltd,1000.00,4000", "invoice,V1,2026-04-10,,Alpha Ltd,200.00,2100",
  "bill,V2,2026-04-15,,Supply Co,300.00,6010", "bill,V2,2026-04-15,,Supply Co,60.00,1300",
].join("\n"));
await page.click("#docs-load");
await page.fill("#from", "2026-04-01");
await page.fill("#to", "2026-06-30");
await page.dispatchEvent("#to", "change");
await page.waitForFunction(() => /Net VAT/.test(document.querySelector("#vat").textContent), null, { timeout: 5000 }).catch(() => {});
const vtext = await page.locator("#vat").textContent();
console.log("     docs:", await page.locator("#docs-status").textContent());
check(/Net VAT to pay/.test(vtext) && /140\.00/.test(vtext), "the VAT table shows net VAT to pay of 140.00 (200.00 due less 60.00 reclaimed)");
check(/VAT due on sales/.test(vtext) && /1000/.test(vtext) && /300/.test(vtext), "boxes 6 and 7 show sales and purchases ex VAT in whole pounds");
const remtext = await page.locator("#aging").textContent();
check(/Payment reminders/.test(remtext) && /Alpha Ltd/.test(remtext) && /friendly/.test(remtext), "an overdue customer gets a reminder row with a tone");
await page.click('button[aria-label="Copy reminder for Alpha Ltd"]');
await page.waitForFunction(() => /Alpha Ltd (copied|downloaded)/.test(document.querySelector("#docs-status").textContent), null, { timeout: 5000 }).catch(() => {});
check(/Alpha Ltd (copied|downloaded)/.test(await page.locator("#docs-status").textContent()), "the reminder draft is copied or downloaded");
check(errors.length === 0, `no page errors ${errors.join("; ")}`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
