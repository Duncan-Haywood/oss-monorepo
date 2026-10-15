// Pure form-backend logic: no Node-only imports, so the demo page can score a submission in the browser.

export const SPAM_AT = 50;
export const LIMITS = { fields: 50, key: 64, value: 5000, subs: 5000 };

const PHRASES = [
  "backlink", "seo service", "seo package", "guest post", "rank #1", "first page of google", "buy followers", "cheap viagra",
  "casino", "crypto invest", "double your bitcoin", "work from home", "make money fast", "loan offer", "web traffic", "cialis",
  "adult dating", "click here", "limited time offer", "whatsapp me", "telegram", "forex", "payday", "weight loss",
];
const DISPOSABLE = new Set(["mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "yopmail.com", "trashmail.com", "sharklasers.com", "getnada.com"]);
const SHORTENERS = /\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|cutt\.ly|rb\.gy)\//i;

export function newState() { return { forms: {}, subs: [], seq: 0 }; }

const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, n);

// Keep only the fields a visitor typed. Keys starting with "_" are control fields (honeypot, timer), never data.
export function normalize(input) {
  const data = {};
  let n = 0;
  for (const [k, v] of Object.entries(input || {})) {
    if (k.startsWith("_")) continue;
    if (++n > LIMITS.fields) break;
    const key = clean(k, LIMITS.key).trim();
    if (!key || key === "__proto__" || key === "constructor") continue;
    const val = Array.isArray(v) ? v.map((x) => clean(x, LIMITS.value)).join(", ") : typeof v === "object" && v ? clean(JSON.stringify(v), LIMITS.value) : clean(v, LIMITS.value);
    data[key] = val;
  }
  return data;
}

const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
export const fingerprint = (data) => hash(JSON.stringify(Object.entries(data).sort()));

// ctx: {honeypot, loadedAt, now, recent: [fingerprints]}. Returns {score, reasons, spam}.
export function score(data, ctx = {}) {
  const reasons = [];
  let s = 0;
  const add = (n, why) => { s += n; reasons.push(why); };
  if (ctx.honeypot) add(100, "hidden field was filled in");
  const text = Object.values(data).join("\n");
  if (ctx.loadedAt && ctx.now) {
    const took = ctx.now - Number(ctx.loadedAt);
    if (Number.isFinite(took) && took >= 0 && took < 2000) add(40, `submitted ${Math.round(took)} ms after the page loaded`);
  }
  const links = (text.match(/https?:\/\/|www\./gi) || []).length;
  if (links > 5) add(50, `${links} links`); else if (links > 2) add(25, `${links} links`);
  if (SHORTENERS.test(text)) add(15, "link shortener");
  const lower = text.toLowerCase();
  const hits = PHRASES.filter((p) => lower.includes(p));
  if (hits.length) add(Math.min(60, 30 * hits.length), `spam phrase: ${hits.slice(0, 3).join(", ")}`);
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length > 20 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.6) add(15, "mostly capital letters");
  const email = Object.entries(data).find(([k]) => /e-?mail/i.test(k))?.[1];
  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) add(20, "email address is malformed");
    else if (DISPOSABLE.has(email.split("@")[1].toLowerCase())) add(20, "disposable email domain");
  }
  if (ctx.recent && ctx.recent.includes(fingerprint(data))) add(50, "identical to a recent submission");
  if (!text.trim()) add(60, "empty submission");
  return { score: Math.min(s, 100), reasons, spam: s >= SPAM_AT };
}

const id = (prefix, n) => `${prefix}${n}`;

export function createForm(state, { name, origins, redirect, notifyEmail }, now = Date.now()) {
  const nm = clean(name, 80).trim();
  if (!nm) throw Object.assign(new Error("name is required"), { status: 400 });
  const list = (Array.isArray(origins) ? origins : String(origins || "").split(/[\s,]+/)).filter(Boolean).map((o) => {
    let u; try { u = new URL(o); } catch { throw Object.assign(new Error(`bad origin: ${o}`), { status: 400 }); }
    if (!/^https?:$/.test(u.protocol)) throw Object.assign(new Error(`bad origin: ${o}`), { status: 400 });
    return u.origin;
  });
  let red = "";
  if (redirect) { try { const u = new URL(redirect); if (!/^https?:$/.test(u.protocol)) throw 0; red = u.href; } catch { throw Object.assign(new Error("redirect must be an http(s) URL"), { status: 400 }); } }
  const mail = clean(notifyEmail, 200).trim();
  if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) throw Object.assign(new Error("notify email is malformed"), { status: 400 });
  const key = id("f", ++state.seq) + Math.abs(hash(nm + now)).toString(36).slice(0, 5);
  state.forms[key] = { id: key, name: nm, origins: list, redirect: red, notifyEmail: mail, created: now, count: 0, spam: 0 };
  return state.forms[key];
}

export function addSubmission(state, formId, data, verdict, now = Date.now()) {
  const f = state.forms[formId];
  if (!f) throw Object.assign(new Error("no such form"), { status: 404 });
  const sub = { id: `s${++state.seq}`, form: formId, at: now, data, score: verdict.score, reasons: verdict.reasons, spam: verdict.spam, fp: fingerprint(data) };
  state.subs.push(sub);
  f.count++; if (sub.spam) f.spam++;
  if (state.subs.length > LIMITS.subs) {
    const gone = state.subs.splice(0, state.subs.length - LIMITS.subs);
    for (const g of gone) { const gf = state.forms[g.form]; if (gf) { gf.count = Math.max(0, gf.count - 1); if (g.spam) gf.spam = Math.max(0, gf.spam - 1); } }
  }
  return sub;
}

export const recentFingerprints = (state, formId, now, windowMs = 3_600_000) =>
  state.subs.filter((s) => s.form === formId && now - s.at < windowMs).map((s) => s.fp);

export function markSpam(state, subId, spam) {
  const s = state.subs.find((x) => x.id === subId);
  if (!s) return null;
  if (s.spam !== !!spam) { const f = state.forms[s.form]; if (f) f.spam += spam ? 1 : -1; s.spam = !!spam; s.manual = true; }
  return s;
}

export function removeSubmission(state, subId) {
  const i = state.subs.findIndex((x) => x.id === subId);
  if (i < 0) return false;
  const [s] = state.subs.splice(i, 1);
  const f = state.forms[s.form]; if (f) { f.count = Math.max(0, f.count - 1); if (s.spam) f.spam = Math.max(0, f.spam - 1); }
  return true;
}

export function removeForm(state, formId) {
  if (!state.forms[formId]) return false;
  delete state.forms[formId];
  state.subs = state.subs.filter((s) => s.form !== formId);
  return true;
}

export const submissions = (state, formId, { spam = false } = {}) => state.subs.filter((s) => s.form === formId && s.spam === spam).reverse();

// Spreadsheet-safe CSV: a leading = + - @ would run as a formula when opened in Excel or Sheets.
const cell = (v) => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
export function toCsv(subs) {
  const cols = [];
  for (const s of subs) for (const k of Object.keys(s.data)) if (!cols.includes(k)) cols.push(k);
  const rows = [["received", ...cols, "spam_score"].map(cell).join(",")];
  for (const s of subs) rows.push([new Date(s.at).toISOString(), ...cols.map((c) => s.data[c] ?? ""), s.score].map(cell).join(","));
  return rows.join("\n") + "\n";
}

export function notification(form, sub, base) {
  const lines = Object.entries(sub.data).map(([k, v]) => `${k}: ${v}`);
  return { subject: `New ${form.name} submission`, text: `${lines.join("\n")}\n\nView all: ${base}/admin/f/${form.id}\n` };
}
