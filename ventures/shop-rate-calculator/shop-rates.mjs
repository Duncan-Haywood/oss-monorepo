/**
 * Handing the four computed rates to the rest of the site.
 *
 * `platform/pages/rates.mjs` injects a bar on every trade bid calculator that
 * reads one `localStorage` key on this origin and prefills the contractor's crew
 * wage, payroll burden, overhead and target margin. Until this venture existed,
 * the only way to fill that key was to type all four into a calculator by hand —
 * which is exactly the guess this tool replaces. So the last step of computing
 * them is writing them where 100+ calculators already look.
 *
 * **This is the producing half of a contract whose consuming half lives in
 * `platform/pages/rates.mjs`, and the two files cannot import each other**: the
 * platform module runs at build time in Node and injects a string of script,
 * while this one is fetched by the browser from the published venture directory.
 * A copied contract that drifts is the failure this repository has already paid
 * for once — a hand-written normaliser beside a tested one, where the browser ran
 * the copy and no test could see it. The guard here is `shop-rates.test.mjs`,
 * which reads `platform/pages/rates.mjs` and fails if the key, the field ids or
 * the ceilings stop matching. The copy is allowed; the drift is not.
 *
 * Nothing is uploaded. The key is on the visitor's own device, on this site's
 * origin, and clearing browser data clears it.
 */

/** Must equal `SHOP_RATES_KEY` in `platform/pages/rates.mjs`. */
export const SHOP_RATES_KEY = 'portfolio-shop-rates';

/**
 * Must equal the ids and ceilings of `SHOP_RATE_FIELDS` in
 * `platform/pages/rates.mjs`. A value over `max` is dropped there, so writing
 * one would store a rate that silently never appears on any calculator.
 */
export const CARRIED_FIELDS = Object.freeze([
  { id: 'hourlyWage', max: 100000 },
  { id: 'burdenRate', max: 500 },
  { id: 'overheadRate', max: 500 },
  { id: 'targetMargin', max: 99.9 },
]);

/**
 * Keep only the four, and only where the value is one the calculators accept.
 *
 * Returns `null` rather than `{}` when nothing survives, so "nothing to carry"
 * is one state instead of two that behave differently — the same choice
 * `normalizeRates` makes on the consuming side.
 */
export function normalizeCarry(values) {
  if (!values || typeof values !== 'object') return null;
  const out = {};
  for (const field of CARRIED_FIELDS) {
    const raw = values[field.id];
    if (raw === '' || raw === null || raw === undefined) continue;
    const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isFinite(value) || value < 0 || value > field.max) continue;
    out[field.id] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * What the key should hold after writing `values` over `existingRaw`.
 *
 * A merge, not a replacement, and for the same reason the bar merges: the stored
 * set is shared by every tool on the origin, and a partial write that dropped a
 * field the contractor had saved elsewhere would quietly return that calculator
 * to a stranger's ballpark. This tool computes all four, so in practice it
 * replaces all four — but it must not be the one place that assumes so.
 *
 * Returns `null` when there is nothing usable to write, so the caller can leave
 * storage untouched rather than overwriting a good set with an empty one.
 */
export function mergedRatesPayload(existingRaw, values) {
  const carry = normalizeCarry(values);
  if (!carry) return null;
  let existing = {};
  if (typeof existingRaw === 'string' && existingRaw !== '') {
    try {
      const parsed = JSON.parse(existingRaw);
      if (parsed && typeof parsed === 'object') {
        const source = parsed.rates && typeof parsed.rates === 'object' ? parsed.rates : parsed;
        if (source && typeof source === 'object') existing = { ...source };
      }
    } catch {
      // Storage is the visitor's own disk and can hold anything, including a
      // half-written value from a crashed tab. Unreadable is treated as absent
      // rather than thrown into the page: the failure mode of a throw here is a
      // calculator that stops calculating.
      existing = {};
    }
  }
  return JSON.stringify({ v: 1, rates: { ...existing, ...carry } });
}

/**
 * Write the rates. Returns `true` only when they are actually stored.
 *
 * Every storage call is guarded: a browser in private mode, or one configured to
 * refuse site data, throws on `getItem` and on `setItem`. The button says what
 * happened either way, because a control that reports success it did not have is
 * worse than one that admits it cannot save.
 */
export function saveCarriedRates(values, storage = globalThis.localStorage) {
  if (!storage) return false;
  let existingRaw = null;
  try {
    existingRaw = storage.getItem(SHOP_RATES_KEY);
  } catch {
    return false;
  }
  const payload = mergedRatesPayload(existingRaw, values);
  if (!payload) return false;
  try {
    storage.setItem(SHOP_RATES_KEY, payload);
    return true;
  } catch {
    return false;
  }
}

/** Read back what is stored, for the page to say what a calculator will open with. */
export function readCarriedRates(storage = globalThis.localStorage) {
  if (!storage) return null;
  let raw;
  try {
    raw = storage.getItem(SHOP_RATES_KEY);
  } catch {
    return null;
  }
  if (typeof raw !== 'string' || raw === '') return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  return normalizeCarry(parsed.rates && typeof parsed.rates === 'object' ? parsed.rates : parsed);
}
