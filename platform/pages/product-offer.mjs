// One footer line on a free lead-magnet tool that names the product with depth
// doing the same job in full (portfolio/monetization/funnel.json).
//
// Why: the north star is paying subscribers (prompts/goals.md, "North star"),
// and the 1,400 free tools exist to bring traffic and leads to the 20 products
// (LICENSING_TRANSITION.md). Until 2026-11-24 no free tool's page named any of
// them, so a visitor who needed more than a calculator had no path there.
//
// The pairings are hand-curated, not computed: the related-tools word overlap
// sent a Docker secrets check to the shift roster builder and a Schedule C
// categorizer to the league scheduler ("schedule"), and a wrong offer on a
// page costs the trust the free tool earned. Report:
// docs/reports/2026-11-24-lead-magnet-funnel.md.
import { readFileSync } from 'node:fs';

export const FUNNEL_FILE = new URL('../../portfolio/monetization/funnel.json', import.meta.url);

/** The attribute the chrome counter matches on (`product_offer_click:<slug>`). */
export const OFFER_ATTR = 'data-pf-offer';

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function loadFunnel(file = FUNNEL_FILE) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/**
 * Map from feeder slug to `{ product, pitch }`. Products not in `served`
 * (a Set of published slugs, when given) are left out, so an offer never links
 * to a page the build does not publish. A feeder listed under two products
 * throws: one line per page, and the choice is a person's to make.
 */
export function offerTable(funnel, served = null) {
  const table = new Map();
  for (const [product, { pitch, feeders }] of Object.entries(funnel.products ?? {})) {
    if (served && !served.has(product)) continue;
    for (const feeder of feeders) {
      if (table.has(feeder)) throw new Error(`${feeder} feeds both ${table.get(feeder).product} and ${product}`);
      if (feeder === product) throw new Error(`${product} lists itself as a feeder`);
      table.set(feeder, { product, pitch });
    }
  }
  return table;
}

/** The footer line, or '' when there is no offer. `name` is the product's short name. */
export function renderProductOffer({ offer, name, toRoot }) {
  if (!offer) return '';
  const href = `${toRoot}${offer.product}/`;
  return `    <p class="pf-product"><strong>Doing this as part of a bigger job?</strong> <a href="${escapeHtml(href)}" ${OFFER_ATTR}="${escapeHtml(
    offer.product,
  )}">${escapeHtml(name || offer.product)}</a> ${escapeHtml(offer.pitch)}.</p>\n`;
}

