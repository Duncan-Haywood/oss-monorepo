// Clicks the page through in a real browser: the multi-account OFX flow
// (file picker -> one select per account -> Import) and the example load.
// Needs Playwright and a Chromium: `node eval/browser-click.mjs` (skips with
// exit 0 and a message when neither is installed).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
let chromium;
try { ({ chromium } = await import("playwright")); } catch {
  try { ({ chromium } = await import(process.env.PLAYWRIGHT_PATH || "playwright-core")); } catch { console.log("skipped: playwright not installed"); process.exit(0); }
}
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

// A single-account OFX must not show pickers.
await page.setInputFiles("#file", join(root, "fixtures/checking.ofx"));
await page.waitForTimeout(300);
check(await page.locator("#ofx-map").isHidden(), "single-account OFX shows no pickers");

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
check(errors.length === 0, `no page errors ${errors.join("; ")}`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
