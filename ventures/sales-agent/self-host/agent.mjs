// Sales Agent M4a: the self-hosted inbox agent. Polls the deployer's own mailbox over IMAP (read-only: EXAMINE and
// BODY.PEEK, so mail is never marked read, moved or deleted), runs each new message through the inbox agent, and
// serves an approval queue on a local port. State and an append-only audit log live in DATA_DIR. Sending (M4b) is off
// unless SMTP_HOST is set, and even then only a person's click on "Send" on a draft they approved sends it, once,
// to the address that wrote in, with a List-Unsubscribe header, never to a suppressed address, and at most
// SEND_MAX_PER_DAY a day. Anything automatic is M5 and waits on the owner.
//
// Env: IMAP_HOST IMAP_USER IMAP_PASS [IMAP_PORT=993] [IMAP_SECURE=true] [IMAP_BOX=INBOX] [TLS_CA_FILE=ca.pem] ADMIN_TOKEN (required)
//      [SMTP_HOST SMTP_PORT=587 SMTP_SECURE=false SMTP_USER SMTP_PASS SEND_FROM SEND_MAX_PER_DAY=20] [DATA_DIR=./data] [PORT=8787] [HOST=127.0.0.1] [POLL_MINUTES=10] [SINCE_DAYS=7] [OFFER_JSON=path]
//      [PIPEDRIVE_API_TOKEN] [HUBSPOT_TOKEN]: write each read reply back as a note on the existing contact (and set the CRM opt-out on an unsubscribe)
//      plus LLM_PROVIDER/LLM_MODEL/LLM_API_KEY (or ANTHROPIC_API_KEY ...) for the optional model, same limits.
import http from "node:http";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { Imap, parseMessage, toReplyBlock } from "./imap.mjs";
import { parseReplies, csv, iso, toCsv } from "../engine.mjs";
import { runInboxWithModel } from "../ai.mjs";
import { configFromEnv } from "../byok.mjs";
import { buildMessage, sendMail } from "./smtp.mjs";
import { oauthWanted, tokenProvider } from "./oauth.mjs";
import { runResearch } from "../research.mjs";
import { crmFromEnv } from "./crm.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

export function createAgent(env = process.env, { now = () => Date.now(), fetchImpl } = {}) {
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 12) throw new Error("ADMIN_TOKEN is required (12+ characters): it protects the approval queue");
  let tokenFn = null; // OAuth (Gmail, Microsoft 365): built on first use so a bad OAUTH_* setting shows up as a poll or send error, not a crash
  const getToken = () => (tokenFn ||= tokenProvider(env, { fetchImpl: fetchImpl || fetch, now }))();
  const ca = env.TLS_CA_FILE ? readFileSync(env.TLS_CA_FILE) : undefined; // extra trusted CA (PEM) for a mail server with a private certificate
  const dir = env.DATA_DIR || "./data";
  mkdirSync(dir, { recursive: true });
  const stateFile = join(dir, "state.json"), auditFile = join(dir, "audit.jsonl");
  const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : { lastUid: 0, seen: [], items: [], prospects: [], suppression: [], lastPoll: null, lastError: null };
  const crm = crmFromEnv(env, { fetchImpl: fetchImpl || fetch }); // M8a write-back, off unless PIPEDRIVE_API_TOKEN or HUBSPOT_TOKEN is set
  const offer = env.OFFER_JSON && existsSync(env.OFFER_JSON) ? JSON.parse(readFileSync(env.OFFER_JSON, "utf8")) : {};
  const audit = (event, data = {}) => appendFileSync(auditFile, JSON.stringify({ at: new Date(now()).toISOString(), event, ...data }) + "\n");
  const save = () => writeFileSync(stateFile, JSON.stringify(state, null, 1));

  /** Run raw messages through the inbox agent and merge the result into state. Pure of IMAP; exported for tests. */
  async function ingest(blocks) {
    const fresh = blocks.filter((b) => !state.seen.includes(b.id));
    if (!fresh.length) return 0;
    const replies = fresh.map((b) => ({ ...parseReplies(b.block)[0], id: b.id }));
    const r = await runInboxWithModel(configFromEnv(env), { replies, prospects: state.prospects, suppression: state.suppression.map((s) => s.email).join("\n"), offer, today: iso(now()) });
    state.prospects = r.prospects;
    for (const s of r.suppression) { state.suppression.push(s); audit("suppress", s); }
    r.items.forEach((it, i) => {
      const item = { id: fresh[i].id, receivedAt: new Date(now()).toISOString(), ...it, decision: it.draft ? "pending" : "none" };
      state.items.push(item);
      state.seen.push(fresh[i].id);
      audit("triage", { id: item.id, from: it.from, category: it.triage.category, source: r.source, applied: it.applied, evidence: it.triage.evidence });
    });
    state.seen = state.seen.slice(-5000);
    save();
    if (crm) for (const it of state.items.slice(-fresh.length)) {
      const results = await crm.logReply({ from: it.from, subject: it.subject, category: it.triage.category, evidence: it.triage.evidence, date: iso(now()), optOut: it.triage.category === "unsubscribe", suppressed: it.triage.category === "unsubscribe" });
      for (const r of results) audit("crm_writeback", { id: it.id, ...r });
    }
    return fresh.length;
  }

  /** Put first-touch drafts from a CRM export into the approval queue (outbound items: nothing is sent until a person approves and clicks Send). */
  function queueResearch({ crm, icp = {}, top } = {}) {
    const d = runResearch({ crm, icp, offer, top, today: iso(now()), suppression: state.suppression.map((s) => s.email).join("\n"), existing: state.prospects });
    let added = 0, skipped = 0;
    for (const a of d.accounts) {
      const id = `research:${a.email}`;
      if (state.seen.includes(id)) { skipped++; continue; }
      state.items.push({ id, outbound: true, receivedAt: new Date(now()).toISOString(), from: a.email, name: a.contact, subject: a.draft.subject, body: `Cold first touch to ${a.contact || a.email}${a.company ? " at " + a.company : ""}. Fit ${a.score ?? "unscored"}: ${a.why.join("; ")}`, triage: { category: "first_touch", evidence: a.source }, applied: a.facts, draft: a.draft, lint: { ok: a.draftOk, errors: a.draftErrors }, decision: "pending" });
      state.seen.push(id); added++;
      audit("research_queued", { id, to: a.email, score: a.score, source: a.source });
    }
    save();
    return { added, skipped, held: d.held.length, dropped: d.dropped.length };
  }

  async function poll() {
    const oauth = oauthWanted(env);
    const need = (oauth ? ["IMAP_HOST", "IMAP_USER"] : ["IMAP_HOST", "IMAP_USER", "IMAP_PASS"]).filter((k) => !env[k]);
    if (need.length) { state.lastError = `missing ${need.join(", ")}`; save(); return 0; }
    const c = new Imap({ host: env.IMAP_HOST, port: Number(env.IMAP_PORT || 993), secure: env.IMAP_SECURE !== "false", ca });
    try {
      await c.connect(); if (oauth) await c.loginXoauth2(env.IMAP_USER, await getToken()); else await c.login(env.IMAP_USER, env.IMAP_PASS); await c.examine(env.IMAP_BOX || "INBOX");
      const since = state.lastUid ? `UID ${state.lastUid + 1}:*` : `SINCE ${new Date(now() - Number(env.SINCE_DAYS || 7) * 864e5).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).replace(/ /g, "-")}`;
      const uids = (await c.search(since)).filter((u) => u > state.lastUid).sort((a, b) => a - b).slice(0, 200);
      const blocks = [];
      for (const uid of uids) {
        const m = parseMessage(await c.fetchRaw(uid));
        const own = (m.headers.from.match(/[\w.+'-]+@[\w.-]+/) || [""])[0].toLowerCase() === String(env.IMAP_USER).toLowerCase();
        if (!own && m.text) blocks.push({ id: m.headers.messageId || `${env.IMAP_BOX || "INBOX"}:${uid}`, block: toReplyBlock(m) });
        state.lastUid = Math.max(state.lastUid, uid);
      }
      const n = await ingest(blocks);
      state.lastPoll = new Date(now()).toISOString(); state.lastError = null; save();
      audit("poll", { uids: uids.length, ingested: n });
      return n;
    } catch (e) { state.lastError = String(e.message || e).replace(env.IMAP_PASS || "\0", "***"); save(); audit("poll_error", { error: state.lastError }); return 0; }
    finally { await c.logout(); }
  }

  function decide(id, decision, body) {
    const it = state.items.find((x) => x.id === id);
    if (!it || !it.draft) return null;
    if (!["approved", "rejected"].includes(decision)) return null;
    if (decision === "approved") {
      const text = typeof body === "string" ? body : it.draft.body;
      if (/\[[^\]]+\]/.test(text)) return { error: "fill in the [bracketed] placeholders first" };
      it.draft = { ...it.draft, body: text };
    }
    it.decision = decision; it.decidedAt = new Date(now()).toISOString();
    audit("decision", { id, decision, from: it.from, edited: decision === "approved" && body != null && body !== it.draft.body });
    save();
    return it;
  }

  /** Send an approved draft over SMTP. Every refusal is a { error } and nothing leaves; every attempt is audited. */
  /** M8b: a person clicked "move deal" on an interested reply. Moves the contact's single open deal to the named stage. */
  async function moveDeal(id) {
    const it = state.items.find((x) => x.id === id);
    if (!it) return null;
    if (!crm || !Object.keys(crm.stages).length) return { error: "stage moves are off: set PIPEDRIVE_MEETING_STAGE_ID or HUBSPOT_MEETING_STAGE" };
    if (it.triage.category !== "interested") return { error: "only an interested reply can move a deal" };
    if (it.dealMovedAt) return { error: "already moved" };
    const results = await crm.moveStage({ from: it.from });
    for (const r of results) audit("crm_stage", { id, ...r });
    if (results.some((r) => r.moved)) { it.dealMovedAt = new Date(now()).toISOString(); save(); }
    return { ok: true, results };
  }

  async function send(id) {
    const it = state.items.find((x) => x.id === id);
    if (!it || !it.draft) return null;
    if (!env.SMTP_HOST) return { error: "sending is off: set SMTP_HOST (and SMTP_USER, SMTP_PASS) to turn it on" };
    if (it.decision !== "approved") return { error: "approve the draft first" };
    if (it.sentAt) return { error: "already sent" };
    const to = (it.from.match(/[\w.+'-]+@[\w.-]+/) || [""])[0].toLowerCase();
    if (state.suppression.some((s) => s.email === to)) { audit("send_blocked", { id, to, why: "suppressed" }); return { error: "that address is on your suppression list" }; }
    if (/\[[^\]]+\]/.test(it.draft.body)) return { error: "fill in the [bracketed] placeholders first" };
    const day = new Date(now()).toISOString().slice(0, 10), cap = Number(env.SEND_MAX_PER_DAY || 20);
    if (state.items.filter((x) => (x.sentAt || "").startsWith(day)).length >= cap) { audit("send_blocked", { id, to, why: "daily cap" }); return { error: `daily cap of ${cap} sends reached` }; }
    const from = env.SEND_FROM || env.IMAP_USER || env.SMTP_USER;
    const msg = buildMessage({ from, to, subject: it.outbound || /^re:/i.test(it.subject) ? it.subject : "Re: " + it.subject, body: it.draft.body, inReplyTo: /^<.+>$/.test(it.id) ? it.id : undefined, date: new Date(now()) });
    it.sendingAt = new Date(now()).toISOString(); save();
    try {
      const reply = await sendMail({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), secure: env.SMTP_SECURE === "true", starttls: env.SMTP_STARTTLS !== "false", ca, user: oauthWanted(env) ? (env.SMTP_USER || env.IMAP_USER) : env.SMTP_USER, pass: env.SMTP_PASS, getToken: oauthWanted(env) ? getToken : undefined }, msg);
      it.sentAt = new Date(now()).toISOString(); it.sentMessageId = msg.id; delete it.sendingAt;
      audit("sent", { id, to, messageId: msg.id, server: reply }); save();
      return it;
    } catch (e) {
      const error = String(e.message || e).replace(env.SMTP_PASS || "\0", "***");
      delete it.sendingAt; audit("send_error", { id, to, error }); save();
      return { error };
    }
  }

  const authed = (req) => { const t = (req.headers.authorization || "").replace(/^Bearer /i, "") || new URL(req.url, "http://x").searchParams.get("token") || ""; return safeEq(t, env.ADMIN_TOKEN); };
  const json = (res, code, o) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(o)); };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/healthz") return json(res, 200, { ok: true, lastPoll: state.lastPoll, lastError: state.lastError });
    if (!authed(req)) { res.writeHead(401, { "content-type": "text/plain", "www-authenticate": "Bearer" }); return res.end("Add ?token=YOUR_ADMIN_TOKEN"); }
    if (req.method === "GET" && url.pathname === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" }); return res.end(page(state, url.searchParams.get("token") || "", !!env.SMTP_HOST, !!(crm && Object.keys(crm.stages).length))); }
    if (req.method === "GET" && url.pathname === "/api/queue") return json(res, 200, { lastPoll: state.lastPoll, lastError: state.lastError, items: state.items });
    if (req.method === "GET" && url.pathname === "/api/prospects.csv") { res.writeHead(200, { "content-type": "text/csv" }); return res.end(toCsv(state.prospects, ["email", "first_name", "company", "status", "stage", "paused_until", "last_reply"])); }
    if (req.method === "GET" && url.pathname === "/api/suppression.csv") { res.writeHead(200, { "content-type": "text/csv" }); return res.end(toCsv(state.suppression, ["email", "reason", "date", "evidence"])); }
    if (req.method === "GET" && url.pathname === "/api/audit") { res.writeHead(200, { "content-type": "application/x-ndjson" }); return res.end(existsSync(auditFile) ? readFileSync(auditFile) : ""); }
    if (req.method === "POST" && url.pathname === "/api/poll") return json(res, 200, { ingested: await poll() });
    if (req.method === "POST" && url.pathname === "/api/decide") {
      let raw = ""; for await (const ch of req) { raw += ch; if (raw.length > 100000) return json(res, 413, { error: "too large" }); }
      let b; try { b = JSON.parse(raw); } catch { return json(res, 400, { error: "bad json" }); }
      const r = decide(b.id, b.decision, b.body);
      return r ? json(res, r.error ? 422 : 200, r.error ? r : { ok: true, item: r }) : json(res, 404, { error: "no such draft" });
    }
    if (req.method === "POST" && url.pathname === "/api/research") {
      let raw = ""; for await (const ch of req) { raw += ch; if (raw.length > 2e6) return json(res, 413, { error: "too large" }); }
      let b; try { b = JSON.parse(raw); } catch { return json(res, 400, { error: "bad json" }); }
      if (!b.crm) return json(res, 422, { error: "send { crm: <CSV text>, icp?, top? }" });
      return json(res, 200, queueResearch(b));
    }
    if (req.method === "POST" && url.pathname === "/api/crm-stage") {
      let raw = ""; for await (const ch of req) { raw += ch; if (raw.length > 10000) return json(res, 413, { error: "too large" }); }
      let b; try { b = JSON.parse(raw); } catch { return json(res, 400, { error: "bad json" }); }
      const r = await moveDeal(b.id);
      return r ? json(res, r.error ? 422 : 200, r) : json(res, 404, { error: "no such reply" });
    }
    if (req.method === "POST" && url.pathname === "/api/send") {
      let raw = ""; for await (const ch of req) { raw += ch; if (raw.length > 10000) return json(res, 413, { error: "too large" }); }
      let b; try { b = JSON.parse(raw); } catch { return json(res, 400, { error: "bad json" }); }
      const r = await send(b.id);
      return r ? json(res, r.error ? 422 : 200, r.error ? r : { ok: true, item: r }) : json(res, 404, { error: "no such draft" });
    }
    json(res, 404, { error: "not found" });
  });
  return { server, state, poll, ingest, queueResearch, decide, send, moveDeal, audit };
}

function page(state, token, canSend, canMove) {
  const t = encodeURIComponent(token);
  const rows = state.items.slice().reverse().map((it) => {
    const d = it.draft;
    const mailto = d ? `mailto:${encodeURIComponent(it.from)}?subject=${encodeURIComponent(it.outbound || /^re:/i.test(it.subject) ? it.subject : "Re: " + it.subject)}&body=${encodeURIComponent(d.body)}` : "";
    return `<article data-id="${esc(it.id)}"><h3>${esc(it.name || it.from)} <small>&lt;${esc(it.from)}&gt;</small> <span class="tag">${esc(it.triage.category)}</span></h3>
<p class="re">${esc(it.subject)}</p><blockquote>${esc(it.body).replace(/\n/g, "<br>")}</blockquote>
${canMove && it.triage.category === "interested" && !it.dealMovedAt ? `<button data-move="1">Move their open deal to the meeting stage</button>` : it.dealMovedAt ? `<p>Deal moved ${esc(it.dealMovedAt)}.</p>` : ""}
<ul>${it.applied.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
${d ? `<textarea rows="7" ${it.decision !== "pending" ? "disabled" : ""}>${esc(d.body)}</textarea>
<p>${it.approval === "guess_check_first" ? "<b>A guess: read the reply and check first.</b> " : ""}${it.lint && !it.lint.ok ? `<b>Checks failed:</b> ${esc(JSON.stringify(it.lint.errors))} ` : ""}Status: <b>${esc(it.decision)}</b></p>
${it.decision === "pending" ? `<button data-d="approved">Approve</button> <button data-d="rejected">Reject</button>` : ""}${it.sentAt ? `<p>Sent ${esc(it.sentAt)}.</p>` : it.decision === "approved" ? (canSend ? `<button data-send="1">Send from your mailbox</button> ` : "") + `<a href="${esc(mailto)}">Open in your mail app to send</a>` : ""}` : `<p>Nothing to send.</p>`}</article>`;
  }).join("") || "<p>No replies yet. The agent polls your inbox on a schedule; press Poll now to check.</p>";
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sales Agent: approval queue</title>
<style>body{font:16px/1.5 system-ui;max-width:760px;margin:0 auto;padding:16px;color:#1b1f23;background:#fff}@media(prefers-color-scheme:dark){body{background:#14171a;color:#e6e8ea}blockquote{background:#1d2226}}article{border:1px solid #8884;border-radius:8px;padding:12px 16px;margin:16px 0}blockquote{margin:8px 0;padding:8px 12px;background:#f3f4f6;border-radius:6px}textarea{width:100%;box-sizing:border-box}.tag{font-size:12px;border:1px solid #8886;border-radius:10px;padding:1px 8px}.re{opacity:.7;margin:0}button{padding:6px 14px;margin-right:6px}small{opacity:.7;font-weight:400}</style>
<h1>Approval queue</h1><p>Last poll: ${esc(state.lastPoll || "never")}${state.lastError ? ` <b>Error: ${esc(state.lastError)}</b>` : ""}. <button id="poll">Poll now</button> <a href="/api/audit?token=${t}">Audit log</a> · <a href="/api/prospects.csv?token=${t}">Prospects CSV</a> · <a href="/api/suppression.csv?token=${t}">Suppression CSV</a></p>
<p>${canSend ? "Approving a draft does not send it. Press Send on an approved draft to send it from your mailbox, once, with an unsubscribe header." : "Sending is off (no SMTP_HOST). Approving marks a draft approved in the audit log and gives you a link to send it yourself."}</p>${rows}
<script>const T=${JSON.stringify(token)};const H={authorization:"Bearer "+T,"content-type":"application/json"};
document.getElementById("poll").onclick=async()=>{await fetch("/api/poll",{method:"POST",headers:H});location.reload()};
document.querySelectorAll("article button[data-move]").forEach(b=>b.onclick=async()=>{b.disabled=true;const a=b.closest("article");const r=await fetch("/api/crm-stage",{method:"POST",headers:H,body:JSON.stringify({id:a.dataset.id})});const j=await r.json();if(!r.ok){alert(j.error);b.disabled=false}else{alert(j.results.map(x=>x.crm+": "+(x.moved?"moved":x.error||x.reason)).join("\\n"));location.reload()}});
document.querySelectorAll("article button[data-send]").forEach(b=>b.onclick=async()=>{b.disabled=true;const a=b.closest("article");const r=await fetch("/api/send",{method:"POST",headers:H,body:JSON.stringify({id:a.dataset.id})});if(!r.ok){alert((await r.json()).error);b.disabled=false}else location.reload()});
document.querySelectorAll("article button[data-d]").forEach(b=>b.onclick=async()=>{const a=b.closest("article");const r=await fetch("/api/decide",{method:"POST",headers:H,body:JSON.stringify({id:a.dataset.id,decision:b.dataset.d,body:a.querySelector("textarea").value})});if(!r.ok){alert((await r.json()).error)}else location.reload()});</script></html>`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = createAgent();
  const port = Number(process.env.PORT || 8787), host = process.env.HOST || "127.0.0.1";
  a.server.listen(port, host, () => console.log(`Sales Agent approval queue on http://${host}:${port}/?token=… (mailbox read-only; ${process.env.SMTP_HOST ? "sends only on your click" : "sending is off"})`));
  const every = Math.max(1, Number(process.env.POLL_MINUTES || 10)) * 60000;
  a.poll().then((n) => console.log(`first poll: ${n} new`)); setInterval(() => a.poll(), every).unref?.();
}
