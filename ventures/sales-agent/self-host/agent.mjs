// Sales Agent M4a: the self-hosted inbox agent. Polls the deployer's own mailbox over IMAP (read-only: EXAMINE and
// BODY.PEEK, so mail is never marked read, moved or deleted), runs each new message through the inbox agent, and
// serves an approval queue on a local port. State and an append-only audit log live in DATA_DIR. Sending (M4b) is off
// unless SMTP_HOST is set, and even then only a person's click on "Send" on a draft they approved sends it, once,
// to the address that wrote in, with a List-Unsubscribe header, never to a suppressed address, and at most
// SEND_MAX_PER_DAY a day. Anything automatic is M5 and waits on the owner.
//
// Env: IMAP_HOST IMAP_USER IMAP_PASS [IMAP_PORT=993] [IMAP_SECURE=true] [IMAP_BOX=INBOX] [TLS_CA_FILE=ca.pem] ADMIN_TOKEN (required)
//      [SMTP_HOST SMTP_PORT=587 SMTP_SECURE=false SMTP_USER SMTP_PASS SEND_FROM SEND_MAX_PER_DAY=20] [DATA_DIR=./data] [PORT=8787] [HOST=127.0.0.1] [POLL_MINUTES=10] [SINCE_DAYS=7] [OFFER_JSON=path]
//      [SENT_BOX=auto|off|<mailbox name>] [SENT_SINCE_DAYS=60]: also read the Sent folder's headers (Date, To, Cc, Subject only) as the daily queue's done list
//      [PIPEDRIVE_API_TOKEN] [HUBSPOT_TOKEN]: write each read reply back as a note on the existing contact (and set the CRM opt-out on an unsubscribe)
//      plus LLM_PROVIDER/LLM_MODEL/LLM_API_KEY (or ANTHROPIC_API_KEY ...) for the optional model, same limits.
import http from "node:http";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { Imap, parseMessage, replyBlocks, findSentBox } from "./imap.mjs";
import { headerMap, splitHead } from "../mime.mjs";
import { sentRecord } from "../mailfile.mjs";
import { runDaily, csvQueue, csvLeftOut } from "../daily.mjs";
import { parseReplies, parseCsv, csv, iso, toCsv, addBusinessDays } from "../engine.mjs";
import { runInboxWithModel } from "../ai.mjs";
import { configFromEnv } from "../byok.mjs";
import { buildMessage, sendMail } from "./smtp.mjs";
import { oauthWanted, tokenProvider } from "./oauth.mjs";
import { runResearch } from "../research.mjs";
import { runPrep } from "../prep.mjs";
import { runFollowUp } from "../followup.mjs";
import { crmFromEnv } from "./crm.mjs";
import { buildInvite } from "../invite.mjs";

// IMAP SEARCH date: 07-Nov-2026 (RFC 3501 date: 1*2DIGIT "-" month "-" 4DIGIT, English month names).
const imapDate = (ms) => new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).replace(/ /g, "-").replace("Sept", "Sep");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Call outcomes on the Today's queue (2026-11-12): "done" for any touch; a call may instead be "spoke", "voicemail" or
// "no_answer". A no-answer call comes back the next business day, up to MAX_TRIES tries, then the cadence moves on.
export const OUTCOMES = ["done", "spoke", "voicemail", "no_answer"];
export const MAX_TRIES = 3;
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
  state.sent ||= []; state.sentBox ||= null; state.tasks ||= ""; // added 2026-11-11: older state files lack them
  state.done ||= []; // added 2026-11-12: touches marked done on the page ({ email, step, channel, at, outcome })
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

  /** M7d: call prep and post-call follow-up from what this agent already holds (the person's replies, the prospects table, the suppression list). Sends nothing; a follow-up draft is returned for a person to copy, not queued. */
  function callInput(email, notes) {
    const addr = String(email || "").trim().toLowerCase();
    if (!/^[\w.+'-]+@[\w.-]+\.\w+$/.test(addr)) return null;
    const thread = state.items.filter((x) => !x.outbound && String(x.from).toLowerCase() === addr)
      .map((x) => `From: ${x.from}\nSubject: ${x.subject}\nDate: ${x.receivedAt || ""}\n\n${x.body}`).join("\n---\n");
    return { email: addr, prospects: state.prospects, replies: thread, calls: callsFor(addr), notes: String(notes || "").slice(0, 20000), suppression: state.suppression.map((s) => s.email).join("\n"), offer, today: iso(now()) };
  }
  function prep(email, notes) { const i = callInput(email, notes); if (!i) return { error: "send { email, notes? }" }; const d = runPrep(i); audit("prep", { email: i.email, stop: d.stop || undefined, known: d.known.length }); return d; }
  function followUp(email, notes) { const i = callInput(email, notes); if (!i) return { error: "send { email, notes }" }; const d = runFollowUp(i); audit("followup_drafted", { email: i.email, approval: d.approval }); return d; }

  /** Your own sent mail, headers only, into state.sent ({ date, to, subject }), the daily queue's done list. Same
   * connection as the inbox poll; EXAMINE and BODY.PEEK, so nothing is marked or moved. A changed UIDVALIDITY or
   * mailbox name starts the read again, as the old UIDs no longer name the same messages. */
  async function readSent(c) {
    const want = String(env.SENT_BOX || "auto").trim();
    if (/^(off|false|0|no)$/i.test(want)) return null;
    const name = /^auto$/i.test(want) ? findSentBox(await c.list()) : want;
    if (!name) { state.sentError = "no Sent folder found (set SENT_BOX to its name)"; return 0; }
    const { uidValidity } = await c.examine(name);
    const keep = state.sentBox && state.sentBox.name === name && state.sentBox.uidValidity === uidValidity;
    if (!keep) { state.sent = []; state.sentBox = { name, uidValidity, lastUid: 0 }; }
    const days = Number(env.SENT_SINCE_DAYS || 60);
    const crit = state.sentBox.lastUid ? `UID ${state.sentBox.lastUid + 1}:*` : `SINCE ${imapDate(now() - days * 864e5)}`;
    const uids = (await c.search(crit)).filter((u) => u > state.sentBox.lastUid).sort((a, b) => a - b).slice(0, 2000);
    let n = 0;
    for (const uid of uids) {
      const raw = await c.fetchHeaders(uid);
      const r = sentRecord(headerMap(splitHead(raw)[0]), parseMessage(raw).headers.subject);
      if (r) { state.sent.push({ ...r, uid }); n++; }
      state.sentBox.lastUid = Math.max(state.sentBox.lastUid, uid);
    }
    // Keep the window the daily run needs: a step is matched on subject at any date, so keep a long tail, capped.
    const cutoff = iso(now() - Math.max(days, 365) * 864e5);
    state.sent = state.sent.filter((m) => m.date >= cutoff).slice(-20000);
    state.sentError = null;
    return n;
  }

  /** "What do I do today?" from the cadence task list (Sales Cadence Builder CSV), this agent's prospects and
   * suppression list, and the sent mail it has read, plus what it sent itself. Sends nothing. tasks is kept, so a
   * later call (or the page) can rebuild today's queue after the next poll without pasting it again. */
  function daily({ tasks, done, today, maxOverdueDays } = {}) {
    if (tasks != null) { state.tasks = String(tasks).slice(0, 2e6); save(); }
    if (!state.tasks.trim()) return { error: "send { tasks: <cadence task list CSV> } once; it is kept for later runs" };
    const marks = callMarks();
    done = [String(done || ""), ...marks.done].filter(Boolean).join("\n");
    const own = state.items.filter((x) => x.sentAt && x.draft).map((x) => ({ date: x.sentAt.slice(0, 10), to: [String(x.from).toLowerCase()], subject: x.draft.subject || (x.outbound || /^re:/i.test(x.subject) ? x.subject : "Re: " + x.subject) }));
    const d = runDaily({ tasks: state.tasks, prospects: state.prospects, suppression: state.suppression.map((s) => s.email).join("\n"), done: done || "", sent: [...state.sent, ...own], retry: marks.retry, today: today || iso(now()), ...(Number.isFinite(Number(maxOverdueDays)) && maxOverdueDays !== "" && maxOverdueDays != null ? { maxOverdueDays: Number(maxOverdueDays) } : {}) });
    audit("daily", { due: d.summary.due, alreadySent: d.summary.alreadySent, held: d.summary.held, dropped: d.summary.dropped, sentRead: d.summary.sentRead, sentBox: state.sentBox?.name || null });
    const day = d.today;
    return { ...d, doneToday: state.done.filter((x) => String(x.at || "").startsWith(day)), sentBox: state.sentBox?.name || null, sentError: state.sentError || null, queueCsv: csvQueue(d), leftOutCsv: csvLeftOut(d) };
  }

  /** A call, LinkedIn touch or letter never shows in mail, so the Sent folder cannot tick it off: the page's Done button
   * does, here. Only a step that is in the kept task list can be marked; undo removes the mark. Kept in state and fed to
   * runDaily as its done input on every later run, so the step is not queued again. */
  function markDone({ email, step, undo, outcome } = {}) {
    const e = String(email || "").trim().toLowerCase(), s = String(step || "").trim();
    if (!e || !s) return { error: "send { email, step }" };
    const out = outcome == null || outcome === "" ? "done" : String(outcome);
    if (!OUTCOMES.includes(out)) return { error: `outcome must be one of ${OUTCOMES.join(", ")}` };
    if (/[\n|]/.test(e) || /\n/.test(s)) return { error: "bad email or step" };
    const row = parseCsv(state.tasks).find((r) => String(r.email || "").trim().toLowerCase() === e && String(r.step || "").trim().toLowerCase() === s.toLowerCase());
    if (!row) return { error: "no such step in the kept task list" };
    const channel = String(row.channel || "").toLowerCase();
    if (out !== "done" && channel !== "call") return { error: "a call outcome needs a call step" };
    const same = (x) => x.email === e && x.step.toLowerCase() === s.toLowerCase();
    const mine = () => state.done.filter(same);
    const finished = () => { const m = mine(); return m.some((x) => (x.outcome || "done") !== "no_answer") || m.length >= MAX_TRIES; };
    let changed = false;
    if (undo) {
      // Undo takes back the latest mark on the step only, so a third "no answer" can be undone without losing the first two.
      const i = state.done.findLastIndex(same);
      if (i >= 0) { state.done.splice(i, 1); changed = true; audit("touch_undone", { email: e, step: row.step }); }
    } else if (!finished()) {
      const today = iso(now());
      // One no-answer per step per day: a second click the same day is a slip, not another try.
      if (!(out === "no_answer" && mine().some((x) => String(x.at || "").startsWith(today)))) {
        state.done.push({ email: e, step: String(row.step).trim(), channel, at: new Date(now()).toISOString(), outcome: out });
        state.done = state.done.slice(-20000); changed = true;
        audit("touch_done", { email: e, step: row.step, channel: row.channel, outcome: out });
      }
    }
    save();
    const tries = mine().filter((x) => x.outcome === "no_answer").length;
    const r = callMarks().retry.find((x) => x.email === e && x.step.toLowerCase() === s.toLowerCase());
    return { ok: true, done: finished(), changed, outcome: undo ? null : out, tries, ...(r ? { retry_on: r.on } : {}) };
  }

  /** The kept marks, read for runDaily: a step is done once it has any mark other than "no answer", or MAX_TRIES of them;
   * a call with only no-answers so far comes back the next business day after the last one. */
  function callMarks() {
    const by = new Map();
    for (const x of state.done) { const k = `${x.email}|${String(x.step).toLowerCase()}`; if (!by.has(k)) by.set(k, []); by.get(k).push(x); }
    const done = [], retry = [];
    for (const list of by.values()) {
      const misses = list.filter((x) => x.outcome === "no_answer");
      if (misses.length < list.length || misses.length >= MAX_TRIES) { done.push(`${list[0].email}|${list[0].step}`); continue; }
      const last = misses.map((x) => String(x.at).slice(0, 10)).sort().at(-1);
      retry.push({ email: list[0].email, step: list[0].step, on: addBusinessDays(last, 1), tries: misses.length, last });
    }
    return { done, retry };
  }

  /** Every call outcome marked for one person, oldest first, for call prep. */
  const callsFor = (addr) => state.done.filter((x) => x.email === addr && x.channel === "call").map((x) => ({ date: String(x.at || "").slice(0, 10), step: x.step, outcome: x.outcome || "done" })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  async function poll() {
    const oauth = oauthWanted(env);
    const need = (oauth ? ["IMAP_HOST", "IMAP_USER"] : ["IMAP_HOST", "IMAP_USER", "IMAP_PASS"]).filter((k) => !env[k]);
    if (need.length) { state.lastError = `missing ${need.join(", ")}`; save(); return 0; }
    const c = new Imap({ host: env.IMAP_HOST, port: Number(env.IMAP_PORT || 993), secure: env.IMAP_SECURE !== "false", ca });
    try {
      await c.connect(); if (oauth) await c.loginXoauth2(env.IMAP_USER, await getToken()); else await c.login(env.IMAP_USER, env.IMAP_PASS); await c.examine(env.IMAP_BOX || "INBOX");
      const since = state.lastUid ? `UID ${state.lastUid + 1}:*` : `SINCE ${imapDate(now() - Number(env.SINCE_DAYS || 7) * 864e5)}`;
      const uids = (await c.search(since)).filter((u) => u > state.lastUid).sort((a, b) => a - b).slice(0, 200);
      const blocks = [];
      for (const uid of uids) {
        const m = parseMessage(await c.fetchRaw(uid));
        const own = (m.headers.from.match(/[\w.+'-]+@[\w.-]+/) || [""])[0].toLowerCase() === String(env.IMAP_USER).toLowerCase();
        const id = m.headers.messageId || `${env.IMAP_BOX || "INBOX"}:${uid}`;
        // replyBlocks: one block per failed recipient of a bounce, so each address is stopped, not only the first.
        if (!own && (m.text || m.dsn)) replyBlocks(m).forEach((block, i) => blocks.push({ id: i ? `${id}#${i}` : id, block }));
        state.lastUid = Math.max(state.lastUid, uid);
      }
      const n = await ingest(blocks);
      let sentNew = null;
      try { sentNew = await readSent(c); } catch (e) { state.sentError = String(e.message || e).replace(env.IMAP_PASS || "\0", "***"); }
      state.lastPoll = new Date(now()).toISOString(); state.lastError = null; save();
      audit("poll", { uids: uids.length, ingested: n, ...(sentNew != null ? { sentRead: sentNew, sentBox: state.sentBox?.name } : {}), ...(state.sentError ? { sentError: state.sentError } : {}) });
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

  /** A tentative .ics for the exact time an interested reply proposed (invite.mjs). Nothing is sent; audited. */
  function invite(id) {
    const it = state.items.find((x) => x.id === id);
    if (!it) return null;
    if (it.triage.category !== "interested" || !it.triage.slots?.length) return { error: "no proposed time in this reply" };
    const addr = (it.from.match(/[\w.+'-]+@[\w.-]+/) || [""])[0].toLowerCase();
    if (state.suppression.some((s) => s.email === addr)) return { error: "that address is on your suppression list" };
    const k = state.prospects.find((x) => String(x.email || "").toLowerCase() === addr);
    const v = buildInvite({ email: addr, name: it.name, company: k?.company, slot: it.triage.slots[0], today: iso(now()), offer });
    if (v.ok) audit("invite", { id, to: addr, file: v.filename });
    return v.ok ? v : { error: v.why };
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
    if (req.method === "GET" && url.pathname === "/voice.mjs") { res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" }); return res.end(readFileSync(new URL("../voice.mjs", import.meta.url))); }
    if (req.method === "GET" && url.pathname === "/api/queue") return json(res, 200, { lastPoll: state.lastPoll, lastError: state.lastError, items: state.items });
    if (req.method === "GET" && url.pathname === "/api/prospects.csv") { res.writeHead(200, { "content-type": "text/csv" }); return res.end(toCsv(state.prospects, ["email", "first_name", "company", "status", "stage", "paused_until", "last_reply"])); }
    if (req.method === "GET" && url.pathname === "/api/suppression.csv") { res.writeHead(200, { "content-type": "text/csv" }); return res.end(toCsv(state.suppression, ["email", "reason", "date", "evidence"])); }
    if (req.method === "GET" && url.pathname === "/api/audit") { res.writeHead(200, { "content-type": "application/x-ndjson" }); return res.end(existsSync(auditFile) ? readFileSync(auditFile) : ""); }
    if (req.method === "POST" && url.pathname === "/api/daily/done") {
      let raw = ""; for await (const ch of req) { raw += ch; if (raw.length > 10000) return json(res, 413, { error: "too large" }); }
      let b; try { b = JSON.parse(raw); } catch { return json(res, 400, { error: "bad json" }); }
      const r = markDone(b);
      return json(res, r.error ? 422 : 200, r);
    }
    if (url.pathname === "/api/daily" && (req.method === "GET" || req.method === "POST")) {
      let b = {};
      if (req.method === "POST") { let raw = ""; for await (const ch of req) { raw += ch; if (raw.length > 2e6) return json(res, 413, { error: "too large" }); } try { b = JSON.parse(raw || "{}"); } catch { return json(res, 400, { error: "bad json" }); } }
      else b = { done: url.searchParams.get("done") || "", today: url.searchParams.get("today") || undefined };
      const r = daily(b);
      if (r.error) return json(res, 422, r);
      const fmt = url.searchParams.get("format");
      if (fmt === "queue.csv" || fmt === "left-out.csv") { res.writeHead(200, { "content-type": "text/csv", "content-disposition": `attachment; filename="${r.today}-${fmt}"`, "cache-control": "no-store" }); return res.end(fmt === "queue.csv" ? r.queueCsv : r.leftOutCsv); }
      return json(res, 200, r);
    }
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
    if (req.method === "POST" && (url.pathname === "/api/prep" || url.pathname === "/api/followup")) {
      let raw = ""; for await (const ch of req) { raw += ch; if (raw.length > 100000) return json(res, 413, { error: "too large" }); }
      let b; try { b = JSON.parse(raw); } catch { return json(res, 400, { error: "bad json" }); }
      const r = url.pathname === "/api/prep" ? prep(b.email, b.notes) : followUp(b.email, b.notes);
      return json(res, r.error ? 422 : 200, r);
    }
    if (req.method === "GET" && url.pathname === "/api/invite") {
      const r = invite(url.searchParams.get("id") || "");
      if (!r) return json(res, 404, { error: "no such reply" });
      if (r.error) return json(res, 422, r);
      res.writeHead(200, { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="${r.filename}"`, "cache-control": "no-store" });
      return res.end(r.ics);
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
  return { server, state, poll, ingest, daily, markDone, readSent, queueResearch, prep, followUp, decide, send, moveDeal, invite, audit };
}

function page(state, token, canSend, canMove) {
  const t = encodeURIComponent(token);
  const rows = state.items.slice().reverse().map((it) => {
    const d = it.draft;
    const mailto = d ? `mailto:${encodeURIComponent(it.from)}?subject=${encodeURIComponent(it.outbound || /^re:/i.test(it.subject) ? it.subject : "Re: " + it.subject)}&body=${encodeURIComponent(d.body)}` : "";
    return `<article data-id="${esc(it.id)}"><h3>${esc(it.name || it.from)} <small>&lt;${esc(it.from)}&gt;</small> <span class="tag">${esc(it.triage.category)}</span></h3>
<p class="re">${esc(it.subject)}</p><blockquote>${esc(it.body).replace(/\n/g, "<br>")}</blockquote>
${it.triage.category === "interested" && it.triage.slots?.some((x) => x.time && !x.after) ? `<p><a href="/api/invite?id=${encodeURIComponent(it.id)}&amp;token=${t}">Calendar file for the time they proposed (${esc(it.triage.slots[0].text)})</a> <small>tentative, no time zone: confirm theirs first</small></p>` : ""}
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
<section id="today"><h2>Today's queue</h2><p>Paste the task list from Sales Cadence Builder once (it is kept). Press Done on a LinkedIn touch or letter when you have made it (those never show in mail), and it leaves the queue for good. A call takes its outcome: Spoke or Voicemail ends the step; No answer brings the call back the next business day, up to ${MAX_TRIES} tries, and call prep lists every try. Undo takes back the latest mark. The queue drops anyone who stopped, bounced or is suppressed, and any email step already in your Sent folder${state.sentBox ? ` (<b>${esc(state.sentBox.name)}</b>, ${state.sent.length} messages read)` : ""}${state.sentError ? ` <b>Sent folder: ${esc(state.sentError)}</b>` : ""}. Nothing is sent.</p>
<textarea id="dq-tasks" rows="4" placeholder="${state.tasks ? "Task list kept; paste a new one to replace it" : "date,channel,step,prospect,company,email,subject,body"}"></textarea>
<p><button id="dq-run">Build today's queue</button> <a href="/api/daily?format=queue.csv&amp;token=${t}">queue.csv</a> · <a href="/api/daily?format=left-out.csv&amp;token=${t}">left-out.csv</a></p>
<p id="dq-status" role="status"></p><ul id="dq-list" hidden></ul><p id="dq-donetoday" hidden></p><pre id="dq-out" hidden style="white-space:pre-wrap"></pre></section>
<section id="calldesk"><h2>Call desk</h2><p>Before a call, prepare a brief from what this agent already holds on the person (their replies, the prospects table, the suppression list). After it, paste or dictate your notes and draft a follow-up. Nothing is sent.</p>
<p><input id="cd-email" type="email" placeholder="their email" size="32"> <button id="cd-prep">Prepare the call</button></p>
<textarea id="cd-notes" rows="6" placeholder="Call notes, one point per line"></textarea>
<p><button id="cd-follow">Draft the follow-up</button> <button id="cd-dictate" hidden>Dictate notes</button> <button id="cd-read" hidden>Read it aloud</button></p>
<p id="cd-status" role="status"></p><pre id="cd-out" hidden style="white-space:pre-wrap"></pre>
<p id="cd-voice" hidden style="font-size:14px;opacity:.8">Voice is optional and uses your browser's own speech tools; in Chrome and Edge dictation sends audio to the browser maker's speech service. Say "next point" for a new line. This page records and stores nothing.</p></section>
<script>const T=${JSON.stringify(token)};const H={authorization:"Bearer "+T,"content-type":"application/json"};
const dqEl=(tag,text,attrs)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;for(const k in attrs||{})e.setAttribute(k,attrs[k]);return e};
const dqMark=async(email,step,undo,outcome)=>{const r=await fetch("/api/daily/done",{method:"POST",headers:H,body:JSON.stringify({email,step,undo,outcome})});if(!r.ok){alert((await r.json()).error);return}dqBuild()};
const dqBuild=async(tasks)=>{const r=await fetch("/api/daily",{method:"POST",headers:H,body:JSON.stringify(tasks?{tasks}:{})});const j=await r.json();const o=document.getElementById("dq-out");if(!r.ok){document.getElementById("dq-status").textContent=j.error;return}
const L=document.getElementById("dq-list");L.replaceChildren();for(const q of j.queue){const li=dqEl("li",(q.overdue?"[overdue "+q.date+"] ":"")+q.channel+": "+(q.prospect||q.email)+(q.company?", "+q.company:"")+" ("+q.step+")"+(q.channel==="call"&&q.call_window?" "+q.call_window:"")+(q.tries?" [try "+(q.tries+1)+", no answer last "+q.last+"]":"")+" ");if(q.email){const opts=q.channel==="call"?[["Spoke","spoke"],["Voicemail","voicemail"],["No answer","no_answer"]]:[["Done","done"]];for(const [lab,oc] of opts){const b=dqEl("button",lab,{"data-done":oc});b.onclick=()=>{li.querySelectorAll("button").forEach(x=>x.disabled=true);dqMark(q.email,q.step,false,oc)};li.append(b," ")}}L.append(li)}L.hidden=!j.queue.length;
const D=document.getElementById("dq-donetoday");D.replaceChildren();if(j.doneToday.length){D.append("Marked done today: ");j.doneToday.forEach((x,i)=>{if(i)D.append("; ");D.append(x.email+" ("+x.step+(x.outcome&&x.outcome!=="done"?", "+x.outcome.replace("_"," "):"")+") ");const u=dqEl("button","Undo",{"data-undo":"1"});u.onclick=()=>dqMark(x.email,x.step,true);D.append(u)})}D.hidden=!j.doneToday.length;
o.textContent=j.brief;o.hidden=false;document.getElementById("dq-status").textContent=j.summary.due+" due, "+j.summary.alreadySent+" already sent, "+(j.summary.alreadyDone-j.summary.alreadySent)+" marked done. Nothing was sent."};
document.getElementById("dq-run").onclick=()=>dqBuild(document.getElementById("dq-tasks").value.trim());
document.getElementById("poll").onclick=async()=>{await fetch("/api/poll",{method:"POST",headers:H});location.reload()};
document.querySelectorAll("article button[data-move]").forEach(b=>b.onclick=async()=>{b.disabled=true;const a=b.closest("article");const r=await fetch("/api/crm-stage",{method:"POST",headers:H,body:JSON.stringify({id:a.dataset.id})});const j=await r.json();if(!r.ok){alert(j.error);b.disabled=false}else{alert(j.results.map(x=>x.crm+": "+(x.moved?"moved":x.error||x.reason)).join("\\n"));location.reload()}});
document.querySelectorAll("article button[data-send]").forEach(b=>b.onclick=async()=>{b.disabled=true;const a=b.closest("article");const r=await fetch("/api/send",{method:"POST",headers:H,body:JSON.stringify({id:a.dataset.id})});if(!r.ok){alert((await r.json()).error);b.disabled=false}else location.reload()});
document.querySelectorAll("article button[data-d]").forEach(b=>b.onclick=async()=>{const a=b.closest("article");const r=await fetch("/api/decide",{method:"POST",headers:H,body:JSON.stringify({id:a.dataset.id,decision:b.dataset.d,body:a.querySelector("textarea").value})});if(!r.ok){alert((await r.json()).error)}else location.reload()});</script>
<script type="module">import { appendDictation, speakable } from "/voice.mjs?token=${t}";
const $=(i)=>document.getElementById(i),out=(t,s)=>{$("cd-out").textContent=t;$("cd-out").hidden=false;$("cd-status").textContent=s+" Nothing was sent."};
const call=async(path)=>{const email=$("cd-email").value.trim();if(!email){$("cd-status").textContent="Type their email first.";return}const r=await fetch(path,{method:"POST",headers:H,body:JSON.stringify({email,notes:$("cd-notes").value})});const j=await r.json();if(!r.ok){$("cd-status").textContent=j.error||"Failed.";return}return j};
$("cd-prep").onclick=async()=>{const p=await call("/api/prep");if(p)out(p.brief,p.stop?"Do not chase this person: "+p.stop+".":p.unknown.length+" of 9 discovery fields still unknown.")};
$("cd-follow").onclick=async()=>{const f=await call("/api/followup");if(f)out((f.issues&&f.issues.length?f.issues.map(i=>"> "+i).join("\\n")+"\\n\\n":"")+(f.draft?"Subject: "+f.draft.subject+"\\n\\n"+f.draft.body+"\\n\\n"+(f.lint.ok?"Checks passed.":"Fix first: "+f.lint.errors.join("; ")):""),f.approval==="needs_approval"?"Draft ready for you to read and approve.":f.approval==="fix_first"?"Draft needs fixes before you use it.":"No draft.")};
const SR=window.SpeechRecognition||window.webkitSpeechRecognition,TTS=window.speechSynthesis;if(SR||TTS)$("cd-voice").hidden=false;
if(SR){$("cd-dictate").hidden=false;let rec=null;$("cd-dictate").onclick=()=>{if(rec){rec.stop();return}rec=new SR();rec.lang="en-US";rec.continuous=true;rec.interimResults=false;
rec.onresult=(e)=>{let h="";for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)h+=e.results[i][0].transcript+" ";if(h)$("cd-notes").value=appendDictation($("cd-notes").value,h)};
rec.onend=()=>{rec=null;$("cd-dictate").textContent="Dictate notes"};rec.onerror=(e)=>{$("cd-status").textContent="Dictation stopped: "+(e.error||"unknown")+"."};$("cd-dictate").textContent="Stop dictating";rec.start()}}
if(TTS){$("cd-read").hidden=false;$("cd-read").onclick=()=>{if(TTS.speaking){TTS.cancel();$("cd-read").textContent="Read it aloud";return}const t=speakable($("cd-out").textContent);if(!t){$("cd-status").textContent="Prepare the call or draft the follow-up first.";return}const u=new SpeechSynthesisUtterance(t);u.onend=u.onerror=()=>{$("cd-read").textContent="Read it aloud"};$("cd-read").textContent="Stop reading";TTS.speak(u)}}
</script></html>`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = createAgent();
  const port = Number(process.env.PORT || 8787), host = process.env.HOST || "127.0.0.1";
  a.server.listen(port, host, () => console.log(`Sales Agent approval queue on http://${host}:${port}/?token=… (mailbox read-only; ${process.env.SMTP_HOST ? "sends only on your click" : "sending is off"})`));
  const every = Math.max(1, Number(process.env.POLL_MINUTES || 10)) * 60000;
  a.poll().then((n) => console.log(`first poll: ${n} new`)); setInterval(() => a.poll(), every).unref?.();
}
