// License state machine. Pure functions over one JSON-serialisable object, no I/O.
import { randomBytes } from "node:crypto";

export const newState = () => ({ licenses: {}, seen: {}, keys: null });

const DAY = 86400;
const sec = (ms) => Math.floor(ms / 1000);
export const newId = () => `lic_${randomBytes(9).toString("base64url")}`;

// plan: {product, plan, features, machines, days (null = perpetual), subscription (bool)}
export function issue(state, { product, email, plan = "standard", features = [], machines = 1, expiresAt = null, stripe = {}, note }, now) {
  if (!product) throw new Error("product required");
  if (!/^[^@\s]+@[^@\s]+$/.test(email || "")) throw new Error("valid email required");
  const id = newId();
  state.licenses[id] = {
    id, product, email: email.toLowerCase(), plan, features, machines: Math.max(1, Number(machines) || 1),
    exp: expiresAt ? sec(expiresAt) : null, iat: sec(now), status: "active", stripe, note: note || null, activations: {}, history: [{ at: now, what: "issued" }],
  };
  return state.licenses[id];
}

export const claimsOf = (l) => ({ id: l.id, product: l.product, email: l.email, plan: l.plan, features: l.features, machines: l.machines, exp: l.exp, iat: l.iat });

export function revoke(state, id, reason, now) {
  const l = state.licenses[id];
  if (!l) return null;
  if (l.status !== "revoked") { l.status = "revoked"; l.history.push({ at: now, what: `revoked: ${reason}` }); }
  return l;
}

// Fixed-term licenses (subscriptions) are extended, never shortened, by a paid renewal.
export function extend(state, id, expiresAt, now) {
  const l = state.licenses[id];
  if (!l || l.status === "revoked" || l.exp === null) return null;
  const exp = sec(expiresAt);
  if (exp > l.exp) { l.exp = exp; l.history.push({ at: now, what: `extended to ${new Date(exp * 1000).toISOString().slice(0, 10)}` }); }
  return l;
}

export const findBy = (state, key, value) => Object.values(state.licenses).filter((l) => l.stripe && l.stripe[key] === value);

export function status(l, now) {
  if (l.status === "revoked") return "revoked";
  if (l.exp !== null && sec(now) >= l.exp) return "expired";
  return "active";
}

// -> {ok, reason, license}. reason: ok | unknown | revoked | expired | machine-limit | bad-fingerprint
export function activate(state, id, fingerprint, name, now) {
  const l = state.licenses[id];
  if (!l) return { ok: false, reason: "unknown" };
  if (!/^[\w.:-]{6,128}$/.test(fingerprint || "")) return { ok: false, reason: "bad-fingerprint" };
  const s = status(l, now);
  if (s !== "active") return { ok: false, reason: s, license: l };
  if (!l.activations[fingerprint]) {
    if (Object.keys(l.activations).length >= l.machines) return { ok: false, reason: "machine-limit", license: l };
    l.activations[fingerprint] = { at: now, name: String(name || "").slice(0, 80) };
    l.history.push({ at: now, what: "activated a machine" });
  }
  l.activations[fingerprint].lastSeen = now;
  return { ok: true, reason: "ok", license: l };
}

export function deactivate(state, id, fingerprint, now) {
  const l = state.licenses[id];
  if (!l || !l.activations[fingerprint]) return false;
  delete l.activations[fingerprint];
  l.history.push({ at: now, what: "deactivated a machine" });
  return true;
}

export function summary(state, now) {
  const by = { active: 0, expired: 0, revoked: 0 };
  let machines = 0;
  for (const l of Object.values(state.licenses)) { by[status(l, now)]++; machines += Object.keys(l.activations).length; }
  return { licenses: Object.keys(state.licenses).length, ...by, machines };
}

export { DAY };
