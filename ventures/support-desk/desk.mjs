// Pure help-desk logic: no Node-only imports, so the demo page can triage an email in the browser.

export const LIMITS = { subject: 200, text: 20_000, tickets: 20_000, tags: 10, tag: 30, macros: 200 };
export const STATUSES = ["open", "pending", "closed", "spam"];
export const PRIORITIES = ["low", "normal", "high"];

export function newState() { return { mailboxes: {}, tickets: {}, macros: [], seq: 0, mseq: 0 }; }

const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, n);
const slug = (s) => clean(s, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "support";
const rand = (n = 12) => { const a = new Uint8Array(n); globalThis.crypto.getRandomValues(a); return [...a].map((b) => b.toString(16).padStart(2, "0")).join(""); };
export const isEmail = (s) => /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i.test(s || "");

export function createMailbox(state, f, now = Date.now()) {
  const name = clean(f.name, 80).trim();
  if (!name) throw Object.assign(new Error("mailbox needs a name"), { status: 400 });
  let id = slug(name); while (state.mailboxes[id]) id += "x";
  const origins = String(f.origins || "").split(/[\s,]+/).filter((o) => /^https?:\/\/[^/\s]+$/.test(o));
  const replyTo = isEmail(f.replyTo) ? f.replyTo : "";
  const m = {
    id, name, replyTo, origins, created: now, inboundToken: rand(16),
    slaHours: Math.min(Math.max(Number(f.slaHours) || 24, 1), 720),
    ack: clean(f.ack, 1000).trim(),
  };
  state.mailboxes[id] = m;
  return m;
}

// ---- inbound email normalisation (Postmark, Mailgun, Resend-style, or plain JSON) ----

const parseAddr = (s) => {
  const str = String(s || "");
  const m = str.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim(), email: m[2].trim().toLowerCase() } : { name: "", email: str.trim().toLowerCase() };
};
const header = (list, name) => (Array.isArray(list) ? list.find((h) => String(h.Name || h.name).toLowerCase() === name)?.Value ?? list.find((h) => String(h.Name || h.name).toLowerCase() === name)?.value : undefined);

export function stripQuoted(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*On .{5,200}wrote:\s*$/i.test(l) || /^\s*-{2,}\s*Original Message\s*-{2,}/i.test(l) || /^_{10,}$/.test(l.trim())) break;
    if (/^\s*On .{5,200}$/.test(l) && /wrote:\s*$/i.test(lines[i + 1] || "")) break;
    if (/^\s*From:\s.+/.test(l) && /^\s*(Sent|Date):/i.test(lines[i + 1] || "")) break;
    out.push(l);
  }
  while (out.length && /^\s*(>.*)?$/.test(out[out.length - 1])) out.pop();
  return out.join("\n").trim();
}

export function normalizeInbound(b) {
  b = b && typeof b === "object" ? (b.data && typeof b.data === "object" ? { ...b, ...b.data } : b) : {};
  const from = parseAddr(b.FromFull?.Email ? `${b.FromFull.Name || ""} <${b.FromFull.Email}>` : b.from || b.From || b.sender);
  const hs = b.Headers || b.headers;
  const get = (k) => (hs && !Array.isArray(hs) ? hs[k] ?? hs[k.replace(/(^|-)(\w)/g, (_, a, c) => a + c.toUpperCase())] : header(hs, k));
  const raw = b.StrippedTextReply || b["stripped-text"] || b.TextBody || b.text || b["body-plain"] || b.body || "";
  const mid = String(b.MessageID || b["Message-Id"] || b["message-id"] || b.messageId || b.message_id || get("message-id") || "").trim();
  const irt = String(b.InReplyTo || b["In-Reply-To"] || b.inReplyTo || get("in-reply-to") || "").trim();
  const auto = String(get("auto-submitted") || b["Auto-Submitted"] || "").toLowerCase();
  const prec = String(get("precedence") || b.Precedence || "").toLowerCase();
  const automated = (auto && auto !== "no") || /bulk|junk|list|auto_reply/.test(prec) || Boolean(get("x-autoreply") || get("x-autorespond"))
    || /^(mailer-daemon|postmaster|no-?reply|donotreply|do-not-reply)@/.test(from.email) || /^(auto(matic)? ?reply|out of office|undeliverable|delivery status)/i.test(String(b.Subject || b.subject || ""));
  return {
    fromEmail: from.email, fromName: clean(b.FromName || from.name, 80), subject: clean(b.Subject || b.subject || "(no subject)", LIMITS.subject).trim() || "(no subject)",
    text: stripQuoted(clean(raw, LIMITS.text)) || "(empty message)", messageId: clean(mid, 300), inReplyTo: clean(irt, 300), automated,
  };
}

// ---- tickets ----

const REF = /\[#(\d{1,9})\]/;
export const refOf = (t) => `[#${t.n}]`;

const HIGH = [["urgent", 25], ["asap", 20], ["immediately", 20], ["outage", 30], ["is down", 25], ["cannot log in", 25], ["can't log in", 25], ["locked out", 25], ["charged twice", 35], ["double charged", 35], ["unauthorized charge", 35], ["chargeback", 35], ["refund", 20], ["cancel", 15], ["legal", 20], ["lawyer", 30], ["data loss", 30], ["security", 20], ["breach", 30], ["not working", 15], ["broken", 10], ["angry", 10], ["unacceptable", 20]];
const LOW = ["feature request", "suggestion", "would be nice", "just wondering", "no rush", "thanks!", "thank you", "love "];

export function triage(subject, text) {
  const hay = `${subject}\n${text}`.toLowerCase();
  let s = 0; const reasons = [];
  for (const [w, n] of HIGH) if (hay.includes(w)) { s += n; reasons.push(`mentions "${w.trim()}"`); }
  const caps = (subject.match(/[A-Z]/g) || []).length; if (subject.length > 8 && caps / subject.length > 0.7) { s += 10; reasons.push("subject in capitals"); }
  if ((hay.match(/!/g) || []).length >= 3) { s += 10; reasons.push("three or more exclamation marks"); }
  let low = 0; for (const w of LOW) if (hay.includes(w)) { low += 10; reasons.push(`mentions "${w.trim()}"`); }
  const priority = s >= 30 ? "high" : s - low <= -10 && s < 15 ? "low" : "normal";
  const links = (hay.match(/https?:\/\//g) || []).length;
  const spamWords = ["seo service", "backlink", "guest post", "crypto invest", "casino", "work from home", "buy followers", "first page of google", "cheap viagra"].filter((w) => hay.includes(w));
  const spam = spamWords.length >= 1 && links >= 1 || links >= 5 || spamWords.length >= 2;
  return { priority, spam, score: s, reasons: spam ? [...spamWords.map((w) => `spam phrase "${w}"`), links ? `${links} links` : ""].filter(Boolean) : reasons };
}

// Hours to the first reply: the mailbox target, quartered for high priority, doubled for low.
export const slaHoursFor = (mailbox, priority) => (mailbox.slaHours || 24) * (priority === "high" ? 0.25 : priority === "low" ? 2 : 1);

export function slaState(t, mailbox, now) {
  const due = t.created + slaHoursFor(mailbox, t.priority) * 3_600_000;
  if (t.firstResponseAt) return { due, state: t.firstResponseAt <= due ? "met" : "missed" };
  if (t.status === "closed" || t.status === "spam") return { due, state: "none" };
  return { due, state: now > due ? "overdue" : due - now < 3_600_000 ? "soon" : "ok" };
}

function findTicket(state, p, mailboxId) {
  const ref = p.subject.match(REF);
  if (ref) { const t = Object.values(state.tickets).find((x) => x.n === Number(ref[1])); if (t && t.mailbox === mailboxId && t.requester.email === p.fromEmail) return t; }
  if (p.inReplyTo) { const t = Object.values(state.tickets).find((x) => x.mailbox === mailboxId && x.msgIds.includes(p.inReplyTo) && x.requester.email === p.fromEmail); if (t) return t; }
  return null;
}

// Returns {ticket, created, ignored?}. Automated mail (bounces, out-of-office) is dropped so two robots cannot loop.
export function ingest(state, mailboxId, p, now = Date.now(), channel = "email") {
  if (p.automated) return { ignored: "automated message" };
  if (!isEmail(p.fromEmail)) return { ignored: "no valid sender" };
  const mb = state.mailboxes[mailboxId]; if (!mb) return { ignored: "no such mailbox" };
  if (mb.replyTo && p.fromEmail === mb.replyTo.toLowerCase()) return { ignored: "mail from the mailbox itself" };
  if (p.messageId && Object.values(state.tickets).some((t) => t.msgIds.includes(p.messageId))) return { ignored: "duplicate delivery" };
  const msg = { id: `m${++state.seq}`, dir: "in", at: now, from: p.fromName ? `${p.fromName} <${p.fromEmail}>` : p.fromEmail, text: p.text, channel };
  let t = findTicket(state, p, mailboxId);
  if (t) {
    t.messages.push(msg); if (p.messageId) t.msgIds.push(p.messageId);
    if (t.status === "closed" || t.status === "pending") t.status = "open";
    t.updated = now; t.lastCustomerAt = now;
    return { ticket: t, created: false };
  }
  const tri = triage(p.subject, p.text);
  const n = Object.keys(state.tickets).length ? Math.max(...Object.values(state.tickets).map((x) => x.n)) + 1 : 1;
  t = { id: `t${n}`, n, mailbox: mailboxId, subject: p.subject, requester: { email: p.fromEmail, name: p.fromName }, status: tri.spam ? "spam" : "open", priority: tri.priority, reasons: tri.reasons, tags: [], assignee: "", messages: [msg], msgIds: p.messageId ? [p.messageId] : [], created: now, updated: now, lastCustomerAt: now, firstResponseAt: null, token: rand(12) };
  state.tickets[t.id] = t;
  const all = Object.values(state.tickets);
  if (all.length > LIMITS.tickets) { all.sort((a, b) => a.updated - b.updated); for (const x of all.slice(0, all.length - LIMITS.tickets)) if (x.status === "closed" || x.status === "spam") delete state.tickets[x.id]; }
  return { ticket: t, created: true };
}

export function addReply(state, t, text, { status = "pending", author = "agent" } = {}, now = Date.now()) {
  t.messages.push({ id: `m${++state.seq}`, dir: "out", at: now, from: author, text: clean(text, LIMITS.text).trim() });
  if (!t.firstResponseAt) t.firstResponseAt = now;
  if (STATUSES.includes(status) && status !== "spam") { t.status = status; if (status === "closed") t.closedAt = now; }
  t.updated = now;
}
export function addNote(state, t, text, author = "agent", now = Date.now()) {
  t.messages.push({ id: `m${++state.seq}`, dir: "note", at: now, from: author, text: clean(text, LIMITS.text).trim() });
  t.updated = now;
}
export function updateTicket(t, f, now = Date.now()) {
  if (STATUSES.includes(f.status)) { t.status = f.status; if (f.status === "closed" && !t.closedAt) t.closedAt = now; if (f.status !== "closed") t.closedAt = undefined; }
  if (PRIORITIES.includes(f.priority)) t.priority = f.priority;
  if (f.assignee !== undefined) t.assignee = clean(f.assignee, 40).trim();
  if (f.tags !== undefined) t.tags = [...new Set(String(f.tags).split(/[,\s]+/).map((x) => clean(x, LIMITS.tag).toLowerCase().replace(/[^a-z0-9_-]/g, "")).filter(Boolean))].slice(0, LIMITS.tags);
  t.updated = now;
}

// Close tickets waiting on the customer for `days` days. Returns how many it closed.
export function autoClose(state, days, now = Date.now()) {
  if (!(days > 0)) return 0;
  let n = 0;
  for (const t of Object.values(state.tickets)) {
    const last = t.messages[t.messages.length - 1];
    if (t.status === "pending" && last && last.dir === "out" && now - last.at > days * 86_400_000) { t.status = "closed"; t.closedAt = now; t.updated = now; n++; }
  }
  return n;
}

// ---- canned replies and a keyword-weighted suggestion ----

export function addMacro(state, f) {
  const title = clean(f.title, 80).trim(), body = clean(f.body, 5000).trim();
  if (!title || !body) throw Object.assign(new Error("macro needs a title and a body"), { status: 400 });
  if (state.macros.length >= LIMITS.macros) throw Object.assign(new Error("too many macros"), { status: 400 });
  const m = { id: `r${++state.mseq}`, title, body, keywords: clean(f.keywords, 200).toLowerCase().trim() };
  state.macros.push(m);
  return m;
}
export const removeMacro = (state, id) => { const i = state.macros.findIndex((m) => m.id === id); if (i < 0) return false; state.macros.splice(i, 1); return true; };
export const renderMacro = (body, vars) => String(body).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : ""));

const STOP = new Set("the a an and or but if of to in on at for with is are was were be been it this that i you we my your our me us do does did can could would should will have has had not no yes so as by from there their they them what when how why please hi hello thanks thank regards dear".split(" "));
const tokens = (s) => String(s).toLowerCase().match(/[a-z0-9']{2,}/g)?.map((w) => w.replace(/'s$/, "")).filter((w) => !STOP.has(w)) || [];

// TF-IDF cosine between the customer's message and each macro (title and keywords count double).
export function suggest(text, macros, k = 3) {
  if (!macros.length) return [];
  const docs = macros.map((m) => tokens(`${m.title} ${m.title} ${m.keywords} ${m.keywords} ${m.body}`));
  const df = new Map(); for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) || 0) + 1);
  const idf = (w) => Math.log(1 + macros.length / (df.get(w) || 1));
  const vec = (ws) => { const v = new Map(); for (const w of ws) v.set(w, (v.get(w) || 0) + 1); for (const [w, c] of v) v.set(w, c * idf(w)); return v; };
  const norm = (v) => Math.sqrt([...v.values()].reduce((a, b) => a + b * b, 0)) || 1;
  const q = vec(tokens(text)), qn = norm(q);
  return macros.map((m, i) => { const d = vec(docs[i]); let dot = 0; for (const [w, x] of q) if (d.has(w)) dot += x * d.get(w); return { macro: m, score: Math.round((dot / (qn * norm(d))) * 100) / 100 }; })
    .filter((x) => x.score > 0.05).sort((a, b) => b.score - a.score).slice(0, k);
}

// ---- reporting ----

export function list(state, { status = "open", q = "", mailbox = "", assignee = "" } = {}, now = Date.now()) {
  const needle = q.toLowerCase().trim();
  const rank = (t) => { const s = slaState(t, state.mailboxes[t.mailbox] || {}, now).state; return s === "overdue" ? 0 : s === "soon" ? 1 : 2; };
  return Object.values(state.tickets)
    .filter((t) => (status === "all" ? t.status !== "spam" : t.status === status) && (!mailbox || t.mailbox === mailbox) && (!assignee || (assignee === "none" ? !t.assignee : t.assignee === assignee))
      && (!needle || `${t.n} ${t.subject} ${t.requester.email} ${t.tags.join(" ")} ${t.messages.map((m) => m.text).join(" ")}`.toLowerCase().includes(needle)))
    .sort((a, b) => (status === "open" ? rank(a) - rank(b) : 0) || b.updated - a.updated);
}

export function summary(state, now = Date.now()) {
  const ts = Object.values(state.tickets).filter((t) => t.status !== "spam");
  const by = Object.fromEntries(STATUSES.map((s) => [s, 0])); for (const t of Object.values(state.tickets)) by[t.status]++;
  const firsts = ts.filter((t) => t.firstResponseAt).map((t) => t.firstResponseAt - t.created).sort((a, b) => a - b);
  const median = firsts.length ? firsts[Math.floor(firsts.length / 2)] : null;
  const sla = ts.map((t) => slaState(t, state.mailboxes[t.mailbox] || {}, now).state);
  const met = sla.filter((s) => s === "met").length, missed = sla.filter((s) => s === "missed").length;
  const tags = {}; for (const t of ts) for (const g of t.tags) tags[g] = (tags[g] || 0) + 1;
  return { by, overdue: sla.filter((s) => s === "overdue").length, medianFirstResponseMin: median === null ? null : Math.round(median / 60_000), slaMetPct: met + missed ? Math.round((100 * met) / (met + missed)) : null, topTags: Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 8) };
}

const cell = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCsv(state) {
  const head = ["ticket", "subject", "requester", "status", "priority", "assignee", "tags", "mailbox", "created", "first_response_minutes", "messages"];
  const rows = Object.values(state.tickets).sort((a, b) => a.n - b.n).map((t) => [t.n, t.subject, t.requester.email, t.status, t.priority, t.assignee, t.tags.join(" "), t.mailbox, new Date(t.created).toISOString(), t.firstResponseAt ? Math.round((t.firstResponseAt - t.created) / 60_000) : "", t.messages.length]);
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

// Delete closed and spam tickets idle for `days` days.
export function purgeOlderThan(state, days, now = Date.now()) {
  if (!(days > 0)) return 0;
  let n = 0;
  for (const t of Object.values(state.tickets)) if ((t.status === "closed" || t.status === "spam") && now - t.updated > days * 86_400_000) { delete state.tickets[t.id]; n++; }
  return n;
}
