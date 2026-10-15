// Referral-ladder waitlist. Pure state functions; no node: imports so the browser demo shares them.
const DISPOSABLE = new Set("mailinator.com guerrillamail.com 10minutemail.com tempmail.com trashmail.com yopmail.com sharklasers.com getnada.com throwaway.email".split(" "));
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

// Canonical form so one person cannot join five times with dots and plus tags.
export function normalizeEmail(raw) {
  const e = String(raw || "").trim().toLowerCase();
  if (e.length > 254 || !EMAIL.test(e)) return null;
  let [local, domain] = e.split("@");
  if (domain === "googlemail.com") domain = "gmail.com";
  local = local.split("+")[0];
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return local ? `${local}@${domain}` : null;
}
export const isDisposable = (email) => DISPOSABLE.has(String(email).split("@")[1]);

export const newState = () => ({ seq: 1, people: {}, byEmail: {}, byCode: {}, invited: 0 });

// opts: {code, ref, ip, now, token, newCode}. Returns {person, created}.
export function join(state, rawEmail, { ref, ip = "", now, token, code }) {
  const email = normalizeEmail(rawEmail);
  if (!email) throw Object.assign(new Error("Enter a valid email address."), { status: 400 });
  if (isDisposable(email)) throw Object.assign(new Error("Please use a permanent email address."), { status: 400 });
  const existing = state.byEmail[email];
  if (existing) return { person: state.people[existing], created: false };
  const id = String(state.seq++);
  const referrer = ref && state.byCode[ref] ? state.byCode[ref] : null;
  const p = { id, email, code, token, ip, joinedAt: now, confirmedAt: null, referredBy: referrer && referrer !== id ? referrer : null, referrals: 0, invitedAt: null };
  state.people[id] = p; state.byEmail[email] = id; state.byCode[code] = id;
  return { person: p, created: true };
}

// A referral counts only once the friend confirms their own email, and a referrer
// stops earning at `cap` (so a script cannot buy first place with fake signups).
export function confirm(state, token, now, { cap = 25 } = {}) {
  const p = Object.values(state.people).find((x) => x.token === token);
  if (!p) return null;
  if (!p.confirmedAt) {
    p.confirmedAt = now;
    const r = p.referredBy && state.people[p.referredBy];
    if (r && r.confirmedAt && r.referrals < cap && r.ip !== p.ip) r.referrals++;
    else if (r && r.confirmedAt && r.ip === p.ip) p.referredBy = null; // same network as the referrer: no credit
  }
  return p;
}

// Priority key: earlier join is better, each confirmed referral jumps `boost` places.
export const priority = (p, boost) => Number(p.id) - boost * p.referrals;

export function ranking(state, { boost = 5 } = {}) {
  return Object.values(state.people).filter((p) => p.confirmedAt && !p.invitedAt)
    .sort((a, b) => priority(a, boost) - priority(b, boost) || Number(a.id) - Number(b.id));
}
export function position(state, p, opts) {
  const i = ranking(state, opts).findIndex((x) => x.id === p.id);
  return i < 0 ? null : i + 1;
}

export function nextInvites(state, n, now, opts) {
  const batch = ranking(state, opts).slice(0, Math.max(0, n));
  batch.forEach((p) => { p.invitedAt = now; });
  state.invited += batch.length;
  return batch;
}

export function tierFor(tiers, referrals) {
  let hit = null;
  for (const t of tiers) if (referrals >= t.referrals) hit = t;
  return hit;
}

export function stats(state, opts) {
  const ps = Object.values(state.people);
  const confirmed = ps.filter((p) => p.confirmedAt);
  const referred = ps.filter((p) => p.referredBy).length;
  return { signups: ps.length, confirmed: confirmed.length, waiting: ranking(state, opts).length, invited: state.invited, referred, kFactor: ps.length ? Math.round((ps.reduce((n, p) => n + p.referrals, 0) / Math.max(1, confirmed.length)) * 100) / 100 : 0 };
}

export function toCsv(state, opts) {
  const q = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [["position", "email", "confirmed", "referrals", "joined", "invited"]];
  const pos = new Map(ranking(state, opts).map((p, i) => [p.id, i + 1]));
  for (const p of Object.values(state.people)) rows.push([pos.get(p.id) ?? "", p.email, p.confirmedAt ? "yes" : "no", p.referrals, new Date(p.joinedAt).toISOString(), p.invitedAt ? new Date(p.invitedAt).toISOString() : ""]);
  return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
}
