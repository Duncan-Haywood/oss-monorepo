// The league page in real Chromium: install the worker, cut the network, reload, and check the saved copy
// is shown with its "no signal" note; then check the manifest is one Chromium accepts (icons fetched, no
// manifest errors) and the remembered "Show only" team. Run: node eval/offline-browser.mjs
// Output kept in eval/offline-browser.txt.
import http from "node:http";
import { createRequire } from "node:module";
import { handler, emptyState } from "../server.mjs";
import { captainKey } from "../confirm.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const state = emptyState();
state.published = true;
const srv = http.createServer(handler(state, () => {}, { ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok" }));
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${srv.address().port}`;
const teams = state.fields.teams.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
const lines = [];
const check = (name, ok, detail = "") => { lines.push(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ": " + detail : ""}`); if (!ok) process.exitCode = 1; };

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const url = `${base}/league?t=tok`;
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // the first visit is not controlled; this one goes through the worker and is saved
  check("worker controls the page", await page.evaluate(() => !!navigator.serviceWorker.controller));
  check("online: no offline note", await page.locator("#offline").isHidden());
  await page.selectOption("#f", "2");

  const cdp = await ctx.newCDPSession(page);
  const m = await cdp.send("Page.getAppManifest");
  check("Chromium parses the manifest with no errors", m.errors.length === 0, m.errors.map((e) => e.message).join("; ") || m.url);
  const parsed = JSON.parse(m.data || "{}");
  check("manifest start_url is this link", parsed.start_url === "/league?t=tok", parsed.start_url);
  for (const src of ["/icon-192.png", "/icon-512.png"]) {
    const r = await page.request.get(base + src);
    check(`${src} served as PNG`, r.status() === 200 && r.headers()["content-type"] === "image/png");
  }
  const inst = await cdp.send("Page.getInstallabilityErrors").catch((e) => ({ installabilityErrors: [{ errorId: "call failed: " + e.message }] }));
  // Chromium wants a secure origin; 127.0.0.1 counts. Headless can still report "in-incognito" or similar.
  check("installability errors (informational)", true, inst.installabilityErrors.map((e) => e.errorId).join(", ") || "none");

  await ctx.setOffline(true);
  await page.reload();
  const offlineShown = await page.locator("#offline").isVisible();
  check("offline: saved copy shown with the no-signal note", offlineShown, offlineShown ? await page.locator("#offline").innerText() : "");
  check("offline: fixtures still there", (await page.locator("section.round").count()) > 0);
  check("offline: remembered Show only team", (await page.inputValue("#f")) === "2");
  const other = await page.goto(`${base}/league?t=tok&c=${captainKey("adm", teams[0])}`).catch((e) => e);
  const otherText = await page.textContent("body").catch(() => "");
  check("offline: a link never opened shows the 'not saved yet' page", /has not saved this league page yet/.test(otherText || ""), other?.status?.() ?? String(other));
  await ctx.setOffline(false);
} finally {
  await browser.close();
  srv.close();
}
console.log(lines.join("\n"));
