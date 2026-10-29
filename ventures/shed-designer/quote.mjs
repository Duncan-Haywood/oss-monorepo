// @ts-check
// A quote request to a store's pro desk or a lumberyard, written from the
// shopping list: what the shed is, every line with its quantity and the price
// the tool used, the estimated total, and a request for a bulk or contractor
// price, delivery and substitutions. Nothing is sent from here: the visitor
// copies it or opens it in their own email app and attaches the plans.

import { fmtFtIn } from './lumber.mjs';
import { OFFERS } from './catalog.mjs';

export const STORES = {
  homedepot: { name: 'Home Depot', offerStore: 'Home Depot', desk: 'Pro Desk', note: 'The Pro Desk at your local store can quote a whole order; ask about volume pricing on large orders.' },
  lowes: { name: "Lowe's", offerStore: "Lowe's", desk: 'Pro Desk', note: "The Pro Desk at your local store can quote a whole order; ask about volume pricing on large orders." },
  menards: { name: 'Menards', offerStore: 'Menards', desk: 'contractor desk', note: 'Ask the contractor or pro desk at your local Menards for a whole-order quote.' },
  yard: { name: 'your local lumberyard', desk: 'sales desk', note: 'Independent yards often quote contractors and bulk orders directly and deliver.' },
};

const money = (n) => {
  const format = (n) => `$${Number(n).toFixed(2)}`;
  const text = format(Math.abs(n));
  return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};

/**
 * @param {import('./model.mjs').Shed} shed
 * @param {import('./estimate.mjs').Estimate} est
 * @param {keyof typeof STORES} storeKey
 * @param {{ name?: string, phone?: string, zip?: string, date?: string }} [who]
 */
export function quoteRequest(shed, est, storeKey = 'homedepot', who = {}) {
  const store = STORES[storeKey] || STORES.homedepot;
  const d = shed.design;
  const subject = `Quote request: materials for a ${fmtFtIn(d.length)} x ${fmtFtIn(d.width)} shed (${est.shopping.length} line items)`;
  const lines = [];
  lines.push(`Hello ${store.name} ${store.desk},`);
  lines.push('');
  lines.push(`I am building a ${fmtFtIn(d.length)} x ${fmtFtIn(d.width)} gable shed and would like one quote for the materials below, picked up together or delivered as one order.`);
  lines.push('');
  lines.push(`My estimate at listed prices is ${money(est.total)}. Because it is a single order of ${est.boards} boards plus sheet goods and roofing, could you tell me:`);
  lines.push('- your best price for the whole order, including any bulk, volume, Pro or contractor pricing;');
  lines.push(`- the delivery charge and earliest delivery date${who.zip ? ` to ZIP ${who.zip}` : ' (I can give you the address)'}${who.date ? `, ideally by ${who.date}` : ''};`);
  lines.push('- any item you would substitute with an equivalent you stock, and its price.');
  lines.push('');
  lines.push('Lumber is listed by board and length; the boards are framing grade (#2 or better), and "PT" is pressure-treated for ground contact.');
  lines.push('');
  let section = '';
  for (const r of est.shopping) {
    if (r.section !== section) { section = r.section; lines.push(`${section}:`); }
    lines.push(`  ${r.qty} ${r.unit}${r.qty === 1 ? '' : 's'}  ${r.name}  (est. ${money(r.price)} each, ${money(r.total)})`);
    // The store's own listing where we have one, so the desk can find the exact item.
    const ref = itemRef(r, /** @type {any} */ (store).offerStore);
    if (ref) lines.push(`      ${ref}`);
    else if (/** @type {any} */ (r).elsewhere) lines.push('      (we found no listing of yours for this: please quote your equivalent)');
  }
  lines.push('');
  lines.push(`Estimated total: ${money(est.total)}`);
  lines.push('');
  lines.push('I have attached the plans and the cut list in case they help. Thank you; I look forward to your quote.');
  lines.push('');
  lines.push(who.name || '[Your name]');
  lines.push(who.phone || '[Your phone]');
  const body = lines.join('\n');
  return { subject, body, store };
}

/**
 * This store's listing for a shopping line: its item or model number and link.
 * @param {any} r a shopping line @param {string | undefined} storeName
 */
export function itemRef(r, storeName) {
  if (!storeName) return '';
  const key = r.source?.key;
  const offer = key && /** @type {Record<string, any[]>} */ (OFFERS)[key]?.find((o) => o.store === storeName);
  if (offer) return `${storeName}: ${offer.model}, ${offer.url}`;
  if (r.source?.url && r.source.store === storeName) return `${storeName} listing: ${r.source.url}`;
  return '';
}

/** A mailto: link, or null when the draft is too long for a link to carry reliably. */
export function mailtoLink(q, to = '') {
  const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(q.subject)}&body=${encodeURIComponent(q.body)}`;
  return href.length <= 8000 ? href : null;
}
