// Section 1031 like-kind exchange arithmetic for real property held for
// investment or business use. Pure functions, no dependencies, nothing
// leaves the device. Educational arithmetic on numbers the user types --
// not tax advice, and not a substitute for a qualified intermediary or a CPA.

const MS_DAY = 86400000;

export function money(n) {
  const v = Number.isFinite(n) ? n : 0;
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? "-$" : "$") + s;
}

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const nn = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);
const pos = (n) => Math.max(0, nn(n));

export function parseISODate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return d;
}

export function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

export function addDays(d, n) {
  return new Date(d.getTime() + n * MS_DAY);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// 45-day identification and 180-day receipt windows. Day 1 is the day after
// the relinquished property transfers. The exchange period also ends at the
// due date (with extensions) of the return for the year of transfer, so a
// late-year sale can be cut short unless the return is extended.
export function exchangeDeadlines(closeDate, asOf) {
  const close = parseISODate(closeDate);
  if (!close) return null;
  const id45 = addDays(close, 45);
  const ex180 = addDays(close, 180);
  const returnDue = new Date(Date.UTC(close.getUTCFullYear() + 1, 3, 15));
  const cutShort = returnDue.getTime() < ex180.getTime();
  const today = parseISODate(asOf);
  const daysLeft = (d) => (today ? Math.round((d.getTime() - today.getTime()) / MS_DAY) : null);
  return {
    closeDate: fmtDate(close),
    identifyBy: fmtDate(id45),
    identifyByWeekday: WEEKDAYS[id45.getUTCDay()],
    completeBy: fmtDate(ex180),
    completeByWeekday: WEEKDAYS[ex180.getUTCDay()],
    returnDue: fmtDate(returnDue),
    cutShort,
    daysToIdentify: daysLeft(id45),
    daysToComplete: daysLeft(ex180),
  };
}

// Identification rules (Treas. Reg. 1.1031(k)-1(c)): three-property rule,
// 200% rule, 95% rule. Passing any one of them is enough.
export function identificationCheck(values, relinquishedValue, acquiredValue = null) {
  const vals = (values || []).map(nn).filter((v) => v > 0);
  if (!vals.length) return null;
  const total = vals.reduce((a, b) => a + b, 0);
  const three = vals.length <= 3;
  const twoHundred = total <= 2 * pos(relinquishedValue);
  let ninetyFive = null;
  if (acquiredValue !== null && acquiredValue !== undefined) {
    ninetyFive = nn(acquiredValue) >= 0.95 * total;
  }
  return {
    count: vals.length,
    total: r2(total),
    threeProperty: three,
    twoHundredPercent: twoHundred,
    ninetyFivePercent: ninetyFive,
    // The 95% rule is the fallback when the first two are both broken.
    ok: three || twoHundred || ninetyFive === true,
  };
}

export function exchangeOutcome(input) {
  const salePrice = pos(input.salePrice);
  const sellingCosts = pos(input.sellingCosts);
  const mortgagePayoff = pos(input.mortgagePayoff);
  const purchasePrice = pos(input.purchasePrice);
  const improvements = pos(input.improvements);
  const depreciation = pos(input.depreciation);
  const replacementPrice = pos(input.replacementPrice);
  const newMortgage = pos(input.newMortgage);
  const acquisitionCosts = pos(input.acquisitionCosts);
  const fedRate = nn(input.fedRate ?? 20) / 100;
  const recaptureRate = nn(input.recaptureRate ?? 25) / 100;
  const stateRate = nn(input.stateRate ?? 0) / 100;
  const niitRate = input.niit ? 0.038 : 0;

  const amountRealized = salePrice - sellingCosts;
  const adjustedBasis = Math.max(0, purchasePrice + improvements - depreciation);
  const realizedGain = amountRealized - adjustedBasis;
  const netEquity = amountRealized - mortgagePayoff;

  // Equity the replacement needs to absorb, and what is left over.
  const need = replacementPrice + acquisitionCosts - newMortgage;
  const cashBoot = Math.max(0, netEquity - need);
  const cashAdded = Math.max(0, need - netEquity);
  // Debt relief is netted against cash the buyer adds, never against cash
  // taken out.
  const mortgageBoot = Math.max(0, mortgagePayoff - newMortgage - cashAdded);
  const boot = cashBoot + mortgageBoot;

  const recognizedGain = realizedGain > 0 ? Math.min(realizedGain, boot) : 0;
  const deferredGain = realizedGain - recognizedGain;
  const replacementCost = replacementPrice + acquisitionCosts;
  const newBasis = replacementCost - deferredGain;

  // Recognized gain is taxed as unrecaptured 1250 gain first (up to the
  // depreciation taken), then long-term gain. That ordering is an assumption.
  const taxOn = (gain) => {
    const g = Math.max(0, gain);
    const recap = Math.min(g, depreciation);
    const cap = g - recap;
    const fed = recap * recaptureRate + cap * fedRate;
    const other = g * (stateRate + niitRate);
    return { recap, cap, total: fed + other };
  };
  const withoutExchange = taxOn(realizedGain);
  const withExchange = taxOn(recognizedGain);
  const taxDeferred = withoutExchange.total - withExchange.total;

  const fullyDeferred = realizedGain > 0 && boot <= 0;
  const dl = input.closeDate ? exchangeDeadlines(input.closeDate, input.asOf) : null;
  const ident = identificationCheck(input.identified, salePrice, input.acquiredIdentified);

  // What the replacement would have to look like to defer everything.
  const targets = {
    minReplacementPrice: r2(Math.max(0, amountRealized)),
    minNewMortgage: r2(mortgagePayoff),
    equityToReinvest: r2(Math.max(0, netEquity)),
  };

  const findings = [];
  if (realizedGain <= 0) {
    findings.push({
      severity: "info",
      title: "No gain to defer",
      detail: "The numbers show a loss or break-even. A loss on a 1031 exchange is not recognized; it rolls into the basis of the replacement property. If you want to claim the loss, you would sell outright rather than exchange. Ask a CPA before choosing.",
    });
  }
  if (cashBoot > 0) {
    findings.push({
      severity: "high",
      title: `${money(cashBoot)} of cash boot`,
      detail: "Sale cash that is not reinvested in the replacement is taxable now, up to your gain. Reinvest all net equity, or accept the tax on this amount.",
    });
  }
  if (mortgageBoot > 0) {
    findings.push({
      severity: "high",
      title: `${money(mortgageBoot)} of mortgage boot`,
      detail: "The new loan is smaller than the old one and you did not add cash to cover the difference, so the debt relief counts as boot. Take on at least as much debt, or put in more cash.",
    });
  }
  if (replacementPrice > 0 && replacementPrice < amountRealized) {
    findings.push({
      severity: "medium",
      title: "Replacement costs less than the net sale price",
      detail: "To defer everything, the replacement should cost at least the net sale price and reinvest all net equity. Buying down usually creates boot.",
    });
  }
  if (dl && dl.cutShort) {
    findings.push({
      severity: "high",
      title: "Return due date can cut the 180 days short",
      detail: `The exchange period ends at the earlier of day 180 (${dl.completeBy}) and the due date of your return for the year of the sale (${dl.returnDue}, unless extended). Filing an extension protects the full 180 days. Ask your CPA.`,
    });
  }
  if (ident && !ident.ok) {
    findings.push({
      severity: "high",
      title: "Identification list breaks the identification rules",
      detail: "More than three properties, worth more than 200% of what you sold, and (if you enter what you closed on) less than 95% of the total identified. An invalid list can void the exchange.",
    });
  }
  if (depreciation > 0 && deferredGain > 0) {
    findings.push({
      severity: "info",
      title: "Depreciation recapture is deferred, not erased",
      detail: "The recapture carries into the replacement's lower depreciable basis and comes due when you eventually sell without another exchange. Heirs who inherit get a basis reset under current law; confirm with an estate professional.",
    });
  }
  findings.push({
    severity: "info",
    title: "Use a qualified intermediary; never touch the money",
    detail: "If the sale proceeds land in your account, even briefly, the exchange can fail. The intermediary must be engaged before the sale closes. This tool does not hold funds or arrange anything.",
  });
  findings.push({
    severity: "info",
    title: "Only certain property qualifies",
    detail: "Since 2018 only real property held for investment or business use qualifies. A primary residence, property held mainly for resale (flips, dealer inventory), and most related-party swaps do not. This tool cannot tell which one you have.",
  });

  return {
    amountRealized: r2(amountRealized),
    adjustedBasis: r2(adjustedBasis),
    realizedGain: r2(realizedGain),
    netEquity: r2(netEquity),
    cashBoot: r2(cashBoot),
    mortgageBoot: r2(mortgageBoot),
    cashAdded: r2(cashAdded),
    boot: r2(boot),
    recognizedGain: r2(recognizedGain),
    deferredGain: r2(deferredGain),
    replacementCost: r2(replacementCost),
    newBasis: r2(newBasis),
    fullyDeferred,
    taxWithoutExchange: r2(withoutExchange.total),
    taxWithExchange: r2(withExchange.total),
    taxDeferred: r2(taxDeferred),
    deadlines: dl,
    identification: ident,
    targets,
    findings,
  };
}
