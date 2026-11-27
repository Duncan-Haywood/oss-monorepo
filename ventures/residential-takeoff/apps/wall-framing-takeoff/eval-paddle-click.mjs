// Clicks index.html in a real browser with the Job report lit: checkout.mjs is swapped, in the browser only, for
// a filled-in Paddle config with a throwaway Ed25519 key pair. Checks the Buy button shows, the material list locks,
// a signed Job report key unlocks it and the bid package, and a key for another tool or a forged key does not.
// Paddle's script is blocked, so the Buy click must say checkout could not load rather than hang.
// `node eval-paddle-click.mjs`; skips with exit 0 when Playwright or a Chromium is missing.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, join, resolve, sep } from "node:path";
import { signLicence } from "../../../../platform/billing/server.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const serveRoot = resolve(root);
let chromium;
const candidates = ["playwright", process.env.PLAYWRIGHT_PATH, "/opt/node-tools/node_modules/playwright", "playwright-core"].filter(Boolean).map((c) =>
  !c.startsWith("/") || !existsSync(c) ? c : statSync(c).isDirectory() ? join(c, "index.mjs") : c);
for (const c of candidates) {
  try { const m = await import(c.startsWith("/") ? "file://" + c : c); chromium = (m.default ?? m).chromium; if (chromium) break; } catch {}
}
if (!chromium) { console.log("skipped: playwright not installed"); process.exit(0); }

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const publicKey = b64u(await crypto.subtle.exportKey("raw", pair.publicKey));
const priv = b64u(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
const lit = { product: "residential-takeoff", priceId: "pri_01evalevaleval", clientToken: "test_0123456789abcdef", publicKey, edge: "https://billing.invalid", environment: "sandbox" };
const reportKey = await signLicence({ v: 1, p: "residential-takeoff", t: "one-off", s: "txn_eval", iat: 1 }, priv);
const otherKey = await signLicence({ v: 1, p: "shed-designer", t: "one-off", s: "txn_eval", iat: 1 }, priv);
const other = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const forged = await signLicence({ v: 1, p: "residential-takeoff", t: "one-off", s: "txn_eval", iat: 1 }, b64u(await crypto.subtle.exportKey("pkcs8", other.privateKey)));

const types = { ".html": "text/html", ".mjs": "text/javascript", ".wasm": "application/wasm" };
const server = createServer(async (req, res) => {
  try {
    const p = resolve(join(root, decodeURIComponent(req.url.split("?")[0])));
    if (!p.startsWith(serveRoot + sep)) throw new Error("outside root");
    if (p === join(serveRoot, "checkout.mjs")) { res.writeHead(200, { "content-type": "text/javascript" }).end(`export const PADDLE = ${JSON.stringify(lit)};\n`); return; }
    res.writeHead(200, { "content-type": types[extname(p)] || "text/plain" }).end(await readFile(p));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
try { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); } catch (e) { console.log("skipped: no Chromium:", e.message.split("\n")[0]); server.close(); process.exit(0); }
let fail = 0;
const check = (ok, msg) => { console.log((ok ? "ok: " : "FAIL: ") + msg); if (!ok) fail = 1; };
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://cdn.paddle.com/**", (r) => r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.click("#example");
  await page.click("#run");
  await page.click("#mlCsv");
  check(/Job report \(\$29, one house\)/.test(await page.textContent("#errors")), "material list locked without a key, and the lock names the Job report");
  check(await page.isVisible("#buyRow"), "Buy button shown when lit");
  await page.click("#buyLink");
  await page.waitForFunction(() => /could not load/.test(document.querySelector("#pkgState")?.textContent || ""), null, { timeout: 10000 });
  check(true, "blocked Paddle script: the Buy click says checkout could not load");
  const tryKey = async (k) => { await page.fill("#pkgKey", k); await page.click("#pkgCheck"); await page.waitForFunction(() => !/Checking/.test(document.querySelector("#pkgState").textContent)); return page.textContent("#pkgState"); };
  check(/another tool/.test(await tryKey(otherKey)), "a key for another tool is refused");
  check(/not recognised/.test(await tryKey(forged)), "a key signed by another key pair is refused");
  check(/Key accepted/.test(await tryKey(reportKey)), "a signed Job report key is accepted");
  check(await page.isVisible("#pkgFields"), "the bid package fields open");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }), page.click("#mlCsv")]);
  check(dl.suggestedFilename() === "material-list.csv", "the material list downloads with the key");
  check(errors.length === 0, "no page errors " + errors.join("; "));
} finally {
  await browser.close();
  server.close();
}
process.exit(fail);
