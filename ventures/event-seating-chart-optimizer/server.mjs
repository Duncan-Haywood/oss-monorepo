#!/usr/bin/env node
// Self-hosted "find your table" page: you paste guests and wishes in /admin, publish the plan, and your
// guests open one link, type their name and see their table and who is at it. Zero dependencies.
//   ADMIN_KEY=... GUEST_TOKEN=... STATE=/data/state.json PORT=8080 node server.mjs
// ADMIN_KEY unlocks /admin. GUEST_TOKEN is the secret in the link you share (/find?t=...).
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

export function emptyState() { return { fields: { guests: SAMPLE_GUESTS, rules: SAMPLE_RULES, seats: "8", tcount: "", sizes: "", access: "" }, plan: null, title: "Find your table" }; }

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

function findPage(state, token, q) {
  const form = `<form method="get" action="/find"><input type="hidden" name="t" value="${esc(token)}"><label>Your name<input name="q" value="${esc(q)}" autofocus autocomplete="off"></label><button>Find my table</button></form>`;
  const needle = q.trim().toLowerCase();
  let body = form;
  if (needle.length >= 2) {
    const hits = [];
    for (const t of state.plan.tables) for (const name of t.guests) if (name.toLowerCase().includes(needle)) hits.push({ name, t });
    if (!hits.length) body += `<p>No guest matches "${esc(q)}". Try just your last name.</p>`;
    else for (const h of hits.slice(0, 8)) body += `<h2>${esc(h.name)}</h2><p class="big">Table ${h.t.number}</p><p class="note">Also at this table: ${esc(h.t.guests.filter((n) => n !== h.name).join(", ") || "no one else")}</p>`;
  }
  return page(state.title, body);
}

function adminPage(state, key, note = "") {
  const f = state.fields, k = esc(key);
  const area = (name, label) => `<label>${label}<textarea name="${name}">${esc(f[name] ?? "")}</textarea></label>`;
  return page("Seating admin", `${note}
<form method="post" action="/admin/save?key=${k}">
${area("guests", "Guests, one per line: Name | party | group | meal")}${area("rules", "Wishes, e.g. Ana + Ben, Cy ! Di, Eve @ 2")}
<label>Seats per table<input name="seats" value="${esc(f.seats)}"></label><label>Table count (blank = as few as fit)<input name="tcount" value="${esc(f.tcount)}"></label>
<label>Different table sizes, e.g. 1: 12, 5: 6<input name="sizes" value="${esc(f.sizes)}"></label><label>Accessible tables, e.g. 1, 2<input name="access" value="${esc(f.access)}"></label>
<button name="act" value="save">Check</button><button name="act" value="publish">Seat and publish</button></form>
<p class="note">${state.plan ? "Published: " + state.plan.tables.length + " tables." : "Not published: guests see nothing yet."} Guest link: <code>/find?t=GUEST_TOKEN</code></p>`);
}

export function handler(state, save, env = process.env) {
  const adminKey = env.ADMIN_KEY || "", token = env.GUEST_TOKEN || "";
  return async (req, res) => {
    const send = (code, body, type = "text/html; charset=utf-8", extra = {}) => { res.writeHead(code, { "content-type": type, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", ...extra }); res.end(body); };
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/healthz") return send(200, "ok\n", "text/plain");
    if (!adminKey || !token) return send(503, "Set ADMIN_KEY and GUEST_TOKEN.\n", "text/plain");
    const isAdmin = url.pathname.startsWith("/admin"), isFind = url.pathname === "/find";
    if (!isAdmin && !isFind) return send(404, "not found\n", "text/plain");
    if (isAdmin ? !same(url.searchParams.get("key") ?? "", adminKey) : !same(url.searchParams.get("t") ?? "", token)) return send(401, "link required\n", "text/plain");
    if (isFind) {
      if (req.method !== "GET") return send(405, "GET only\n", "text/plain");
      return send(200, state.plan ? findPage(state, url.searchParams.get("t"), (url.searchParams.get("q") ?? "").slice(0, 80)) : page("Find your table", "<p>The seating plan has not been published yet.</p>"));
    }
    let form = new URLSearchParams();
    if (req.method === "POST") {
      let size = 0; const chunks = [];
      for await (const c of req) { size += c.length; if (size > MAX_BODY) return send(413, "too large\n", "text/plain"); chunks.push(c); }
      form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
    }
    const here = `/admin?key=${encodeURIComponent(adminKey)}`;
    if (req.method === "GET" && url.pathname === "/admin") {
      const note = url.searchParams.get("note");
      return send(200, adminPage(state, adminKey, note ? `<p class="ok">${esc(note)}</p>` : ""));
    }
    if (req.method === "POST" && url.pathname === "/admin/save") {
      const f = { ...state.fields };
      for (const k of Object.keys(f)) f[k] = String(form.get(k) ?? "");
      state.fields = f;
      const out = buildPlan(f);
      if (form.get("act") === "publish") {
        if (out.error) { save(); return send(400, adminPage(state, adminKey, `<p class="err">${esc(out.error)}</p>`)); }
        state.plan = { tables: out.tables };
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
