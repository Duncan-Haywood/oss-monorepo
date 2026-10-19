// What to quote when a client who already holds a license asks to extend or
// widen it. Uses the same usage-rights formula as the main calculator, so the
// two pages never disagree: the extension fee is the rights price of the new
// scope minus the rights price of the scope already paid for.
import { calculate } from './app.mjs';

export const CHANNEL_FACTORS = Object.freeze({ web: 1, paid: 1.4, print: 1.25, outdoor: 1.6 });
export const TERRITORY_FACTORS = Object.freeze({ local: 1, national: 1.25, worldwide: 1.6 });
export const EXCLUSIVITY_FACTORS = Object.freeze({ none: 1, category: 1.35, full: 1.75 });

function scope(raw, label) {
  const channels = (raw.channels || []).map((name) => {
    if (!(name in CHANNEL_FACTORS)) throw new Error(`${label}: unknown channel "${name}"`);
    return { name, factor: CHANNEL_FACTORS[name] };
  });
  if (!channels.length) throw new Error(`${label}: select at least one channel`);
  const term = Number(raw.term);
  if (!Number.isFinite(term) || term < 1) throw new Error(`${label}: term must be at least 1 month`);
  if (!(raw.territory in TERRITORY_FACTORS)) throw new Error(`${label}: unknown territory`);
  if (!(raw.exclusivity in EXCLUSIVITY_FACTORS)) throw new Error(`${label}: unknown exclusivity`);
  return { channels, term, territory: TERRITORY_FACTORS[raw.territory], exclusivity: EXCLUSIVITY_FACTORS[raw.exclusivity] };
}

/**
 * @param {object} input
 * @param {number} input.creative      Creative / production fee of the original job (rights are 35% of it, scaled).
 * @param {number} input.images        Final images licensed.
 * @param {object} input.current       Scope already licensed: {channels, term, territory, exclusivity}.
 * @param {object} input.extended      Scope the client now wants, same shape.
 * @param {number} [input.rush]        Rush premium percent applied to the new rights price.
 * @param {number} [input.creditPercent] Share (0-100) of what the client already paid for rights that is credited
 *   against the new scope. 100 = full credit; lower it if the client's first term already ran its course.
 */
export function priceExtension(input) {
  const creative = Number(input.creative);
  if (!Number.isFinite(creative) || creative < 0) throw new Error('Creative fee must be zero or more');
  const images = Number(input.images);
  if (!Number.isInteger(images) || images < 1) throw new Error('Images must be a whole number of at least 1');
  const rush = Number(input.rush ?? 0);
  if (!Number.isFinite(rush) || rush < 0 || rush > 100) throw new Error('Rush premium must be between 0 and 100');
  const creditPercent = Number(input.creditPercent ?? 100);
  if (!Number.isFinite(creditPercent) || creditPercent < 0 || creditPercent > 100) throw new Error('Credit must be between 0 and 100');

  const current = scope(input.current, 'Current license');
  const extended = scope(input.extended, 'New license');
  const base = { creative, images };
  // The credit is for what was already paid, so the old scope is priced
  // without the rush premium the new request may carry.
  const paid = calculate({ ...base, ...current, rush: 0 }).rights;
  const wanted = calculate({ ...base, ...extended, rush }).rights;
  const credit = paid * (creditPercent / 100);
  const fee = Math.max(0, wanted - credit);
  return {
    paidRights: paid,
    newScopeRights: wanted,
    credit,
    extensionFee: fee,
    perImage: fee / images,
    // A scope that is narrower on every axis is not an extension; say so
    // rather than quoting a silent zero.
    narrower: wanted <= paid,
    // What the client would pay for the new scope from scratch, for contrast.
    freshQuote: creative + wanted,
  };
}
