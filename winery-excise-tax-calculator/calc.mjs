// Federal excise tax on wine and hard cider for a domestic winery or cidery (IRC 5041 as amended by the Craft Beverage
// Modernization Act, made permanent in 2020). Pure arithmetic over the volumes the producer types in. A planning estimate,
// not a TTB return.
const GAL_ML = 3785.411784;

// Tax per wine gallon, IRC 5041(b). Wine above 24% alcohol by volume is taxed as distilled spirits and is out of scope.
export const CATEGORIES = [
  { id: "still", label: "Still wine, up to 16% ABV", rate: 1.07, cider: false },
  { id: "mid", label: "Wine over 16% up to 21% ABV", rate: 1.57, cider: false },
  { id: "high", label: "Wine over 21% up to 24% ABV", rate: 3.15, cider: false },
  { id: "sparkling", label: "Champagne and other naturally sparkling wine", rate: 3.4, cider: false },
  { id: "carbonated", label: "Artificially carbonated wine", rate: 3.3, cider: false },
  { id: "cider", label: "Hard cider (under 8.5% ABV, from apples or pears, low carbonation)", rate: 0.226, cider: true },
];

// Credit per wine gallon removed in a calendar year, IRC 5041(c): tiers shared by all wine of the producer.
export const CREDIT_TIERS = [
  { upTo: 30000, wine: 1.0, cider: 0.062 },
  { upTo: 130000, wine: 0.9, cider: 0.056 },
  { upTo: 750000, wine: 0.535, cider: 0.033 },
];
export const CREDIT_CEILING = 750000;
export const BOTTLE_ML = 750;
export const CASE_BOTTLES = 12;

export const FIELDS = CATEGORIES.flatMap((c) => [`${c.id}Cases`, `${c.id}Bottles`, `${c.id}Bulk`]);
export const DEFAULTS = { share: 100, ...Object.fromEntries(FIELDS.map((f) => [f, 0])) };

const num = (v) => (v === "" || v === null || v === undefined ? 0 : Number(v));
const r2 = (x) => Math.round(x * 100) / 100;
const fmt = (x) => x.toLocaleString("en-US");

export const gallonsPerBottle = (ml = BOTTLE_ML) => ml / GAL_ML;

export function categoryGallons(v, id) {
  const bottles = num(v[`${id}Cases`]) * CASE_BOTTLES + num(v[`${id}Bottles`]);
  return bottles * gallonsPerBottle() + num(v[`${id}Bulk`]);
}

// Allocate the credit tiers across wine first, then cider, in the order of CATEGORIES. The statute does not say which
// gallons use the high tiers first; for one producer the total credit differs only in how wine and cider are ordered.
export function exciseTax(gallonsById, share = 100) {
  const scale = Math.min(Math.max(num(share), 0), 100) / 100;
  const tiers = CREDIT_TIERS.map((t, i) => ({ ...t, from: i === 0 ? 0 : CREDIT_TIERS[i - 1].upTo }));
  let used = 0;
  const rows = CATEGORIES.map((c) => {
    const gallons = gallonsById[c.id] || 0;
    let credit = 0;
    let left = gallons;
    for (const t of tiers) {
      const room = Math.max(t.upTo * scale - Math.max(used, t.from * scale), 0);
      const take = Math.min(left, room);
      credit += take * Math.min(c.cider ? t.cider : t.wine, c.rate);
      left -= take;
      used += take;
      if (left <= 0) break;
    }
    used += left;
    const gross = gallons * c.rate;
    return { ...c, gallons, gross, credit, tax: gross - credit };
  });
  const gallons = rows.reduce((a, r) => a + r.gallons, 0);
  const gross = rows.reduce((a, r) => a + r.gross, 0);
  const credit = rows.reduce((a, r) => a + r.credit, 0);
  return { rows, gallons, gross, credit, tax: gross - credit, effective: gallons > 0 ? (gross - credit) / gallons : 0 };
}

export function filingFrequency(tax) {
  if (tax <= 1000) return "Annual returns may be available (expected liability of $1,000 or less a year). Confirm eligibility with TTB.";
  if (tax <= 50000) return "Quarterly returns may be available (expected liability of $50,000 or less a year). Confirm eligibility with TTB.";
  return "Above $50,000 a year you generally file and pay on the semi-monthly schedule. Confirm with TTB.";
}

export function plan(input) {
  const v = { ...DEFAULTS, ...input };
  for (const k of [...FIELDS, "share"]) {
    const x = num(v[k]);
    if (!(x >= 0) || !Number.isFinite(x)) return { error: `Enter 0 or more for ${k}.` };
  }
  if (num(v.share) <= 0 || num(v.share) > 100) return { error: "Your share of the credit allotment must be above 0 and at most 100 percent." };
  const g = Object.fromEntries(CATEGORIES.map((c) => [c.id, categoryGallons(v, c.id)]));
  const gallons = Object.values(g).reduce((a, b) => a + b, 0);
  if (gallons <= 0) return { error: "Enter what you remove from the winery in a year: cases, bottles or bulk gallons in at least one category." };
  if (gallons > 5e7) return { error: "That is over 50 million wine gallons. Check the units." };
  const share = num(v.share);
  const base = exciseTax(g, share);

  const perBottle = (c) => {
    const row = base.rows.find((r) => r.id === c.id);
    const eff = row.gallons > 0 ? row.tax / row.gallons : c.rate - (c.cider ? CREDIT_TIERS[0].cider : CREDIT_TIERS[0].wine);
    return { gross: c.rate * gallonsPerBottle(), net: eff * gallonsPerBottle() };
  };
  const perBottleRows = base.rows.filter((r) => r.gallons > 0).map((r) => ({ label: r.label, ...perBottle(r), count: r.gallons / gallonsPerBottle() }));

  const ceiling = CREDIT_CEILING * (share / 100);
  const headroom = ceiling - base.gallons;
  const growth = [1, 1.25, 1.5, 2, 3, 5].map((m) => {
    const gg = Object.fromEntries(Object.entries(g).map(([k, x]) => [k, x * m]));
    const t = exciseTax(gg, share);
    return { multiple: m, gallons: t.gallons, tax: t.tax, effective: t.effective, credit: t.credit };
  });

  const advice = [];
  advice.push(`Estimated federal excise tax: $${fmt(r2(base.tax))} on ${fmt(r2(base.gallons))} wine gallons: $${fmt(r2(base.gross))} before the CBMA credit, less a credit of $${fmt(r2(base.credit))}. That is an effective $${r2(base.effective)} per wine gallon.`);
  const still = base.rows.find((r) => r.id === "still");
  if (still.gallons > 0) advice.push(`A 750 mL bottle of still wine up to 16% carries $${perBottle(still).net.toFixed(3)} of federal tax after the credit, against $${perBottle(still).gross.toFixed(3)} at the statutory $1.07 rate. A case of 12 carries $${r2(perBottle(still).net * 12)}.`);
  if (base.gallons <= CREDIT_TIERS[0].upTo * (share / 100)) advice.push(`Everything you remove is inside the first 30,000 wine gallons, where the credit is a full $1.00 a gallon: still wine pays $0.07 a gallon.`);
  if (headroom > 0) advice.push(`You have ${fmt(Math.round(headroom))} wine gallons left before the credit stops at ${fmt(Math.round(ceiling))}. The credit steps down from $1.00 to $0.90 after 30,000 gallons and to $0.535 after 130,000, so each gallon past those costs more.`);
  else advice.push(`You are past ${fmt(Math.round(ceiling))} wine gallons, so each further gallon pays the full statutory rate with no credit.`);
  if (share < 100) advice.push(`Your share of the credit allotment is ${share}%. Wineries and cideries under common control divide one set of credit tiers.`);
  advice.push(filingFrequency(base.tax));
  return { ...base, share, perBottleRows, headroom, ceiling, growth, advice, rowsInUse: base.rows.filter((r) => r.gallons > 0) };
}

export function sampleInput() {
  return { stillCases: 2500, stillBottles: 120, stillBulk: 400, sparklingCases: 150, ciderCases: 600, ciderBulk: 1000, share: 100 };
}

export function toCsv(r) {
  const rows = [["category", "wine_gallons", "tax_before_credit", "credit", "tax"]];
  for (const c of r.rows) if (c.gallons > 0) rows.push([`"${c.label}"`, r2(c.gallons), r2(c.gross), r2(c.credit), r2(c.tax)]);
  rows.push(["total", r2(r.gallons), r2(r.gross), r2(r.credit), r2(r.tax)]);
  return rows.map((x) => x.join(",")).join("\n");
}
