#!/usr/bin/env node
// Self-hosted estimate hub: you send a customer ONE link to your proposal; they read it, accept (typed name) or
// decline, and you see the answer, with an optional link to take the deposit on your own payment account.
// Zero dependencies; run it on a box you own.
//   ADMIN_KEY=... STATE=/data/state.json PORT=8080 node server.mjs
// ADMIN_KEY unlocks /admin. Each proposal gets its own unguessable link (/p/<32 hex chars>) for the customer.
// Costs, wages, burden and margin are never stored here: only the customer-facing proposal. State is one JSON file.
import http from "node:http";
import fs from "node:fs";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { buildProposal, renderProposalHtml, escapeHtml as esc, money, formatDate, COMPANY_FIELDS } from "./proposal.mjs";

const MAX_BODY = 64 * 1024, MAX_PROPOSALS = 2000;
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
const one = (s, n) => String(s ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, n);

export const DISCLAIMER = "This proposal states the price offered by the business named above, who is solely responsible for the work, its scope, and any permit, licence or inspection it requires. Accepting it online records the name and time you give; it is not a contract drafted by this software and it is not legal advice.";

const CSS = `body{font:16px/1.5 system-ui,sans-serif;max-width:56rem;margin:0 auto;padding:1rem;color:#1a1a1a}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:.35rem .5rem;text-align:left;vertical-align:top}textarea,input,select{width:100%;font:inherit;box-sizing:border-box}textarea{min-height:5rem}button,.btn{font:inherit;padding:.5rem 1rem;margin:.5rem .5rem .5rem 0;cursor:pointer}.note{color:#555;font-size:.9rem}.err{color:#b00020}.ok{color:#176f2c}.pill{border-radius:1rem;padding:.1rem .6rem;font-size:.85rem;background:#eee}.pill.accepted{background:#d7f0dd}.pill.declined{background:#f6d9d9}.pr-doc{border:1px solid #ccc;padding:1rem}.pr-head{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap}.pr-sign{display:none}.pr-price td:last-child{text-align:right}.pr-total{font-weight:700}.row2{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}@media(max-width:40rem){.row2{grid-template-columns:1fr}}label{display:block;margin:.5rem 0}`;
const page = (title, body, head = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">${head}<title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;
const foot = `<p class="note">Sent with <a href="https://duncan-haywood.github.io/monorepo-projects/trade-bid-studio/">Trade Bid Studio</a> estimate hub (free, MIT, self-hosted by the business that sent this). The software performs no legal review.</p>`;

export function emptyState() { return { company: {}, proposals: [] }; }

const safeHttps = (u) => { try { const x = new URL(String(u || "")); return x.protocol === "https:" ? x.toString() : ""; } catch { return ""; } };
const expired = (rec, now) => !!rec.proposal.validUntil && new Date(now).toISOString().slice(0, 10) > rec.proposal.validUntil;
const statusOf = (rec, now) => rec.status === "sent" && expired(rec, now) ? "expired" : rec.status;

function customerPage(rec, base, env, now) {
  const p = rec.proposal, st = statusOf(rec, now), pay = safeHttps(env.PAYMENT_LINK_URL);
  let action = "";
  if (st === "accepted") {
    action = `<p class="ok"><strong>Accepted by ${esc(rec.acceptedBy)} on ${esc(rec.acceptedAt.slice(0, 10))}.</strong> ${esc(p.company.name)} has been told.</p>${pay && p.pricing.depositPercent > 0 ? `<p><a class="btn" href="${esc(pay)}" rel="noopener">Pay the ${esc(money(p.pricing.depositAmount))} deposit</a></p><p class="note">The payment page belongs to ${esc(p.company.name)}, not to this software.</p>` : ""}`;
  } else if (st === "declined") {
    action = `<p><strong>You declined this proposal on ${esc(rec.declinedAt.slice(0, 10))}.</strong> Contact ${esc(p.company.name)} if that was a mistake.</p>`;
  } else if (st === "expired") {
    action = `<p class="err"><strong>The price on this proposal was held until ${esc(formatDate(p.validUntil))} and can no longer be accepted here.</strong> Ask ${esc(p.company.name)} for an updated one.</p>`;
  } else {
    action = `<form method="post" action="${base}/accept"><h2>Accept this proposal</h2><label>Type your full name<input name="name" required maxlength="100" autocomplete="name"></label><label><input type="checkbox" name="agree" value="1" required style="width:auto"> I accept the scope and ${esc(money(p.pricing.price))} price above from ${esc(p.company.name)}.</label><button>Accept</button></form><form method="post" action="${base}/decline"><label>Not for you? Tell ${esc(p.company.name)} why (optional)<input name="note" maxlength="200"></label><button>Decline</button></form>`;
  }
  return page(`Proposal ${p.reference} from ${p.company.name}`, `${renderProposalHtml(p, { disclaimer: DISCLAIMER })}${action}${foot}`);
}

function adminPage(state, env, q, now, note = "", prefill = null) {
  const c = state.company, f = prefill || {};
  const inp = (name, label, val, extra = "") => `<label>${label}<input name="${name}" value="${esc(val ?? "")}" ${extra}></label>`;
  const origin = env.PUBLIC_BASE_URL ? String(env.PUBLIC_BASE_URL).replace(/\/+$/, "") : "";
  const rows = state.proposals.slice().reverse().map((r) => {
    const st = statusOf(r, now), link = `${origin}/p/${r.id}`;
    return `<tr><td><strong>${esc(r.proposal.reference)}</strong><br>${esc(r.proposal.client.name)}<br><span class="note">${esc(r.proposal.job.title)}</span></td><td>${esc(money(r.proposal.pricing.price))}</td><td><span class="pill ${esc(st)}">${esc(st)}</span><br><span class="note">${r.status === "accepted" ? "by " + esc(r.acceptedBy) + " " + esc(r.acceptedAt.slice(0, 16).replace("T", " ")) + " UTC" : r.status === "declined" ? esc(r.declineNote || "") : r.viewedAt ? "opened " + esc(r.viewedAt.slice(0, 16).replace("T", " ")) + " UTC" : "not opened yet"}</span></td><td><input readonly value="${esc(link)}" onclick="this.select()" aria-label="Customer link"><form method="post" action="/admin/delete${q}" onsubmit="return confirm('Delete this proposal and its link?')"><input type="hidden" name="id" value="${esc(r.id)}"><button>Delete</button></form></td></tr>`;
  }).join("");
  return page("Estimate hub", `<h1>Estimate hub</h1>${note}
<h2>Your business</h2><form method="post" action="/admin/company${q}"><div class="row2">${inp("companyName", "Business name", c.companyName)}${inp("companyPhone", "Phone", c.companyPhone)}${inp("companyEmail", "Email", c.companyEmail)}${inp("companyLicense", "Licence number", c.companyLicense)}</div>${inp("companyAddress", "Address", c.companyAddress)}<button>Save</button></form>
<h2>New proposal</h2><form id="newp" method="post" action="/admin/new${q}"><div class="row2">${inp("clientName", "Customer name", f.clientName, "required")}${inp("clientAddress", "Customer address", f.clientAddress)}</div>${inp("jobTitle", "Job title", f.jobTitle)}<label>Scope, one line per item<textarea name="scope">${esc(f.scope)}</textarea></label><div class="row2">${inp("price", "Price", f.price, 'required inputmode="decimal"')}${inp("depositPercent", "Deposit %", f.depositPercent ?? "", 'inputmode="decimal"')}${inp("validDays", "Price held for (days)", f.validDays ?? "30", 'inputmode="numeric"')}${inp("paymentTerms", "Payment terms", f.paymentTerms)}</div><label>Not included, one per line<textarea name="proposalExclusions">${esc(f.proposalExclusions)}</textarea></label><label>Notes<textarea name="proposalNotes">${esc(f.proposalNotes)}</textarea></label><button>Create customer link</button></form>
<h2>Proposals (${state.proposals.length})</h2>${state.proposals.length ? `<table><thead><tr><th>Proposal</th><th>Price</th><th>Status</th><th>Customer link</th></tr></thead><tbody>${rows}</tbody></table><p><a href="/admin/export.csv${q}">Download as CSV</a></p>` : `<p class="note">None yet. Create one above, then send the customer its link by text or email.</p>`}
<p class="note">${origin ? "" : "Set PUBLIC_BASE_URL (https://your-host) so the links above are complete; for now add your address in front of each /p/... link. "}Proposals hold only what the customer sees: never your costs, wages or margin. ${safeHttps(env.PAYMENT_LINK_URL) ? "Accepted proposals show a deposit button that opens your payment link." : "Set PAYMENT_LINK_URL (a payment link from your own processor) to show a deposit button after acceptance."}</p>
<script>(function(){var m=location.hash.match(/prefill=([^&]+)/);if(!m)return;try{var d=JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g,"+").replace(/_/g,"/")))));var f=document.getElementById("newp");Object.keys(d).forEach(function(k){if(f.elements[k]&&typeof d[k]!=="object")f.elements[k].value=d[k]});history.replaceState(null,"",location.pathname+location.search);f.scrollIntoView()}catch(e){}})()</script>${foot}`);
}

export const csvOf = (state) => {
  const cell = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  return [["reference", "customer", "job", "price", "deposit_percent", "status", "created", "accepted_by", "accepted_at"].join(","),
    ...state.proposals.map((r) => [r.proposal.reference, r.proposal.client.name, r.proposal.job.title, r.proposal.pricing.price, r.proposal.pricing.depositPercent, r.status, r.createdAt, r.acceptedBy || "", r.acceptedAt || ""].map(cell).join(","))].join("\r\n") + "\r\n";
};

export function handler(state, save, env = process.env, now = Date.now) {
  const adminKey = env.ADMIN_KEY || "", cookieVal = adminKey ? sha("hub:" + adminKey) : "";
  return async (req, res) => {
    const send = (code, body, type = "text/html; charset=utf-8", extra = {}) => { res.writeHead(code, { "content-type": type, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow", "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'", "cache-control": "no-store", ...extra }); res.end(body); };
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/healthz") return send(200, "ok\n", "text/plain");
    if (!adminKey) return send(503, "Set ADMIN_KEY.\n", "text/plain");
    let form = new URLSearchParams();
    if (req.method === "POST") {
      let size = 0; const chunks = [];
      for await (const c of req) { size += c.length; if (size > MAX_BODY) return send(413, "too large\n", "text/plain"); chunks.push(c); }
      form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
    }
    const at = new Date(now()).toISOString();
    const m = url.pathname.match(/^\/p\/([0-9a-f]{32})(?:\/(accept|decline))?$/);
    if (m) {
      const rec = state.proposals.find((r) => r.id === m[1]);
      if (!rec) return send(404, page("Not found", "<p>This proposal link is not valid. Ask the business for a new one.</p>"));
      const base = `/p/${rec.id}`;
      if (req.method === "GET" && !m[2]) {
        if (!rec.viewedAt) { rec.viewedAt = at; save(); }
        return send(200, customerPage(rec, base, env, now()));
      }
      if (req.method === "POST" && m[2]) {
        const bad = (msg) => send(400, page("Could not record that", `<p class="err">${esc(msg)}</p><p><a href="${base}">Back to the proposal</a></p>`));
        if (rec.status !== "sent") return send(303, "", "text/plain", { location: base });
        if (m[2] === "accept") {
          if (expired(rec, now())) return bad("The price on this proposal is no longer held.");
          const name = one(form.get("name"), 100);
          if (name.length < 2) return bad("Type your full name to accept.");
          if (form.get("agree") !== "1") return bad("Tick the box to accept.");
          rec.status = "accepted"; rec.acceptedBy = name; rec.acceptedAt = at;
        } else { rec.status = "declined"; rec.declinedAt = at; rec.declineNote = one(form.get("note"), 200); }
        save();
        return send(303, "", "text/plain", { location: base });
      }
      return send(405, "method not allowed\n", "text/plain");
    }
    if (!url.pathname.startsWith("/admin")) return send(404, "not found\n", "text/plain");
    const cookie = (req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith("hub_admin="))?.slice(10) ?? "";
    const keyQ = url.searchParams.get("key");
    const ok = (keyQ !== null && same(keyQ, adminKey)) || same(cookie, cookieVal);
    if (!ok) return send(401, "admin link required\n", "text/plain");
    const secure = (req.headers["x-forwarded-proto"] === "https" || env.PUBLIC_BASE_URL?.startsWith("https://")) ? "; Secure" : "";
    const extra = { "set-cookie": `hub_admin=${cookieVal}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=2592000${secure}` };
    const q = keyQ !== null ? `?key=${encodeURIComponent(keyQ)}` : "";
    const back = (note) => send(303, "", "text/plain", { ...extra, location: "/admin" + (q ? q + "&" : "?") + "note=" + encodeURIComponent(note) });
    if (req.method === "GET" && url.pathname === "/admin") {
      const note = url.searchParams.get("note");
      return send(200, adminPage(state, env, q, now(), note ? `<p class="ok">${esc(note)}</p>` : ""), "text/html; charset=utf-8", extra);
    }
    if (req.method === "GET" && url.pathname === "/admin/export.csv") return send(200, csvOf(state), "text/csv; charset=utf-8", { ...extra, "content-disposition": 'attachment; filename="proposals.csv"' });
    if (req.method === "POST" && url.pathname === "/admin/company") {
      state.company = Object.fromEntries(COMPANY_FIELDS.map((f) => [f, one(form.get(f), 200)]));
      save();
      return back("Saved.");
    }
    if (req.method === "POST" && url.pathname === "/admin/new") {
      const input = { ...Object.fromEntries([...form].map(([k, v]) => [k, String(v).slice(0, 4000)])), ...state.company };
      let proposal;
      try { proposal = buildProposal({ ...input, issuedOn: at.slice(0, 10) }); } catch (e) {
        return send(400, adminPage(state, env, q, now(), `<p class="err">${esc(e.message)}</p>`, Object.fromEntries(form)), "text/html; charset=utf-8", extra);
      }
      state.proposals.push({ id: randomBytes(16).toString("hex"), createdAt: at, proposal, status: "sent", viewedAt: null });
      if (state.proposals.length > MAX_PROPOSALS) state.proposals.shift();
      save();
      return back(`Created ${proposal.reference}. Copy its customer link below and send it.`);
    }
    if (req.method === "POST" && url.pathname === "/admin/delete") {
      const i = state.proposals.findIndex((r) => r.id === form.get("id"));
      if (i < 0) return back("That proposal is already gone.");
      state.proposals.splice(i, 1);
      save();
      return back("Deleted. Its link no longer works.");
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
  http.createServer(handler(state, save)).listen(port, () => console.log(`estimate hub on :${port}${process.env.ADMIN_KEY ? "" : " (set ADMIN_KEY)"}`));
}
