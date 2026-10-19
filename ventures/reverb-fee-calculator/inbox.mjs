// Offer inbox triage: several Reverb offers at once, each priced with the
// seller's shared fee inputs (calc.mjs) and given an answer — accept, counter
// or decline. One line per offer: `name, list price, offer, what you paid`.
// Pure arithmetic, no network; the lines never leave the browser.

import { calculateReverbSale, calculateEbaySale, offerThatMatchesEbayList } from './calc.mjs';

export const INBOX_EXAMPLE = [
  'Tele body, 800, 640, 450',
  'Tube Screamer, 120, 100, 60',
  'Strat neck, 300, 180, 200',
].join('\n');

function amount(text) {
  const value = Number(String(text).replace(/[$,\s]/g, ''));
  return Number.isFinite(value) && value >= 0 ? value : NaN;
}

// Blank lines and `#` comments are skipped. A line that cannot be read is
// returned in `errors` with its line number rather than dropped silently.
export function parseInbox(text) {
  const offers = [];
  const errors = [];
  String(text ?? '').split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const parts = line.split(',').map(part => part.trim());
    const [name, list, offer, paid] = parts;
    const price = amount(list);
    const offerPrice = amount(offer);
    const itemCost = paid === undefined || paid === '' ? NaN : amount(paid);
    if (parts.length < 3 || parts.length > 4 || !name || !Number.isFinite(price) || !Number.isFinite(offerPrice)) {
      errors.push({ line: index + 1, text: line });
      return;
    }
    offers.push({ line: index + 1, name, price, offerPrice, itemCost: Number.isFinite(itemCost) ? itemCost : null });
  });
  return { offers, errors };
}

// Decision per offer, in order:
//   decline — the offer does not cover costs (profit below zero);
//   accept  — it nets at least what eBay would at the same list price;
//   counter — it covers costs but leaves less than eBay, so ask for the
//             eBay-crossover price, rounded up to a whole dollar.
// `input` carries the fee fields; each row overrides price, offerPrice and,
// when the line gave one, itemCost.
export function triageOffers(input, offers) {
  const rows = offers.map((offer) => {
    const rowInput = {
      ...input,
      price: offer.price,
      offerPrice: offer.offerPrice,
      ...(offer.itemCost === null ? {} : { itemCost: offer.itemCost }),
    };
    const sale = calculateReverbSale(rowInput, offer.offerPrice);
    const ebayAtList = calculateEbaySale(rowInput, offer.price).profit;
    let decision = 'accept';
    let counterPrice = null;
    if (sale.profit < 0) {
      decision = 'decline';
    } else if (sale.profit < ebayAtList) {
      decision = 'counter';
      const match = offerThatMatchesEbayList(rowInput).offerPrice;
      counterPrice = Math.min(offer.price, Math.ceil(match));
    }
    return { ...offer, profit: sale.profit, ebayAtList, decision, counterPrice };
  });
  const totalProfit = rows
    .filter(row => row.decision === 'accept')
    .reduce((sum, row) => sum + row.profit, 0);
  return { rows, acceptedProfit: totalProfit };
}
