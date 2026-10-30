// Babysitting Business Kit: the sitter-family agreement. A template, not legal advice.
//
// The sitter fills in her policies once (Settings for rates; the Agreements tab for the
// rest). agreementText() turns them into a plain-text agreement for one family: rates and
// minimums, late, holiday and cancellation fees, payment terms, the sick-child policy,
// photos and social media, transportation and car seats, house rules, screen time,
// emergency authorization and, only if she turns it on, a faith clause that says faith
// activities happen only when parents ask. A family's beliefs are never asked or scored.
//
// Versions. policyFingerprint() is a SHA-256 of the policy terms (not the family's name),
// so any change to a term is a new version. desk.agreements.versions lists them:
// [{ v, fingerprint, at }]. A family whose latest signature carries an older fingerprint
// "needs re-signing".
//
// Signing. With the sitter's server, each family gets a single-use link (/agree/<token>,
// 14 days). The page shows the exact text; the parent types their full name, picks a
// photo choice and ticks "I agree". The server stores on the family:
//   agreementSignatures: [{ id, at, name, version, fingerprint, hash, text, photos, via }]
// where hash is the SHA-256 of the text shown, recomputed by the server when they sign
// (if the policy changed while the page was open, the signature is refused).
//
// Photos. family.photoConsent is "none" | "private" | "public" (unset = never asked =
// none). canShowPhotos(family) is the one check the content and print lanes should use
// before a child's photo leaves the sitter's phone for a website, post or flyer.
//
// Pure functions shared by the browser app and server.mjs. Callers pass the time.

export const TOKEN_DAYS = 14;
export const LIMITS = { body: 8 * 1024, name: 120, text: 2000 };
export const PHOTO_CHOICES = {
  none: "No photos of my children, please.",
  private: "Photos may be sent to us only, never posted or shown to anyone else.",
  public: "Photos may also be posted on the sitter's website or social media, with first names only and no faces of other children; we can withdraw this at any time.",
};
export const NOT_LEGAL_ADVICE = "This agreement is a template, not legal advice. Read it, change anything that does not fit, and ask a lawyer where you live if you need certainty about what it means or whether it binds.";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const str = (s) => String(s ?? "").replace(/\r\n?/g, "\n").trim();
const money = (x) => { const n = Number(x) || 0; return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`; };

// ---------- SHA-256 (FIPS 180-4), synchronous so the browser and server agree ----------

const K = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
export function sha256(text) {
  const msg = new TextEncoder().encode(String(text));
  const len = msg.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(len / 0x20000000));
  dv.setUint32(total - 4, (len * 8) >>> 0);
  const H = Uint32Array.from([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return [...H].map((x) => x.toString(16).padStart(8, "0")).join("");
}

// ---------- the sitter's settings ----------

export const DEFAULT_AGREEMENT = {
  paymentDue: "at the end of each sit",
  paymentMethods: "cash or a payment app we agree on",
  latePaymentDays: 7,
  latePaymentFee: 0,
  latePickupGrace: 15,
  latePickupFee: 10,
  sick: "Please tell me before the sit if anyone at home has had a fever, vomiting or diarrhea in the last 24 hours. Either of us may then reschedule without a cancellation fee. If a child gets sick while I am there, I will call you and ask you to come home if they seem unwell.",
  drives: false,
  carSeat: "Children ride only in a car seat or booster that fits their age, height and weight, as your state's law requires. You provide and install it, and I check it before we leave.",
  houseRules: "",
  screenTime: "Screen time only as you set it. If you don't say, I keep it to a show or two and we play instead.",
  emergency: true,
  faithClause: false,
  otherTerms: "",
};

export function agreementSettings(profile = {}) {
  return { ...DEFAULT_AGREEMENT, ...((profile && profile.agreement) || {}) };
}

// The terms a version is made of: everything that appears in the text except the family.
export function policyTerms(profile = {}) {
  const a = agreementSettings(profile);
  const r = profile.rates || {};
  const site = profile.site || {};
  return {
    sitter: str(profile.businessName) || str(profile.name),
    name: str(profile.name),
    rates: { hourly: r.hourly, extraChild: r.extraChild, minimumHours: r.minimumHours, lateAfter: r.lateAfter, lateExtra: r.lateExtra, holidayMultiplier: r.holidayMultiplier, lastMinuteHours: r.lastMinuteHours, lastMinuteFee: r.lastMinuteFee, cancelHours: r.cancelHours, cancelFeePct: r.cancelFeePct },
    holidays: [...(profile.holidays || [])],
    cancellation: str(site.cancellation),
    paymentDue: str(a.paymentDue), paymentMethods: str(a.paymentMethods) || str(site.payment),
    latePaymentDays: Number(a.latePaymentDays) || 0, latePaymentFee: Number(a.latePaymentFee) || 0,
    latePickupGrace: Number(a.latePickupGrace) || 0, latePickupFee: Number(a.latePickupFee) || 0,
    sick: str(a.sick) || str(site.sick),
    drives: a.drives === true || a.drives === "yes", carSeat: str(a.carSeat),
    houseRules: str(a.houseRules), screenTime: str(a.screenTime),
    emergency: a.emergency !== false,
    faith: a.faithClause === true ? str(profile.faithActivities) || "faith-based activities such as Bible stories or prayers" : "",
    otherTerms: str(a.otherTerms),
  };
}

export function policyFingerprint(profile) {
  return sha256(JSON.stringify(policyTerms(profile)));
}

// ---------- versions ----------

export function versionsOf(desk) {
  const v = desk && desk.agreements && Array.isArray(desk.agreements.versions) ? desk.agreements.versions : [];
  return v.filter((x) => x && typeof x.fingerprint === "string");
}

// The current version: { v, fingerprint, at, recorded }. recorded=false means the policy
// changed and the new version is not in the list yet (ensureVersion adds it).
export function currentVersion(desk) {
  const fp = policyFingerprint(desk.profile);
  const list = versionsOf(desk);
  const hit = list.find((x) => x.fingerprint === fp);
  if (hit) return { ...hit, recorded: true };
  return { v: list.reduce((m, x) => Math.max(m, Number(x.v) || 0), 0) + 1, fingerprint: fp, at: "", recorded: false };
}

// Record the current version if it is new. Mutates desk.agreements; returns true if it did.
export function ensureVersion(desk, nowIso) {
  const cur = currentVersion(desk);
  if (cur.recorded) return false;
  desk.agreements = { ...(desk.agreements || {}), versions: [...versionsOf(desk), { v: cur.v, fingerprint: cur.fingerprint, at: nowIso }] };
  return true;
}

// ---------- the text ----------

export function agreementSections(profile, family = {}) {
  const t = policyTerms(profile);
  const r = t.rates;
  const me = t.name || "the sitter";
  const out = [];
  const rate = Number(r.hourly) ? [`${money(r.hourly)} an hour for one child${Number(r.extraChild) ? `, plus ${money(r.extraChild)} an hour for each additional child` : ""}.`, Number(r.minimumHours) ? `Each sit is at least ${r.minimumHours} hours; shorter sits are charged as ${r.minimumHours} hours.` : ""] : ["Rates as we agree before each sit."];
  out.push({ h: "Rates and minimums", body: rate.filter(Boolean).join(" ") });
  const fees = [
    r.lateAfter && Number(r.lateExtra) ? `Hours after ${r.lateAfter} are ${money(r.lateExtra)} an hour extra.` : "",
    Number(r.holidayMultiplier) && Number(r.holidayMultiplier) !== 1 ? `Holidays${t.holidays.length ? ` (month-day: ${t.holidays.join(", ")})` : ""} are charged at ${r.holidayMultiplier} times the usual rate.` : "",
    Number(r.lastMinuteFee) && Number(r.lastMinuteHours) ? `Sits booked with less than ${r.lastMinuteHours} hours' notice have a ${money(r.lastMinuteFee)} last-minute fee.` : "",
    t.latePickupFee ? `If you are home later than the agreed end time, ${t.latePickupGrace ? `after a ${t.latePickupGrace}-minute grace period ` : ""}each started 15 minutes costs ${money(t.latePickupFee)}. Please text me if you are running late.` : "",
  ].filter(Boolean);
  if (fees.length) out.push({ h: "Late, holiday and last-minute fees", body: fees.join(" ") });
  const cancel = t.cancellation || (Number(r.cancelHours) && Number(r.cancelFeePct) ? `If you cancel with less than ${r.cancelHours} hours' notice, the fee is ${r.cancelFeePct}% of the booked sit. If I have to cancel, I tell you as early as I can and there is no charge.` : "");
  if (cancel) out.push({ h: "Cancellations", body: cancel });
  out.push({ h: "Payment", body: [`Payment is due ${t.paymentDue || "at the end of each sit"}${t.paymentMethods ? `, by ${t.paymentMethods}` : ""}.`, t.latePaymentFee && t.latePaymentDays ? `Payments more than ${t.latePaymentDays} days late add a ${money(t.latePaymentFee)} fee.` : ""].filter(Boolean).join(" ") });
  if (t.sick) out.push({ h: "If a child is sick", body: t.sick });
  out.push({ h: "Photos and social media", body: `I take or share photos of your children only as you choose below. Whatever you choose, I never post your address, your children's last names, their school, or anything that shows where they are in real time. You can change your choice at any time by telling me; I then remove anything already posted.` });
  out.push({ h: "Transportation", body: t.drives ? `I may drive your children only when you ask me to for a specific sit. ${t.carSeat}` : `I do not drive your children anywhere. Outings are on foot only, and only if you have said they are fine.` });
  if (t.houseRules) out.push({ h: "House rules", body: t.houseRules });
  if (t.screenTime) out.push({ h: "Screen time", body: t.screenTime });
  if (t.emergency) out.push({ h: "Emergencies", body: `In an emergency I call 911 first, then you, then your emergency contact${family.emergency ? ` (${str(family.emergency)})` : ""}. You authorize me to get emergency medical care for your children if I cannot reach you, and to give the responders the allergy, medication and health information you have given me. You remain responsible for the cost of that care. Please keep your emergency contact and your children's allergies and medications up to date with me.` });
  if (t.faith) out.push({ h: "Faith activities", body: `I offer ${t.faith.replace(/[:;,.]?\s*only (?:when|if) .*$/i, "").replace(/[.:;,\s]+$/, "")} only if you ask for them. If you don't ask, there are none. Your family's beliefs make no difference to how I care for your children.` });
  if (t.otherTerms) out.push({ h: "Other terms", body: t.otherTerms });
  out.push({ h: "Changes and ending", body: `If I change these terms I will send you the new version to agree to before the next sit. Either of us may end this arrangement at any time; you pay for sits already done. ${me} keeps a copy of this agreement and your answers privately.` });
  return out;
}

export function agreementText(desk, family = {}, version = currentVersion(desk)) {
  const t = policyTerms(desk.profile);
  const who = str(family.contactName) || str(family.name) || "the family";
  const kids = (family.kids || []).map((k) => str(k && k.name)).filter(Boolean);
  const head = [
    `Babysitting agreement, version ${version.v}`,
    `Between ${t.name || "the sitter"}${t.sitter && t.sitter !== t.name ? ` (${t.sitter})` : ""} and ${who}${family.name && who !== str(family.name) ? ` of the ${str(family.name).replace(/\s+family$/i, "")} family` : ""}${kids.length ? `, for ${kids.join(", ")}` : ""}.`,
  ];
  const body = agreementSections(desk.profile, family).map((s, i) => `${i + 1}. ${s.h}\n${s.body}`);
  return [...head, "", ...body.join("\n\n").split("\n")].join("\n");
}

// ---------- status per family ----------

const sigs = (family) => (family && Array.isArray(family.agreementSignatures) ? family.agreementSignatures.filter((s) => s && s.fingerprint) : []);
export function latestSignature(family) {
  return sigs(family).sort((a, b) => String(a.at).localeCompare(String(b.at))).pop() || null;
}

// "unsigned" | "signed" | "needs re-signing", with the signature and current version.
export function agreementStatus(desk, family) {
  const cur = currentVersion(desk);
  const sig = latestSignature(family);
  if (!sig) return { status: "unsigned", current: cur };
  return { status: sig.fingerprint === cur.fingerprint ? "signed" : "needs re-signing", signature: sig, current: cur };
}

export function agreementSummary(desk, nowMs) {
  const out = { signed: 0, "needs re-signing": 0, unsigned: 0, linkOpen: 0 };
  for (const f of desk.families || []) {
    out[agreementStatus(desk, f).status]++;
    if (inviteState(f, nowMs) === "open") out.linkOpen++;
  }
  return out;
}

// ---------- photo consent ----------

export function photoConsent(family) {
  const v = family && family.photoConsent;
  return v === "public" || v === "private" ? v : "none";
}
// May a photo of this family's children be shown outside private messages to the family
// (website, social media, flyers, blog)? Only with a recorded "public" choice.
export function canShowPhotos(family) {
  return photoConsent(family) === "public";
}
// The sitter records a choice made on paper or in person.
export function recordPhotoConsent(family, choice, nowIso, via = "sitter") {
  if (!Object.hasOwn(PHOTO_CHOICES, choice)) throw new Error(`unknown photo choice: ${choice}`);
  return { ...family, photoConsent: choice, photoConsentAt: nowIso, photoConsentVia: via };
}

// ---------- signing ----------

export function newToken(rand = globalThis.crypto) {
  const b = new Uint8Array(16);
  rand.getRandomValues(b);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
function sameToken(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0 && a.length > 0;
}

// A fresh signing link for one family; any earlier link stops working.
export function createInvite(family, nowIso, { days = TOKEN_DAYS, token = newToken() } = {}) {
  return { ...family, agreementInvite: { token, created: nowIso, expires: new Date(Date.parse(nowIso) + days * 864e5).toISOString() } };
}
export function inviteState(family, nowMs) {
  const inv = family && family.agreementInvite;
  if (!inv) return "none";
  if (inv.used) return "used";
  return Date.parse(inv.expires) > nowMs ? "open" : "expired";
}
export function inviteLink(family, serverUrl) {
  if (!family.agreementInvite || !/^https?:\/\//.test(serverUrl || "")) return "";
  return `${String(serverUrl).replace(/\/+$/, "")}/agree/${family.agreementInvite.token}`;
}
export function findByToken(desk, token) {
  if (!TOKEN_RE.test(String(token || ""))) return null;
  let hit = null;
  for (const f of desk.families || []) if (f.agreementInvite && sameToken(f.agreementInvite.token, token)) hit = f;
  return hit;
}

export function signatureMessage(family, link, profile) {
  const first = str(family.contactName).split(/\s+/)[0] || "there";
  return `Hi ${first}! It's ${profile.name}. Here is my babysitting agreement: rates, cancellations, sick days, photos and emergencies, all in one place. Please read it and sign by typing your name: ${link}\nThe link works once, for ${TOKEN_DAYS} days. Ask me anything you'd like changed first.`;
}

// Validate a signing form against the text the server would show now.
export function readSignature(fields, desk, family, nowIso) {
  if (str(fields.website)) return { ok: false, spam: true };
  const name = str(fields.name).replace(/\s+/g, " ");
  if (name.length < 3 || !/\S\s+\S/.test(name)) return { ok: false, error: "Please type your full name (first and last)." };
  if (name.length > LIMITS.name) return { ok: false, error: `Please keep your name under ${LIMITS.name} characters.` };
  if (!(fields.agree === "yes" || fields.agree === "on" || fields.agree === true)) return { ok: false, error: "Please tick that you have read and agree." };
  const photos = str(fields.photos);
  if (!Object.hasOwn(PHOTO_CHOICES, photos)) return { ok: false, error: "Please choose one of the photo options." };
  const version = currentVersion(desk);
  const text = agreementText(desk, family, version);
  const hash = sha256(text);
  if (str(fields.hash) !== hash) return { ok: false, changed: true, error: "The agreement changed after you opened this page. Please read the new version and sign again." };
  return { ok: true, signature: { id: `${nowIso}|${hash.slice(0, 12)}`, at: nowIso, name, version: version.v, fingerprint: version.fingerprint, hash, text, photos, photoWording: PHOTO_CHOICES[photos], via: "link" } };
}

export function applySignature(family, sig) {
  const out = { ...family, agreementSignatures: [...sigs(family), sig] };
  if (out.agreementInvite && sig.via === "link") out.agreementInvite = { ...out.agreementInvite, used: sig.at };
  if (sig.photos) Object.assign(out, { photoConsent: sig.photos, photoConsentAt: sig.at, photoConsentVia: sig.via });
  return out;
}

// A paper copy signed in person, recorded by the sitter for the current version.
export function recordPaperSignature(desk, family, name, nowIso, photos) {
  const version = currentVersion(desk);
  const text = agreementText(desk, family, version);
  const hash = sha256(text);
  const sig = { id: `${nowIso}|${hash.slice(0, 12)}`, at: nowIso, name: str(name).slice(0, LIMITS.name), version: version.v, fingerprint: version.fingerprint, hash, text, via: "paper" };
  if (photos && Object.hasOwn(PHOTO_CHOICES, photos)) Object.assign(sig, { photos, photoWording: PHOTO_CHOICES[photos] });
  return applySignature(family, sig);
}

// ---------- sync: the server's copy and the app's copy meet ----------

// The app PUTs its whole desk. Signatures, used links and photo choices that reached the
// server since the last sync must survive, and so must versions only the server recorded.
export function mergeAgreements(serverDesk, incoming) {
  if (!incoming || typeof incoming !== "object") return incoming;
  const byId = new Map(((serverDesk && serverDesk.families) || []).map((f) => [f.id, f]));
  if (Array.isArray(incoming.families)) {
    incoming.families = incoming.families.map((inc) => {
      const srv = inc && byId.get(inc.id);
      if (!srv) return inc;
      const out = { ...inc };
      const seen = new Set();
      const all = [...sigs(inc), ...sigs(srv)].filter((s) => !seen.has(s.id) && seen.add(s.id)).sort((a, b) => String(a.at).localeCompare(String(b.at)));
      if (all.length) out.agreementSignatures = all;
      const si = srv.agreementInvite, ii = inc.agreementInvite;
      if (si && si.used && ii && ii.token === si.token && !ii.used) out.agreementInvite = si;
      if (srv.photoConsentAt && String(srv.photoConsentAt) > String(inc.photoConsentAt || "")) Object.assign(out, { photoConsent: srv.photoConsent, photoConsentAt: srv.photoConsentAt, photoConsentVia: srv.photoConsentVia });
      return out;
    });
  }
  const seen = new Set();
  const versions = [...versionsOf(incoming), ...versionsOf(serverDesk || {})].filter((v) => !seen.has(v.fingerprint) && seen.add(v.fingerprint)).sort((a, b) => String(a.at).localeCompare(String(b.at)) || (Number(a.v) || 0) - (Number(b.v) || 0));
  if (versions.length) incoming.agreements = { ...((incoming && incoming.agreements) || {}), versions: versions.map((v, i) => ({ ...v, v: i + 1 })) };
  return incoming;
}

// ---------- pages ----------

const STYLE = "body{font:17px/1.6 Georgia,serif;max-width:40rem;margin:2.5rem auto;padding:0 1rem;color:#2b2433;background:#fffaf6}h1{line-height:1.2}.terms{white-space:pre-wrap;background:#fff;border:1px solid #eadfd8;border-radius:10px;padding:14px 16px}label{display:block;margin-top:12px;font-weight:600}input[type=text]{width:100%;box-sizing:border-box;padding:9px;border:1px solid #bbb;border-radius:8px;font:inherit}.box{display:flex;gap:10px;align-items:flex-start;font-weight:400;background:#fff;border:1px solid #eadfd8;border-radius:10px;padding:10px 12px}.box input{margin-top:6px}button{margin-top:16px;background:#b0507a;color:#fff;border:0;border-radius:8px;padding:12px 18px;font:inherit;font-weight:700}.soft{color:#6a6175;font-size:.9rem}.hp{position:absolute;left:-9999px}.sig{border-top:1px solid #999;margin-top:2.2rem;padding-top:.3rem}.sigs{display:grid;grid-template-columns:1fr 1fr;gap:2rem}@media print{body{margin:0;background:#fff}button,.noprint{display:none}}";
const html = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title><style>${STYLE}</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;
const HEADERS = { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'", "cache-control": "no-store" };
const reply = (code, title, body, extra = {}) => ({ code, html: html(title, body), headers: HEADERS, ...extra });

const fmtAt = (iso) => String(iso || "").replace("T", " ").replace(/\.\d+Z$|Z$/, " UTC");

function signatureBlock(desk, family, sig) {
  const me = esc(desk.profile.name);
  if (sig) return `<h2>Signed</h2><p>Signed electronically by <b>${esc(sig.name)}</b> on ${esc(fmtAt(sig.at))}${sig.via === "paper" ? " (recorded by the sitter from a paper copy)" : " (typed name, through a private link)"}, version ${esc(sig.version)}.<br><span class="soft">SHA-256 of the exact text agreed to: <code>${esc(sig.hash)}</code></span></p>${sig.photoWording ? `<p>Photo choice: ${esc(sig.photoWording)}</p>` : ""}<div class="sigs"><div class="sig">${me}, sitter</div><div class="sig">Date</div></div>`;
  return `<h2>Signatures</h2><p>Photos (circle one): ${Object.values(PHOTO_CHOICES).map(esc).join(" / ")}</p><div class="sigs"><div class="sig">Parent or guardian (print and sign)</div><div class="sig">Date</div><div class="sig">${me}, sitter</div><div class="sig">Date</div></div>`;
}

// A printable copy: the current text, or the exact text of a signature if given.
export function agreementPrintPage(desk, family, { signature = null } = {}) {
  const st = agreementStatus(desk, family);
  const sig = signature || (st.status === "signed" ? st.signature : null);
  const text = sig ? sig.text : agreementText(desk, family);
  return html(`Babysitting agreement: ${family.name || "family"}`, `<p class="soft">${esc(NOT_LEGAL_ADVICE)}</p><div class="terms">${esc(text)}</div>${signatureBlock(desk, family, sig)}<p class="soft noprint">Print this page from your browser's menu.</p>`);
}

// GET or POST /agree/<token>. Returns { code, html, headers, family?, versionAdded?, notice? }.
export function handleAgreement(desk, method, token, fields, nowMs) {
  const fam = findByToken(desk, token);
  const gone = () => reply(404, "This link isn't working", `<p>This agreement link has expired, been used, or is not valid. Please ask your babysitter for a new one.</p>`);
  if (!fam) return gone();
  const me = desk.profile.name;
  const state = inviteState(fam, nowMs);
  if (state === "used") return reply(200, "Already signed", `<p>Thank you, this agreement has been signed. Ask ${esc(me)} for a copy any time.</p>`);
  if (state !== "open") return reply(410, "This link has expired", `<p>Please ask ${esc(me)} for a new link.</p>`);
  const nowIso = new Date(nowMs).toISOString();
  const versionAdded = ensureVersion(desk, nowIso);
  const action = `/agree/${esc(fam.agreementInvite.token)}`;
  const form = (error = "") => {
    const text = agreementText(desk, fam);
    return `${error ? `<p role="alert"><b>${esc(error)}</b></p>` : ""}<p>${esc(me)} asked you to read and sign this agreement. Ask them about anything you'd like changed before you sign.</p><p class="soft">${esc(NOT_LEGAL_ADVICE)}</p><div class="terms">${esc(text)}</div>
<form method="post" action="${action}"><input type="hidden" name="hash" value="${sha256(text)}">
<fieldset style="border:0;padding:0;margin:0"><legend><b>Photos of your children</b></legend>${Object.entries(PHOTO_CHOICES).map(([k, v]) => `<label class="box"><input type="radio" name="photos" value="${k}"${k === "none" ? " checked" : ""}> <span>${esc(v)}</span></label>`).join("")}</fieldset>
<label for="name">Type your full name to sign</label><input type="text" id="name" name="name" maxlength="${LIMITS.name}" autocomplete="name" required>
<label class="box"><input type="checkbox" name="agree" value="yes" required> <span>I have read this agreement and agree to it.</span></label>
<label class="hp" for="hp">Leave this empty</label><input class="hp" id="hp" name="website" tabindex="-1" autocomplete="off">
<button type="submit">Sign</button></form>
<p class="soft">When you sign, the time, your typed name, the version and a fingerprint (SHA-256) of the exact text above are saved for ${esc(me)} as a record of what was agreed. This link then stops working.</p>`;
  };
  if (method !== "POST") return reply(200, `Babysitting agreement with ${me}`, form(), { versionAdded });
  const r = readSignature(fields || {}, desk, fam, nowIso);
  if (r.spam) return reply(200, "Thank you", "<p>Thank you.</p>", { versionAdded });
  if (!r.ok) return reply(400, `Babysitting agreement with ${me}`, form(r.error), { versionAdded });
  const updated = applySignature(fam, r.signature);
  return reply(200, "Signed. Thank you!", `<p>${esc(me)} has your signed agreement (version ${esc(r.signature.version)}, signed ${esc(fmtAt(r.signature.at))}).</p><p class="soft">Fingerprint of the text you agreed to: <code>${esc(r.signature.hash)}</code>. Ask ${esc(me)} for a printed copy any time.</p>`, { family: updated, versionAdded, notice: `${r.signature.name} signed the agreement (version ${r.signature.version}) for ${fam.name || "a family"}. Photos: ${r.signature.photos}. Sync the app to see it.` });
}
