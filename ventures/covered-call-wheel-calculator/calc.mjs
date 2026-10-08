// Covered-call and cash-secured-put (the "wheel") chain ranker. Pure functions, no dependencies, nothing
// leaves the browser. The user pastes option quotes for ONE underlying; this ranks them by the income they
// pay per year and by how likely the position is to be called away / put to them, so the trade-off between
// premium and giving up the stock is visible instead of guessed.
//
// Model (all per share unless stated; an option contract covers 100 shares):
//   covered call, stock bought at `price`, call sold at `strike` for `premium` over `days`:
//     income if unchanged      = premium            (stock below strike, call expires worthless)
//     return if called away    = (strike - price + premium) / price
//     breakeven                = price - premium    (stock can fall this far before the position loses)
//   cash-secured put at `strike` for `premium`, collateral = strike * 100 per contract:
//     income if it expires     = premium / strike
//     effective purchase price = strike - premium   (if assigned)
//   annualisation              = simple: return * 365 / days   (compounded value is shown beside it)
//   probability of assignment  = N(d2) for a call being exercised, N(-d2) for a put, from a Black-Scholes
//                                lognormal model using the implied volatility typed per row (or a default).
//                                It is a model estimate, not a forecast; real prices jump.
//   fees                       = typed per contract, charged once per contract on opening.

export const CONTRACT_SIZE = 100;

export const DEFAULTS = {
  mode: "call",
  price: 100,
  shares: 500,
  costBasis: 82,
  feePerContract: 0.65,
  riskFreePct: 4.2,
  defaultIvPct: 30,
  maxAssignPct: 30,
  targetPrice: 108,
  chainText: [
    "103, 1.45, 30",
    "105, 0.92, 30",
    "108, 0.48, 30",
    "110, 0.31, 30",
    "105, 1.78, 45",
    "108, 1.12, 45",
    "110, 0.81, 45",
    "112, 0.55, 45",
  ].join("\n"),
};

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => {
  const sign = x < 0 ? "-" : "";
  return `${sign}$${Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
export const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;

// Standard normal CDF (Abramowitz & Stegun 7.1.26 via erf; error < 1.5e-7).
export function normCdf(x) {
  const s = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + s * y);
}

// Black-Scholes value and exercise probability. S spot, K strike, T years, r and sigma as decimals.
export function bs(S, K, T, r, sigma, type) {
  if (!(T > 0) || !(sigma > 0)) {
    const call = Math.max(S - K, 0), put = Math.max(K - S, 0);
    const itm = type === "call" ? S > K : S < K;
    return { value: type === "call" ? call : put, probItm: itm ? 1 : 0 };
  }
  const v = sigma * Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / v;
  const d2 = d1 - v;
  const disc = Math.exp(-r * T);
  return type === "call"
    ? { value: S * normCdf(d1) - K * disc * normCdf(d2), probItm: normCdf(d2) }
    : { value: K * disc * normCdf(-d2) - S * normCdf(-d1), probItm: normCdf(-d2) };
}

// One line per quote: strike, premium, days to expiry[, implied vol %]. Comma, tab or space separated.
export function parseChain(text) {
  const rows = [];
  const errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(/[\s,;]+/).filter(Boolean);
    const vals = parts.map(num);
    if (i === 0 && vals.every((v) => !Number.isFinite(v))) return; // header row
    const [strike, premium, days, iv] = vals;
    if (vals.length < 3 || ![strike, premium, days].every(Number.isFinite)) return errors.push(`Line ${i + 1}: need strike, premium, days (got "${line}").`);
    if (strike <= 0 || premium < 0 || days <= 0) return errors.push(`Line ${i + 1}: strike and days must be above 0 and premium cannot be negative.`);
    if (iv !== undefined && !(iv > 0)) return errors.push(`Line ${i + 1}: implied volatility must be above 0.`);
    rows.push({ line: i + 1, strike, premium, days, iv: iv });
  });
  return { rows, errors };
}

function evaluate(row, o, contracts) {
  const T = row.days / 365;
  const sigma = (row.iv ?? o.defaultIvPct) / 100;
  const isCall = o.mode === "call";
  const model = bs(o.price, row.strike, T, o.riskFreePct / 100, sigma, isCall ? "call" : "put");
  const feePerShare = o.feePerContract / CONTRACT_SIZE;
  const prem = row.premium - feePerShare;
  const base = isCall ? o.price : row.strike; // capital at work per share
  const keep = prem / base; // keep the premium, nothing assigned
  const assigned = isCall ? (row.strike - o.price + prem) / o.price : (prem) / row.strike; // return if exercised, vs buying/selling today
  const ann = (r) => (r * 365) / row.days;
  const comp = (r) => (r <= -1 ? -1 : Math.pow(1 + r, 365 / row.days) - 1);
  const costBasisGain = isCall ? (row.strike - o.costBasis) * CONTRACT_SIZE * contracts : null;
  return {
    ...row,
    sigma,
    isCall,
    otmPct: isCall ? row.strike / o.price - 1 : 1 - row.strike / o.price,
    income: prem * CONTRACT_SIZE * contracts,
    keepReturn: keep,
    keepAnnual: ann(keep),
    keepCompounded: comp(keep),
    assignedReturn: assigned,
    assignedAnnual: ann(assigned),
    probAssigned: model.probItm,
    modelValue: model.value,
    breakeven: isCall ? o.price - prem : row.strike - prem,
    cushion: isCall ? prem / o.price : (o.price - (row.strike - prem)) / o.price,
    capital: base * CONTRACT_SIZE * contracts,
    gainIfAssigned: costBasisGain,
  };
}

// P&L at expiry for the chosen row against just holding (call) or just buying the stock now (put).
export function scenarios(row, o, contracts) {
  const moves = [-0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2];
  const n = CONTRACT_SIZE * contracts;
  const prem = row.premium - o.feePerContract / CONTRACT_SIZE;
  return moves.map((m) => {
    const end = o.price * (1 + m);
    if (row.isCall) {
      const withCall = (Math.min(end, row.strike) - o.price + prem) * n;
      return { move: m, end, strategy: withCall, plain: (end - o.price) * n };
    }
    const withPut = (prem - Math.max(row.strike - end, 0)) * n;
    return { move: m, end, strategy: withPut, plain: (end - o.price) * n };
  });
}

export function analyze(o) {
  const o2 = { ...DEFAULTS, ...o };
  const warnings = [];
  const { rows, errors } = parseChain(o2.chainText);
  warnings.push(...errors);
  if (!(o2.price > 0)) warnings.push("Enter the current stock price.");
  if (!(o2.defaultIvPct > 0)) warnings.push("Enter a default implied volatility above 0 (used when a quote line has none).");
  const isCall = o2.mode === "call";
  const contracts = isCall ? Math.floor((o2.shares || 0) / CONTRACT_SIZE) : Math.max(1, Math.floor(o2.shares || 1));
  if (isCall && contracts < 1) warnings.push("A covered call needs at least 100 shares (one contract). Enter 100 or more shares.");
  if (!rows.length && !errors.length) warnings.push("Paste at least one quote line: strike, premium, days.");
  if (warnings.some((w) => /Enter|need at least|Paste/.test(w))) return { warnings, rows: [], picks: {}, contracts, mode: o2.mode };

  const ev = rows.map((r) => evaluate(r, o2, contracts));
  const cap = o2.maxAssignPct / 100;
  const byKeep = (a, b) => b.keepAnnual - a.keepAnnual;
  const safe = ev.filter((r) => r.probAssigned <= cap + 1e-12).sort(byKeep);
  // Income pick: highest annualised premium yield whose assignment probability is within the cap.
  const income = safe[0] || null;
  // Exit pick (calls): highest annualised return-if-called among strikes at or above the price you'd be glad to sell at.
  // Buy pick (puts): highest annualised yield among strikes whose effective cost is at or below the price you'd be glad to pay.
  let target = null;
  if (o2.targetPrice > 0) {
    const pool = ev.filter((r) => (isCall ? r.strike >= o2.targetPrice : r.breakeven <= o2.targetPrice));
    target = pool.sort((a, b) => (isCall ? b.assignedAnnual - a.assignedAnnual : b.keepAnnual - a.keepAnnual))[0] || null;
  }
  if (!income) warnings.push(`No quote keeps the chance of ${isCall ? "being called away" : "being assigned"} at or under ${o2.maxAssignPct}% with these inputs; raise the cap or look at further-out strikes.`);
  if (isCall) {
    const below = ev.filter((r) => r.strike < o2.costBasis && o2.costBasis > 0);
    if (below.length) warnings.push(`${below.length} strike${below.length > 1 ? "s are" : " is"} below your cost basis of ${money(o2.costBasis)}: being called away there realizes a loss.`);
  }
  const ranked = [...ev].sort(byKeep);
  return {
    warnings,
    rows: ranked,
    picks: { income, target },
    contracts,
    mode: o2.mode,
    opts: o2,
    scenario: income ? scenarios(income, o2, contracts) : null,
  };
}

export function toCsv(a) {
  const head = ["strike", "days", "premium", "otm_pct", "income_total", "keep_return_pct", "keep_annualized_pct", "if_assigned_annualized_pct", "prob_assigned_pct", "breakeven"];
  const lines = [head.join(",")];
  for (const r of a.rows) {
    lines.push([r.strike, r.days, r.premium, (r.otmPct * 100).toFixed(2), r.income.toFixed(2), (r.keepReturn * 100).toFixed(3), (r.keepAnnual * 100).toFixed(2), (r.assignedAnnual * 100).toFixed(2), (r.probAssigned * 100).toFixed(1), r.breakeven.toFixed(2)].join(","));
  }
  return lines.join("\n") + "\n";
}
