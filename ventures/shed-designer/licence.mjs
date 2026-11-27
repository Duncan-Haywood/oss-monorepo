// @ts-check
// Licence-key check and Buy button for the branded shed build pack, sold through Paddle.
// The shared code is paddle.mjs, a copy of platform/billing/client.mjs that
// `node platform/billing/sync.mjs` keeps equal; the public values are in
// checkout.mjs, generated from platform/billing/catalogue.mjs.
//
// A key is checked offline against the portfolio's Ed25519 public key: no
// secret is held in the page, and no network call is made unless a lapsed
// subscription key asks for its renewal. The code is source visible
// (all rights reserved), so this is a
// convenience for honest buyers, not copy protection; say so on the page.
// Malformed keys never unlock and nothing here throws.
import { PADDLE } from "./checkout.mjs";
import { checkKey, cleanKey, onSale, wireBuy } from "./paddle.mjs";

export { cleanKey };

/** Whether the pack is on sale (every public value set). @param {typeof PADDLE} [cfg] */
export const onSaleNow = (cfg = PADDLE) => onSale(cfg);

/**
 * Turn the page's Buy link into a Paddle checkout. Returns false, leaving the
 * link hidden, while the pack is dark.
 * @param {HTMLElement|null} el
 * @param {{ onKey: (key: string) => void, onStatus?: (msg: string) => void }} h
 */
export function wireBuyButton(el, h) {
  return wireBuy(el, PADDLE, h);
}

/**
 * @param {string} key
 * @param {{ cfg?: Partial<typeof PADDLE>, fetch?: typeof fetch, now?: number }} [o]
 * @returns {Promise<{ valid: boolean, reason: string, renewed?: string }>}
 *   `renewed` is set when a lapsed subscription key was swapped for its renewal:
 *   the page shows it in place of the old key so the buyer keeps the current one.
 */
export async function checkLicence(key, o = {}) {
  const cfg = { ...PADDLE, ...(o.cfg || {}) };
  if (!cfg.publicKey) return { valid: false, reason: "licence check unavailable" };
  let renewed = "";
  const v = await checkKey(key, cfg, { fetch: o.fetch, now: o.now, onRenewed: (k) => { renewed = k; } });
  return renewed ? { valid: v.valid, reason: v.reason, renewed } : { valid: v.valid, reason: v.reason };
}
