// Lifecycle-email engine: contacts, events, sequences, due-time maths. Pure and
// browser-safe (no node: imports) so the page can run the very same code the
// server runs. Times are epoch milliseconds.
const H = 3_600_000;
export const LIMITS = { steps: 30, sequences: 50, props: 30, events: 100, maxWaitHours: 24 * 365 };
export const DEFAULTS = { minGapHours: 1, maxAttempts: 4 };

const bad = (m) => Object.assign(new Error(m), { status: 400 });
const NAME = /^[a-z0-9][a-z0-9_.:-]{0,59}$/i;

export function newState() { return { contacts: {}, sequences: [] }; }

export function normalizeEmail(raw) {
  const e = String(raw ?? "").trim().toLowerCase();
  return e.length <= 254 && /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/.test(e) ? e : null;
}

const PLACEHOLDER = /\{\{\s*([a-z_][a-z0-9_.]*)\s*(?:\|\s*([^}]*?))?\s*\}\}/gi;

export function validateSequences(list) {
  if (!Array.isArray(list)) throw bad("sequences must be an array");
  if (list.length > LIMITS.sequences) throw bad(`at most ${LIMITS.sequences} sequences`);
  const ids = new Set();
  return list.map((s, n) => {
    const at = `sequence ${n + 1}`;
    if (!s || typeof s !== "object") throw bad(`${at}: must be an object`);
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(s.id || "")) throw bad(`${at}: id must be lowercase letters, digits, dashes`);
    if (ids.has(s.id)) throw bad(`${at}: duplicate id ${s.id}`);
    ids.add(s.id);
    if (!NAME.test(s.trigger || "")) throw bad(`${s.id}: trigger must be an event name`);
    const exitOn = s.exitOn ?? [];
    if (!Array.isArray(exitOn) || exitOn.some((x) => !NAME.test(x))) throw bad(`${s.id}: exitOn must be a list of event names`);
    let win = null;
    if (s.sendHoursUTC != null) {
      const w = s.sendHoursUTC;
      if (!Array.isArray(w) || w.length !== 2 || !w.every((x) => Number.isInteger(x) && x >= 0 && x <= 24) || w[0] === w[1]) throw bad(`${s.id}: sendHoursUTC must be [startHour, endHour] with whole hours 0-24`);
      win = w;
    }
    if (!Array.isArray(s.steps) || !s.steps.length || s.steps.length > LIMITS.steps) throw bad(`${s.id}: needs 1-${LIMITS.steps} steps`);
    const steps = s.steps.map((t, i) => {
      const w = Number(t.waitHours ?? 0);
      if (!Number.isFinite(w) || w < 0 || w > LIMITS.maxWaitHours) throw bad(`${s.id} step ${i + 1}: waitHours must be 0-${LIMITS.maxWaitHours}`);
      if (typeof t.subject !== "string" || !t.subject.trim() || t.subject.length > 200) throw bad(`${s.id} step ${i + 1}: subject required (200 chars max)`);
      if (typeof t.text !== "string" || !t.text.trim() || t.text.length > 20_000) throw bad(`${s.id} step ${i + 1}: text required (20000 chars max)`);
      if (t.skipIf != null && !NAME.test(t.skipIf)) throw bad(`${s.id} step ${i + 1}: skipIf must be an event name`);
      return { waitHours: w, subject: t.subject.trim(), text: t.text, ...(t.skipIf ? { skipIf: t.skipIf } : {}) };
    });
    return { id: s.id, name: String(s.name || s.id).slice(0, 80), trigger: s.trigger, exitOn: [...new Set(exitOn)], reenroll: s.reenroll === true, sendHoursUTC: win, steps };
  });
}

const cleanProps = (p, into = {}) => {
  if (!p || typeof p !== "object" || Array.isArray(p)) return into;
  for (const [k, v] of Object.entries(p)) {
    if (!/^[a-z_][a-z0-9_]{0,39}$/i.test(k) || !["string", "number", "boolean"].includes(typeof v)) continue;
    if (!(k in into) && Object.keys(into).length >= LIMITS.props) continue;
    into[k] = typeof v === "string" ? v.slice(0, 500) : v;
  }
  return into;
};

export function upsert(state, email, props, at) {
  const e = normalizeEmail(email);
  if (!e) throw bad("a valid email is required");
  const c = (state.contacts[e] ||= { email: e, at, props: {}, ev: {}, en: {}, unsub: null, sup: null });
  cleanProps(props, c.props);
  return c;
}

const active = (en) => !en.end;
const endIt = (en, at, why) => { if (!en.end) en.end = { at, why }; };

// Record an event, end sequences that exit on it, enroll into sequences it triggers.
export function track(state, { email, event, props, at }) {
  if (!NAME.test(event || "")) throw bad("event must be a short name like signed_up");
  const c = upsert(state, email, props, at);
  const ev = (c.ev[event] ||= { n: 0, first: at, last: at });
  ev.n++; ev.last = at;
  if (Object.keys(c.ev).length > LIMITS.events) { const oldest = Object.entries(c.ev).sort((a, b) => a[1].last - b[1].last)[0][0]; if (oldest !== event) delete c.ev[oldest]; }
  const out = { email: c.email, enrolled: [], exited: [] };
  for (const s of state.sequences) {
    const en = c.en[s.id];
    if (en && active(en) && s.exitOn.includes(event)) { endIt(en, at, `exit:${event}`); out.exited.push(s.id); }
  }
  if (c.unsub || c.sup) return out;
  for (const s of state.sequences) {
    if (s.trigger !== event) continue;
    const en = c.en[s.id];
    if (en && (active(en) || !s.reenroll)) continue;
    c.en[s.id] = { at, i: 0, gap: 0, att: 0, retry: 0, sent: [], end: null };
    out.enrolled.push(s.id);
  }
  return out;
}

export function unsubscribe(state, email, at, reason = null) {
  const c = state.contacts[normalizeEmail(email)];
  if (!c) return false;
  if (reason) c.sup = reason; else c.unsub = c.unsub || at;
  for (const en of Object.values(c.en)) endIt(en, at, reason ? `suppressed:${reason}` : "unsubscribed");
  return true;
}

export const erase = (state, email) => delete state.contacts[normalizeEmail(email)];

const inWindow = (win, now) => {
  if (!win) return true;
  const h = new Date(now).getUTCHours(), [a, b] = win;
  return a < b ? h >= a && h < b : h >= a || h < b;
};

const cumulative = (s, i) => s.steps.slice(0, i + 1).reduce((t, x) => t + x.waitHours, 0) * H;

// Which messages are due at `now`. Mutates only bookkeeping: skipped steps and
// finished enrollments. Sends nothing. One message per enrollment per call, and
// never two within minGapHours of each other, so a long outage cannot dump a
// whole sequence into someone's inbox at once.
export function collectDue(state, now, opts = {}) {
  const o = { ...DEFAULTS, ...opts }, items = [], skipped = [];
  const byId = Object.fromEntries(state.sequences.map((s) => [s.id, s]));
  for (const c of Object.values(state.contacts)) {
    if (c.unsub || c.sup) continue;
    for (const [sid, en] of Object.entries(c.en)) {
      const s = byId[sid];
      if (!s || !active(en)) continue;
      for (;;) {
        if (en.i >= s.steps.length) { endIt(en, now, "completed"); break; }
        const step = s.steps[en.i];
        const dueAt = Math.max(en.at + cumulative(s, en.i), en.gap ? en.gap + o.minGapHours * H : 0, en.retry);
        if (now < dueAt) break;
        if (step.skipIf && c.ev[step.skipIf] && c.ev[step.skipIf].last >= en.at) {
          en.sent.push({ i: en.i, at: now, skipped: step.skipIf }); skipped.push({ email: c.email, seq: sid, step: en.i, why: step.skipIf }); en.i++; continue;
        }
        if (!inWindow(s.sendHoursUTC, now)) break;
        items.push({ email: c.email, seq: sid, step: en.i, dueAt });
        break;
      }
    }
  }
  items.sort((a, b) => a.dueAt - b.dueAt);
  return { items, skipped };
}

export function markSent(state, it, now) {
  const en = state.contacts[it.email].en[it.seq], s = state.sequences.find((x) => x.id === it.seq);
  en.sent.push({ i: it.step, at: now }); en.i = it.step + 1; en.gap = now; en.att = 0; en.retry = 0;
  if (en.i >= s.steps.length) endIt(en, now, "completed");
}

export function markFailed(state, it, now, opts = {}) {
  const o = { ...DEFAULTS, ...opts }, en = state.contacts[it.email].en[it.seq];
  en.att++;
  if (en.att >= o.maxAttempts) { en.sent.push({ i: it.step, at: now, failed: true }); en.i = it.step + 1; en.att = 0; en.retry = 0; return "gave-up"; }
  en.retry = now + 10 * 60_000 * 2 ** en.att;
  return "retry";
}

export function render(tpl, ctx) {
  return String(tpl).replace(PLACEHOLDER, (_, key, dflt) => {
    const k = key.startsWith("props.") ? key.slice(6) : key;
    const v = k === "email" ? ctx.email : k === "unsubscribe_url" ? ctx.unsubscribe_url : ctx.props?.[k];
    return v == null || v === "" ? (dflt ?? "") : String(v);
  });
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Plain text in, small safe HTML out: paragraphs, line breaks, https links.
export function toHtml(text) {
  return text.trim().split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)'"])/g, '<a href="$1">$1</a>').replace(/\n/g, "<br>")}</p>`).join("\n");
}

export function compose(state, it, { unsubUrl, address = "", product = "" }) {
  const s = state.sequences.find((x) => x.id === it.seq), step = s.steps[it.step], c = state.contacts[it.email];
  const ctx = { email: c.email, props: c.props, unsubscribe_url: unsubUrl };
  const subject = render(step.subject, ctx).replace(/[\r\n]+/g, " ").slice(0, 200);
  const body = render(step.text, ctx).trim();
  const foot = [product && `You are receiving this because you signed up for ${product}.`, `Unsubscribe: ${unsubUrl}`, address].filter(Boolean).join("\n");
  return { to: c.email, subject, text: `${body}\n\n--\n${foot}\n`, html: `${toHtml(body)}\n<hr><p style="font-size:12px;color:#666">${esc(product ? `You are receiving this because you signed up for ${product}. ` : "")}<a href="${esc(unsubUrl)}">Unsubscribe</a>${address ? `<br>${esc(address)}` : ""}</p>` };
}

export function stats(state) {
  const out = {};
  for (const s of state.sequences) out[s.id] = { name: s.name, enrolled: 0, active: 0, completed: 0, unsubscribed: 0, exits: {}, steps: s.steps.map((t, i) => ({ step: i + 1, subject: t.subject, sent: 0, skipped: 0, failed: 0, exitedAfter: 0 })), beforeFirst: 0 };
  let contacts = 0, unsub = 0, suppressed = 0;
  for (const c of Object.values(state.contacts)) {
    contacts++; if (c.unsub) unsub++; if (c.sup) suppressed++;
    for (const [sid, en] of Object.entries(c.en)) {
      const o = out[sid]; if (!o) continue;
      o.enrolled++;
      for (const m of en.sent) { const st = o.steps[m.i]; if (!st) continue; if (m.skipped) st.skipped++; else if (m.failed) st.failed++; else st.sent++; }
      if (!en.end) { o.active++; continue; }
      if (en.end.why === "completed") o.completed++;
      else if (en.end.why.startsWith("exit:")) {
        const ev = en.end.why.slice(5); o.exits[ev] = (o.exits[ev] || 0) + 1;
        const last = [...en.sent].reverse().find((m) => !m.skipped && !m.failed);
        if (last) o.steps[last.i].exitedAfter++; else o.beforeFirst++;
      } else o.unsubscribed++;
    }
  }
  return { contacts, unsubscribed: unsub, suppressed, sequences: out };
}

const csvCell = (v) => { const s = String(v ?? ""); return /^[=+\-@\t\r]/.test(s) || /[",\n]/.test(s) ? `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"` : s; };
export function toCsv(state) {
  const rows = [["email", "joined", "unsubscribed", "suppressed", "sequences"]];
  for (const c of Object.values(state.contacts)) rows.push([c.email, new Date(c.at).toISOString(), c.unsub ? new Date(c.unsub).toISOString() : "", c.sup || "", Object.entries(c.en).map(([k, e]) => `${k}:${e.end ? e.end.why : "active"}`).join(" ")]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

// Dry-run one contact through the real logic. events: [{ atHours, event, props? }].
export function simulate(sequences, events, { days = 30, email = "you@example.com", props = {}, minGapHours = DEFAULTS.minGapHours } = {}) {
  const state = newState(); state.sequences = validateSequences(sequences);
  const T0 = Date.UTC(2026, 0, 5, 9, 0), evs = [...events].sort((a, b) => a.atHours - b.atHours), timeline = [];
  let k = 0;
  for (let h = 0; h <= Math.min(days, 365) * 24; h++) {
    const now = T0 + h * H;
    while (k < evs.length && evs[k].atHours <= h) {
      const r = track(state, { email, event: evs[k].event, props: { ...props, ...evs[k].props }, at: now });
      timeline.push({ atHours: h, kind: "event", event: evs[k].event, enrolled: r.enrolled, exited: r.exited }); k++;
    }
    const { items, skipped } = collectDue(state, now, { minGapHours });
    for (const x of skipped) timeline.push({ atHours: h, kind: "skipped", seq: x.seq, step: x.step + 1, why: x.why });
    for (const it of items) { const m = compose(state, it, { unsubUrl: "https://example.com/u/…" }); markSent(state, it, now); timeline.push({ atHours: h, kind: "email", seq: it.seq, step: it.step + 1, subject: m.subject, text: m.text }); }
  }
  return timeline;
}
