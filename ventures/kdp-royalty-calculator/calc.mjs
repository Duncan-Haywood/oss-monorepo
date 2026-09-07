/**
 * KDP / Kindle Unlimited / wide-distribution royalty arithmetic.
 *
 * Every rate is an input the author overwrites from their own KDP dashboard
 * or Ingram quote. The defaults are published starting points, not a live
 * Amazon schedule, and they are labelled that way on the page.
 */

const finite = (value, name) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return number;
};

const optional = (value, name, fallback) => {
  if (value === '' || value === undefined || value === null) return fallback;
  return finite(value, name);
};

export const DEFAULTS = Object.freeze({
  ebookList: 4.99,
  ebookPlan: '70',
  fileSizeMb: 2,
  deliveryPerMb: 0.15,
  ebookPaidSales: 80,
  kenpReads: 12000,
  kenpRate: 0.0045,
  paperbackList: 14.99,
  paperbackPages: 280,
  paperbackColor: false,
  paperbackPrintOverride: '',
  paperbackSales: 20,
  paperbackRoyaltyRate: 0.6,
  otherStoreSales: 40,
  otherStoreNet: 2.5,
  ingramSales: 10,
  ingramWholesale: 0.4,
  ingramPrintCost: 5,
  bwFixed: 0.85,
  bwPerPage: 0.012,
  colorFixed: 0.85,
  colorPerPage: 0.07,
});

export function printCost({ pages, color, override, bwFixed, bwPerPage, colorFixed, colorPerPage }) {
  if (override !== '' && override !== undefined && override !== null) {
    return finite(override, 'Paperback print cost');
  }
  const count = finite(pages, 'Paperback pages');
  if (color) {
    return finite(colorFixed, 'Color fixed print cost') + finite(colorPerPage, 'Color per-page print cost') * count;
  }
  return finite(bwFixed, 'B&W fixed print cost') + finite(bwPerPage, 'B&W per-page print cost') * count;
}

export function ebookNet({ list, plan, fileSizeMb, deliveryPerMb }) {
  const price = finite(list, 'eBook list price');
  const size = finite(fileSizeMb, 'File size');
  const perMb = finite(deliveryPerMb, 'Delivery cost per MB');
  if (plan === '35') return price * 0.35;
  if (plan !== '70') throw new Error('eBook royalty plan must be 70 or 35');
  return price * 0.7 - size * perMb;
}

export function paperbackNet({ list, royaltyRate, print }) {
  const price = finite(list, 'Paperback list price');
  const rate = finite(royaltyRate, 'Paperback royalty rate');
  if (rate > 1) throw new Error('Paperback royalty rate must be a fraction of list (0–1), not a percent');
  return price * rate - finite(print, 'Paperback print cost');
}

export function ingramNet({ list, wholesale, print }) {
  const price = finite(list, 'Paperback list price');
  const discount = finite(wholesale, 'Ingram wholesale discount');
  if (discount > 1) throw new Error('Ingram wholesale discount must be a fraction of list (0–1), not a percent');
  return price * (1 - discount) - finite(print, 'Ingram print cost');
}

export function seventyPercentEligible(list) {
  const price = finite(list, 'eBook list price');
  return price >= 2.99 && price <= 9.99;
}

/**
 * One 90-day window on the same book: KDP exclusive (paid sales + KU + KDP
 * paperback) versus going wide (same KDP paid sales, no KU, plus other-store
 * ebook volume and Ingram paperbacks).
 */
export function compareExclusiveVsWide(input) {
  const ebookList = optional(input.ebookList, 'eBook list price', DEFAULTS.ebookList);
  const ebookPlan = String(input.ebookPlan ?? DEFAULTS.ebookPlan);
  const fileSizeMb = optional(input.fileSizeMb, 'File size', DEFAULTS.fileSizeMb);
  const deliveryPerMb = optional(input.deliveryPerMb, 'Delivery cost per MB', DEFAULTS.deliveryPerMb);
  const ebookPaidSales = optional(input.ebookPaidSales, 'eBook paid sales', DEFAULTS.ebookPaidSales);
  const kenpReads = optional(input.kenpReads, 'KU page reads', DEFAULTS.kenpReads);
  const kenpRate = optional(input.kenpRate, 'KENP rate', DEFAULTS.kenpRate);
  const paperbackList = optional(input.paperbackList, 'Paperback list price', DEFAULTS.paperbackList);
  const paperbackPages = optional(input.paperbackPages, 'Paperback pages', DEFAULTS.paperbackPages);
  const paperbackColor = Boolean(input.paperbackColor);
  const paperbackPrintOverride = input.paperbackPrintOverride ?? DEFAULTS.paperbackPrintOverride;
  const paperbackSales = optional(input.paperbackSales, 'Paperback sales', DEFAULTS.paperbackSales);
  const paperbackRoyaltyRate = optional(
    input.paperbackRoyaltyRate,
    'Paperback royalty rate',
    DEFAULTS.paperbackRoyaltyRate,
  );
  const otherStoreSales = optional(input.otherStoreSales, 'Other-store ebook sales', DEFAULTS.otherStoreSales);
  const otherStoreNet = optional(input.otherStoreNet, 'Other-store net per sale', DEFAULTS.otherStoreNet);
  const ingramSales = optional(input.ingramSales, 'Ingram paperback sales', DEFAULTS.ingramSales);
  const ingramWholesale = optional(input.ingramWholesale, 'Ingram wholesale discount', DEFAULTS.ingramWholesale);
  const ingramPrintCost = optional(input.ingramPrintCost, 'Ingram print cost', DEFAULTS.ingramPrintCost);
  const bwFixed = optional(input.bwFixed, 'B&W fixed print cost', DEFAULTS.bwFixed);
  const bwPerPage = optional(input.bwPerPage, 'B&W per-page print cost', DEFAULTS.bwPerPage);
  const colorFixed = optional(input.colorFixed, 'Color fixed print cost', DEFAULTS.colorFixed);
  const colorPerPage = optional(input.colorPerPage, 'Color per-page print cost', DEFAULTS.colorPerPage);

  const unitEbook = ebookNet({ list: ebookList, plan: ebookPlan, fileSizeMb, deliveryPerMb });
  const kdpPrint = printCost({
    pages: paperbackPages,
    color: paperbackColor,
    override: paperbackPrintOverride,
    bwFixed,
    bwPerPage,
    colorFixed,
    colorPerPage,
  });
  const unitPaperback = paperbackNet({
    list: paperbackList,
    royaltyRate: paperbackRoyaltyRate,
    print: kdpPrint,
  });
  const unitIngram = ingramNet({
    list: paperbackList,
    wholesale: ingramWholesale,
    print: ingramPrintCost,
  });

  const ebookPaid = ebookPaidSales * unitEbook;
  const ku = kenpReads * kenpRate;
  const paperback = paperbackSales * unitPaperback;
  const otherStores = otherStoreSales * otherStoreNet;
  const ingram = ingramSales * unitIngram;

  const exclusiveWithoutKu = ebookPaid + paperback;
  const exclusive = exclusiveWithoutKu + ku;
  const wide = ebookPaid + paperback + otherStores + ingram;
  const wideExtras = otherStores + ingram;
  const exclusiveWins = exclusive > wide;
  const gap = exclusive - wide;

  const pagesToMatchOneSale = kenpRate > 0 && unitEbook > 0 ? unitEbook / kenpRate : Infinity;
  const readsToMatchWide = kenpRate > 0 && wideExtras > 0 ? wideExtras / kenpRate : 0;

  return {
    unitEbook,
    unitPaperback,
    unitIngram,
    kdpPrint,
    ebookPaid,
    ku,
    paperback,
    otherStores,
    ingram,
    exclusive,
    wide,
    exclusiveWithoutKu,
    wideExtras,
    exclusiveWins,
    gap,
    pagesToMatchOneSale,
    readsToMatchWide,
    seventyEligible: seventyPercentEligible(ebookList),
    usedSeventy: ebookPlan === '70',
  };
}

export function exclusiveNote(result) {
  const money = (n) => {
    const format = (n) => `$${n.toFixed(2)}`;
    const text = format(Math.abs(n));
    return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  if (result.wideExtras === 0 && result.ku === 0) {
    return `With no KU reads and no wide extras, both paths keep ${money(result.exclusive)} — the paid KDP sales alone.`;
  }
  if (result.exclusiveWins) {
    return `Exclusive keeps ${money(result.exclusive)} against ${money(result.wide)} wide, ahead by ${money(result.gap)}. KU page-reads are doing the extra work.`;
  }
  return `Wide keeps ${money(result.wide)} against ${money(result.exclusive)} exclusive, ahead by ${money(-result.gap)}. Other-store and Ingram volume is larger than this KU window.`;
}
