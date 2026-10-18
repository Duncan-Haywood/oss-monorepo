// Gift now vs. inherit later: carryover basis (IRC 1015) against the stepped-up basis at death (IRC 1014), set against
// the federal estate tax the gift can take out of the estate. Pure functions, nothing leaves the browser.
//
// Gift: the recipient takes the donor's basis (the lower of donor basis and fair value for a LOSS, so a loss cannot be
// shifted). Inherit: basis resets to fair value at death, so the built-in gain disappears. Estate tax runs the other way:
// a gift removes the future growth from the estate but uses lifetime exemption (Form 709 once over the annual exclusion).
// Annual exclusion and exemption are inputs because they are indexed each year; the defaults are the 2026 figures.

export const DEFAULTS = {
  value: 450000,        // fair market value today of the share being considered
  basis: 90000,         // donor's adjusted basis in that same share
  share: 100,           // percent of the asset moved (50 = adding one person to the deed)
  years: 12,            // years until the owner dies
  growth: 4,            // assumed yearly growth, percent
  isHome: 1,            // 1 = main home of the owner
  exclusion: 250000,    // section 121 exclusion if the owner sells now (250000 single, 500000 joint)
  fedRate: 15,          // federal long-term gain rate, percent (0, 15 or 20)
  niitRate: 0,          // 3.8 if the recipient will owe the net investment income tax
  stateRate: 4,         // state tax on the gain, percent
  otherEstate: 2500000, // everything else the owner will leave
  exemption: 15000000,  // federal estate and gift exemption per person (2026)
  annualExclusion: 19000, // gift tax annual exclusion per recipient (2026)
  donees: 1,            // how many people receive the gift
  priorGifts: 0,        // taxable gifts already reported on earlier Forms 709
  estateRate: 40,       // top federal estate and gift rate, percent
};

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
export const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;

const totalRate = (o) => (o.fedRate + o.niitRate + o.stateRate) / 100;

// Taxable gain for a recipient who got a gift and sells at `price`. Dual-basis rule: above the donor's basis the gain uses
// the donor's basis, below the fair value at the gift the loss uses fair value, in between there is neither gain nor loss.
export function giftGain(price, basis, valueAtGift) {
  if (price > basis) return price - basis;
  if (price < valueAtGift) return price - valueAtGift;
  return 0;
}

export function futureValue(value, growth, years) {
  return value * Math.pow(1 + growth / 100, years);
}

function scale(o) {
  const f = o.share / 100;
  return { v: o.value * f, b: o.basis * f };
}

// The cost of each path, in the same units: tax on the sale plus federal estate tax.
export function scenario(o) {
  const { v, b } = scale(o);
  const fv = futureValue(v, o.growth, o.years);
  const rate = totalRate(o);
  const er = o.estateRate / 100;
  const estateTax = (base) => er * Math.max(0, base - o.exemption);

  // Gift now: carryover basis, sale after the owner's death at the grown value, gift uses exemption.
  const gain = giftGain(fv, b, v);
  const gainTax = Math.max(0, gain) * rate;
  const exclusionUsed = o.annualExclusion * o.donees;
  const taxableGift = Math.max(0, v - exclusionUsed);
  const needs709 = v > exclusionUsed;
  const giftBase = o.otherEstate + o.priorGifts + taxableGift;
  const giftEstateTax = estateTax(giftBase);

  // Inherit: basis becomes fair value at death, so a sale at that value has no gain (a loss is stepped down, not claimed).
  const inheritBase = o.otherEstate + o.priorGifts + fv;
  const inheritEstateTax = estateTax(inheritBase);

  // Owner sells now (the home exclusion applies to the owner only), keeps the cash, no growth assumed on the cash.
  const nowGain = Math.max(0, v - b - (o.isHome ? o.exclusion : 0));
  const nowTax = nowGain * rate;
  const nowEstateTax = estateTax(o.otherEstate + o.priorGifts + v - nowTax);

  const gift = { gainTax, estateTax: giftEstateTax, total: gainTax + giftEstateTax, basis: b, gain };
  const inherit = { gainTax: 0, estateTax: inheritEstateTax, total: inheritEstateTax, basis: fv, gain: 0 };
  const sellNow = { gainTax: nowTax, estateTax: nowEstateTax, total: nowTax + nowEstateTax, basis: v, gain: nowGain };
  const best = [["Inherit it", inherit], ["Gift it now", gift], ["Sell now", sellNow]].sort((a, c) => a[1].total - c[1].total)[0][0];
  return {
    futureValue: fv, builtInGain: Math.max(0, fv - b), rate,
    gift, inherit, sellNow, best, taxableGift, exclusionUsed, needs709,
    lifetimeExemptionLeft: Math.max(0, o.exemption - o.priorGifts - taxableGift),
    estateOverExemption: o.otherEstate + o.priorGifts + fv > o.exemption,
  };
}

export function sensitivity(o, yearsList = [0, 5, 10, 20, 30]) {
  return yearsList.map((years) => {
    const s = scenario({ ...o, years });
    return { years, fv: s.futureValue, gift: s.gift.total, inherit: s.inherit.total, best: s.best };
  });
}

export function analyze(raw) {
  const o = { ...DEFAULTS, ...raw };
  const warnings = [];
  for (const k of Object.keys(DEFAULTS)) {
    if (!Number.isFinite(o[k])) warnings.push(`${k} must be a number.`);
    else if (o[k] < 0 && k !== "growth") warnings.push(`${k} cannot be negative.`);
  }
  if (Number.isFinite(o.share) && (o.share <= 0 || o.share > 100)) warnings.push("Share moved must be above 0 and at most 100 percent.");
  if (Number.isFinite(o.donees) && o.donees < 1) warnings.push("At least one recipient.");
  if (warnings.length) return { opts: o, warnings, result: null };
  const r = scenario(o);
  const rows = sensitivity(o);
  const stepUpTax = r.gift.gainTax; // capital gains tax the step-up would erase
  return {
    opts: o, warnings, result: r, rows,
    stepUpTax,
    giftBeatsInherit: r.gift.total < r.inherit.total,
    margin: r.inherit.total - r.gift.total,
    estateTaxSaved: r.inherit.estateTax - r.gift.estateTax,
  };
}

export function toCsv(a) {
  const r = a.result;
  const rows = [["path", "gain_tax_usd", "estate_tax_usd", "total_usd"],
    ["gift_now", r.gift.gainTax, r.gift.estateTax, r.gift.total],
    ["inherit", r.inherit.gainTax, r.inherit.estateTax, r.inherit.total],
    ["sell_now", r.sellNow.gainTax, r.sellNow.estateTax, r.sellNow.total]];
  return rows.map((x, i) => (i ? [x[0], ...x.slice(1).map((n) => Number(n).toFixed(2))] : x).join(",")).join("\n") + "\n";
}
