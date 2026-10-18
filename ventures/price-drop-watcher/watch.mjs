#!/usr/bin/env node
// Run on a schedule (see template/price-watch.yml). Reads watch.json, fetches each page politely,
// compares against state.json, prints a report and optionally sends alerts.
// node watch.mjs [--config watch.json] [--state state.json] [--dry-run]
import { readFile, writeFile } from "node:fs/promises";
import { extractProduct, diffReading, robotsAllows, money } from "./extract.mjs";

const UA = "price-drop-watcher/1.0 (+https://github.com/Duncan-Haywood/oss-monorepo; personal price watching; honours robots.txt)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, fetchFn, signal) {
  const res = await fetchFn(url, { headers: { "user-agent": UA, accept: "text/html,*/*" }, redirect: "follow", signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export async function checkOne(item, prev, { fetchFn = fetch, robotsCache = new Map(), timeoutMs = 20000 } = {}) {
  let u;
  try { u = new URL(item.url); } catch { return { item, error: "not a valid URL" }; }
  if (!/^https?:$/.test(u.protocol)) return { item, error: "only http(s) URLs are allowed" };
  const ctl = AbortSignal.timeout(timeoutMs);
  try {
    if (!robotsCache.has(u.origin)) {
      let txt = "";
      try { txt = await fetchText(`${u.origin}/robots.txt`, fetchFn, ctl); } catch { /* no robots.txt: allowed */ }
      robotsCache.set(u.origin, txt);
    }
    if (!robotsAllows(robotsCache.get(u.origin), u.pathname + u.search, "price-drop-watcher")) return { item, error: "robots.txt disallows this page, so it was skipped" };
    const html = await fetchText(item.url, fetchFn, ctl);
    const cur = extractProduct(html, item);
    if (!cur.ok) return { item, error: cur.error };
    const { events, target } = diffReading(prev, cur, item);
    return { item, cur, events, target };
  } catch (e) {
    return { item, error: e.name === "TimeoutError" ? "timed out" : e.message };
  }
}

export function report(results) {
  const lines = ["# Price watch", ""];
  for (const r of results) {
    const name = r.item.name || r.cur?.title || r.item.url;
    if (r.error) { lines.push(`- **${name}**: could not check (${r.error})`); continue; }
    const flag = r.events.filter((e) => e.type !== "first_reading").map((e) => e.text);
    lines.push(`- **${name}**: ${money(r.cur)}${r.cur.availability ? `, ${r.cur.availability.replace("_", " ")}` : ""}${flag.length ? ` — ${flag.join("; ")}` : ""}`);
  }
  return lines.join("\n");
}

export async function notify(text, env, fetchFn = fetch) {
  const sent = [];
  if (env.NTFY_TOPIC) { await fetchFn(`${env.NTFY_SERVER || "https://ntfy.sh"}/${encodeURIComponent(env.NTFY_TOPIC)}`, { method: "POST", body: text, headers: { Title: "Price alert" } }); sent.push("ntfy"); }
  if (env.DISCORD_WEBHOOK) { await fetchFn(env.DISCORD_WEBHOOK, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: text.slice(0, 1900) }) }); sent.push("discord"); }
  if (env.WEBHOOK_URL) { await fetchFn(env.WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) }); sent.push("webhook"); }
  return sent;
}

export async function main(argv, env = process.env, io = {}) {
  const log = io.log || console.log, err = io.err || console.error;
  const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
  const cfgPath = opt("--config", "watch.json"), statePath = opt("--state", "state.json");
  let cfg, state = {};
  try { cfg = JSON.parse(await (io.read || ((f) => readFile(f, "utf8")))(cfgPath)); } catch (e) { err(`could not read ${cfgPath}: ${e.message}`); return 2; }
  try { state = JSON.parse(await (io.read || ((f) => readFile(f, "utf8")))(statePath)); } catch { state = {}; }
  const items = Array.isArray(cfg) ? cfg : cfg.items;
  if (!Array.isArray(items) || !items.length) { err("watch.json needs an items list"); return 2; }
  const results = [], robotsCache = new Map();
  for (const item of items.slice(0, 50)) {
    const r = await checkOne(item, state[item.url] || null, { fetchFn: io.fetchFn || fetch, robotsCache });
    results.push(r);
    if (r.cur) state[item.url] = { price: r.cur.price, currency: r.cur.currency, availability: r.cur.availability, at: new Date().toISOString() };
    if (!io.noDelay) await sleep(2000); // one request every two seconds, never a burst
  }
  log(report(results));
  const alerts = results.filter((r) => r.events?.some((e) => e.type !== "first_reading"));
  const text = alerts.map((r) => `${r.item.name || r.cur.title || r.item.url}: ${r.events.map((e) => e.text).join("; ")}\n${r.item.url}`).join("\n\n");
  if (alerts.length && !argv.includes("--dry-run")) {
    try { const sent = await notify(text, env, io.fetchFn || fetch); if (sent.length) log(`alerts sent via ${sent.join(", ")}`); } catch (e) { err(`alert failed: ${e.message}`); }
  }
  if (!argv.includes("--dry-run")) await (io.write || writeFile)(statePath, JSON.stringify(state, null, 2) + "\n");
  return alerts.length ? 10 : 0; // 10 = something changed worth knowing; the workflow treats it as success
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const code = await main(process.argv.slice(2));
  process.exit(code === 10 ? 0 : code);
}
