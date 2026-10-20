#!/usr/bin/env node
// Self-hosted "find your table" page: you paste guests and wishes in /admin, publish the plan, and your
// guests open one link, type their name and see their table and who is at it. Zero dependencies.
//   ADMIN_KEY=... GUEST_TOKEN=... STATE=/data/state.json PORT=8080 node server.mjs
// ADMIN_KEY unlocks /admin. GUEST_TOKEN is the secret in the link you share (/find?t=...).
// Optional meal picks: list the choices in /admin ("Chicken, Fish, Vegetarian") and each guest can pick theirs after finding
// their table; /admin/meals.csv exports name, table, meal for the caterer.
// State is one JSON file: put STATE on a persistent disk. Meals and wishes are never shown to guests.
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { validateSpec, parseGuests, parseRules, parseAccessTables, parseTableSizes, optimize, SAMPLE_GUESTS, SAMPLE_RULES } from "./calc.mjs";

const MAX_BODY = 64 * 1024;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

const CSS = `body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:0 auto;padding:1rem;color:#1a1a1a}textarea,input{width:100%;font:inherit;box-sizing:border-box}textarea{font-family:ui-monospace,monospace;min-height:7rem}button{font:inherit;padding:.5rem 1rem;margin:.5rem .5rem .5rem 0}.note{color:#555;font-size:.9rem}.err{color:#b00020}.ok{color:#176f2c}.big{font-size:3rem;font-weight:700;margin:0}`;
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${CSS}</style></head><body><h1>${esc(title)}</h1>${body}<p class="note">Self-hosted with <a href="https://duncan-haywood.github.io/monorepo-projects/event-seating-chart-optimizer/">Event Seating Chart Optimizer</a> (MIT).</p></body></html>`;

export function emptyState() { return { fields: { guests: SAMPLE_GUESTS, rules: SAMPLE_RULES, seats: "8", tcount: "", sizes: "", access: "", meals: "" }, plan: null, choices: {}, title: "Find your table" }; }

/** Fields -> the optimised plan, or { error }. Guests see only names and table numbers from it. */
export function buildPlan(f) {
  const g = parseGuests(f.guests);
  if (g.errors.length) return { error: g.errors[0] };
  if (!g.guests.length) return { error: "Add at least one guest." };
  const r = parseRules(f.rules, g.guests);
  const spec = { guests: g.guests, rules: r.rules, seatsPerTable: Math.trunc(Number(f.seats)) || 8, tableCount: f.tcount ? Math.trunc(Number(f.tcount)) : "", balance: true, mix: "off", seed: 1 };
  const sz = parseTableSizes(f.sizes), ac = parseAccessTables(f.access);
  if (sz.errors.length || ac.errors.length) return { error: [...sz.errors, ...ac.errors][0] };
  spec.tableSizes = sz.sizes;
  spec.accessTables = ac.tables;
  const bad = [...(r.errors || []), ...validateSpec(spec)];
  if (bad.length) return { error: bad[0] };
  let res;
  try { res = optimize(spec); } catch (e) { return { error: e.message }; }
  if (res.errors?.length) return { error: res.errors[0] };
  return { tables: res.tables.map((t) => ({ number: t.number, guests: t.guests })), unmet: res.broken.length, warnings: [] };
}

const mealOptions = (f) => [...new Set(String(f.meals ?? "").split(/[,\n]/).map((m) => m.trim().slice(0, 40)).filter(Boolean))].slice(0, 12);
const csvCell = (v) => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
export function mealCsv(state) {
  const rows = ["Name,Table,Meal"];
  for (const t of state.plan?.tables ?? []) for (const n of t.guests) rows.push([n, t.number, state.choices?.[n] ?? ""].map(csvCell).join(","));
  return rows.join("\n") + "\n";
}
export function mealTotals(state) {
  const tally = {};
  for (const t of state.plan?.tables ?? []) for (const n of t.guests) { const m = state.choices?.[n]; if (m) tally[m] = (tally[m] || 0) + 1; }
  return tally;
}

function findPage(state, token, q, note = "") {
  const form = `<form method="get" action="/find"><input type="hidden" name="t" value="${esc(token)}"><label>Your name<input name="q" value="${esc(q)}" autofocus autocomplete="off"></label><button>Find my table</button></form>`;
  const needle = q.trim().toLowerCase();
  const opts = mealOptions(state.fields);
  let body = note + form;
  if (needle.length >= 2) {
    const hits = [];
    for (const t of state.plan.tables) for (const name of t.guests) if (name.toLowerCase().includes(needle)) hits.push({ name, t });
    if (!hits.length) body += `<p>No guest matches "${esc(q)}". Try just your last name.</p>`;
    else for (const h of hits.slice(0, 8)) {
      body += `<h2>${esc(h.name)}</h2><p class="big">Table ${h.t.number}</p><p class="note">Also at this table: ${esc(h.t.guests.filter((n) => n !== h.name).join(", ") || "no one else")}</p>`;
      if (opts.length) {
        const cur = state.choices?.[h.name] ?? "";
        body += `<form method="post" action="/find/meal?t=${encodeURIComponent(token)}"><input type="hidden" name="name" value="${esc(h.name)}"><input type="hidden" name="q" value="${esc(q)}"><label>Your meal<select name="meal"><option value="">Not chosen yet</option>${opts.map((o) => `<option${o === cur ? " selected" : ""}>${esc(o)}</option>`).join("")}</select></label><button>Save meal</button></form>`;
      }
    }
  }
  return page(state.title, body);
}

function mealBlock(state, key) {
  if (!mealOptions(state.fields).length) return "";
  const tally = Object.entries(mealTotals(state)).map(([m, c]) => `${esc(m)}: ${c}`).join(", ") || "no picks yet";
  const total = (state.plan?.tables ?? []).reduce((a, t) => a + t.guests.length, 0), picked = Object.values(mealTotals(state)).reduce((a, c) => a + c, 0);
  return `<h2>Meal picks</h2><p>${picked} of ${total} guests have chosen. ${tally}.</p><p><a href="/admin/meals.csv?key=${encodeURIComponent(key)}">Download name, table, meal (CSV)</a></p>`;
}

function adminPage(state, key, note = "") {
  const f = state.fields, k = esc(key);
  const area = (name, label) => `<label>${label}<textarea name="${name}">${esc(f[name] ?? "")}</textarea></label>`;
  return page("Seating admin", `${note}
<form method="post" action="/admin/save?key=${k}">
${area("guests", "Guests, one per line: Name | party | group | meal")}${area("rules", "Wishes, e.g. Ana + Ben, Cy ! Di, Eve @ 2")}
<label>Seats per table<input name="seats" value="${esc(f.seats)}"></label><label>Table count (blank = as few as fit)<input name="tcount" value="${esc(f.tcount)}"></label>
<label>Different table sizes, e.g. 1: 12, 5: 6<input name="sizes" value="${esc(f.sizes)}"></label><label>Accessible tables, e.g. 1, 2<input name="access" value="${esc(f.access)}"></label>
<label>Meal choices guests can pick, comma separated (blank = off)<input name="meals" value="${esc(f.meals)}"></label>
<button name="act" value="save">Check</button><button name="act" value="publish">Seat and publish</button></form>
<p class="note">${state.plan ? "Published: " + state.plan.tables.length + " tables." : "Not published: guests see nothing yet."} Guest link: <code>/find?t=GUEST_TOKEN</code></p>${mealBlock(state, key)}`);
}

export function handler(state, save, env = process.env) {
  const adminKey = env.ADMIN_KEY || "", token = env.GUEST_TOKEN || "";
  return async (req, res) => {
    const readForm = async (rq) => {
      let size = 0; const chunks = [];
      for await (const c of rq) { size += c.length; if (size > MAX_BODY) return null; chunks.push(c); }
      return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
    };
    const send = (code, body, type = "text/html; charset=utf-8", extra = {}) => { res.writeHead(code, { "content-type": type, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", ...extra }); res.end(body); };
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/healthz") return send(200, "ok\n", "text/plain");
    if (!adminKey || !token) return send(503, "Set ADMIN_KEY and GUEST_TOKEN.\n", "text/plain");
    const isAdmin = url.pathname.startsWith("/admin"), isFind = url.pathname === "/find" || url.pathname === "/find/meal";
    if (!isAdmin && !isFind) return send(404, "not found\n", "text/plain");
    if (isAdmin ? !same(url.searchParams.get("key") ?? "", adminKey) : !same(url.searchParams.get("t") ?? "", token)) return send(401, "link required\n", "text/plain");
    if (isFind) {
      if (url.pathname === "/find/meal") {
        if (req.method !== "POST" || !state.plan) return send(405, "POST only\n", "text/plain");
        const f = await readForm(req); if (!f) return send(413, "too large\n", "text/plain");
        const name = f.get("name") ?? "", meal = f.get("meal") ?? "", opts = mealOptions(state.fields);
        const known = state.plan.tables.some((t) => t.guests.includes(name));
        if (!known || !opts.length || (meal && !opts.includes(meal))) return send(400, page("Find your table", "<p class=\"err\">That guest or meal is not on the list.</p>"));
        state.choices = state.choices || {};
        if (meal) state.choices[name] = meal; else delete state.choices[name];
        save();
        const q = (f.get("q") ?? "").slice(0, 80);
        return send(200, findPage(state, url.searchParams.get("t"), q, `<p class="ok">Saved ${esc(name)}${meal ? ": " + esc(meal) : ""}.</p>`));
      }
      if (req.method !== "GET") return send(405, "GET only\n", "text/plain");
      return send(200, state.plan ? findPage(state, url.searchParams.get("t"), (url.searchParams.get("q") ?? "").slice(0, 80)) : page("Find your table", "<p>The seating plan has not been published yet.</p>"));
    }
    let form = new URLSearchParams();
    if (req.method === "POST") { form = await readForm(req); if (!form) return send(413, "too large\n", "text/plain"); }
    const here = `/admin?key=${encodeURIComponent(adminKey)}`;
    if (req.method === "GET" && url.pathname === "/admin") {
      const note = url.searchParams.get("note");
      return send(200, adminPage(state, adminKey, note ? `<p class="ok">${esc(note)}</p>` : ""));
    }
    if (req.method === "GET" && url.pathname === "/admin/meals.csv") return send(200, mealCsv(state), "text/csv; charset=utf-8", { "content-disposition": 'attachment; filename="meals.csv"' });
    if (req.method === "POST" && url.pathname === "/admin/save") {
      const f = { ...state.fields };
      for (const k of Object.keys(f)) f[k] = String(form.get(k) ?? "");
      state.fields = f;
      const out = buildPlan(f);
      if (form.get("act") === "publish") {
        if (out.error) { save(); return send(400, adminPage(state, adminKey, `<p class="err">${esc(out.error)}</p>`)); }
        state.plan = { tables: out.tables };
        const here_ = new Set(out.tables.flatMap((t) => t.guests));
        state.choices = Object.fromEntries(Object.entries(state.choices || {}).filter(([n]) => here_.has(n)));
      }
      save();
      const msg = out.error ? "Saved, but: " + out.error : `Saved. ${out.tables.length} tables, ${out.unmet} wish(es) not met.` + (out.warnings.length ? " " + out.warnings[0] : "");
      return send(303, "", "text/plain", { location: `${here}&note=${encodeURIComponent(msg)}` });
    }
    return send(404, "not found\n", "text/plain");
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const statePath = process.env.STATE || "state.json";
  let state = emptyState();
  try { state = { ...state, ...JSON.parse(fs.readFileSync(statePath, "utf8")) }; } catch (e) { if (e.code !== "ENOENT") throw e; }
  const save = () => { fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state)); fs.renameSync(`${statePath}.tmp`, statePath); };
  const port = Number(process.env.PORT || 8080);
  http.createServer(handler(state, save)).listen(port, () => console.log(`seating hub on :${port}${process.env.ADMIN_KEY && process.env.GUEST_TOKEN ? "" : " (set ADMIN_KEY and GUEST_TOKEN)"}`));
}
