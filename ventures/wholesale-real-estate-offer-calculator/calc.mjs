// Real-estate wholesaling: what to offer the seller so the deal still works for the end buyer, and what the wholesaler keeps.
// Buyer ceiling = the lower of the "70% rule" price and a profit-based price (ARV after selling costs, less repairs,
// holding and the buyer's required profit). Contract ceiling = buyer ceiling less the wholesaler's fee. Then the fee
// is compared across the two ways to get paid: assign the contract, or double close (buy, then resell the same day).
// Arithmetic on the figures typed in; it does not decide whether wholesaling is lawful where the property is.

export const MAX_COMPS = 40;

export const SHARED_DEFAULTS = {
  arv: "", sqft: "", comps: "", repairs: "", rule: "70", profitPct: "15", sellPct: "8", holding: "",
  fee: "", minFee: "", asking: "", marketing: "", acqClose: "", dcFundPct: "1.5", dcClose: "", transferPct: "0",
};
export const EXAMPLE_SHARED = {
  arv: "", sqft: "1450", repairs: "42000", rule: "70", profitPct: "15", sellPct: "8", holding: "9000",
  fee: "12000", minFee: "6000", asking: "128000", marketing: "350", acqClose: "0", dcFundPct: "1.5", dcClose: "1800", transferPct: "0.2",
  comps: [
    "Label, Sold price, Sq ft",
    "412 Alder St, 238000, 1380",
    "17 Birch Ct, 251500, 1500",
    "960 Cedar Ave, 229000, 1320",
    "88 Dogwood Ln, 262000, 1560",
    "5 Elm Pl, 244000, 1425",
  ].join("\n"),
};

export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const pct = (n) => (Math.round(n * 10) / 10).toLocaleString("en-US") + "%";

const num = (t) => {
  const s = String(t ?? "").replace(/[$\s,%]/g, "");
  if (s === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
};
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// label, sold price, optional square feet. A first line whose price is not a number is a header.
export function parseComps(text, warnings) {
  const out = [];
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
  for (const [i, line] of lines.entries()) {
    const f = line.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((x) => x.trim().replace(/^"|"$/g, ""));
    const price = num(f[1]);
    if (i === 0 && (price === null || Number.isNaN(price))) continue;
    if (out.length >= MAX_COMPS) { warnings.push(`Only the first ${MAX_COMPS} comps were used.`); break; }
    const sq = num(f[2]);
    if (!f[0] || price === null || Number.isNaN(price) || price <= 0 || (sq !== null && (Number.isNaN(sq) || sq <= 0))) {
      warnings.push(`Comp line ${i + 1} skipped: needs a label, a positive sold price and an optional positive square footage (got "${line}").`);
      continue;
    }
    out.push({ label: f[0], price, sqft: sq });
  }
  return out;
}

export function compsArv(comps, subjectSqft) {
  if (comps.length === 0) return null;
  const withSq = comps.filter((c) => c.sqft);
  if (subjectSqft > 0 && withSq.length > 0) {
    const ppsf = median(withSq.map((c) => c.price / c.sqft));
    return { arv: ppsf * subjectSqft, method: "median price per sq ft x subject sq ft", ppsf, n: withSq.length };
  }
  return { arv: median(comps.map((c) => c.price)), method: "median sold price (add the subject's square footage for a size-adjusted figure)", ppsf: null, n: comps.length };
}

function ceilings(arv, p) {
  const ruleMax = (arv * p.rule) / 100 - p.repairs;
  const profitMax = arv * (1 - p.sellPct / 100) - p.repairs - p.holding - (arv * p.profitPct) / 100;
  const buyer = Math.min(ruleMax, profitMax);
  return { ruleMax, profitMax, buyer, binding: ruleMax <= profitMax ? "rule" : "profit" };
}

// What the wholesaler nets from a fee on a contract price, by each route.
export function routes(contract, fee, p) {
  const assign = fee - p.marketing - p.acqClose;
  const dcFunding = (contract * p.dcFundPct) / 100;
  const dcTransfer = (p.transferPct / 100) * (contract + (contract + fee));
  const doubleClose = fee - p.marketing - p.acqClose - dcFunding - p.dcClose - dcTransfer;
  const dcCost = dcFunding + p.dcClose + dcTransfer;
  const breakEvenFee = (p.marketing + p.acqClose + dcFunding + p.dcClose + (p.transferPct / 100) * 2 * contract) / (1 - p.transferPct / 100);
  return { assign, doubleClose, dcCost, dcFunding, dcTransfer, breakEvenFee };
}

export function analyze(input) {
  const warnings = [];
  const g = (k) => num(input[k]);
  const p = {
    repairs: g("repairs"), rule: g("rule"), profitPct: g("profitPct"), sellPct: g("sellPct"), holding: g("holding") ?? 0,
    fee: g("fee"), minFee: g("minFee"), asking: g("asking"), marketing: g("marketing") ?? 0, acqClose: g("acqClose") ?? 0,
    dcFundPct: g("dcFundPct") ?? 0, dcClose: g("dcClose") ?? 0, transferPct: g("transferPct") ?? 0,
  };
  const sqft = g("sqft");
  const arvIn = g("arv");
  const comps = parseComps(input.comps, warnings);
  const fromComps = compsArv(comps, sqft);
  let arv = arvIn;
  let arvSource = "your ARV";
  if (arvIn === null || arvIn === undefined) {
    if (fromComps) { arv = fromComps.arv; arvSource = "comps: " + fromComps.method; }
  }
  if (arv === null || arv === undefined || Number.isNaN(arv) || arv <= 0) warnings.push("Enter an after-repair value (ARV), or paste at least one sold comp so one can be estimated.");
  if (p.repairs === null || Number.isNaN(p.repairs) || p.repairs < 0) warnings.push("Repair estimate must be a non-negative dollar amount.");
  if (!(p.rule > 0 && p.rule <= 100)) warnings.push("Buyer's rule % must be between 0 and 100 (70 is the common one).");
  if (!(p.profitPct >= 0 && p.profitPct < 100)) warnings.push("Buyer's required profit % of ARV must be between 0 and 100.");
  if (!(p.sellPct >= 0 && p.sellPct < 100)) warnings.push("Buyer's selling costs % must be between 0 and 100.");
  for (const k of ["holding", "marketing", "acqClose", "dcClose"]) if (Number.isNaN(p[k]) || p[k] < 0) warnings.push(`${k} must be a non-negative number or blank.`);
  for (const k of ["dcFundPct", "transferPct"]) if (Number.isNaN(p[k]) || p[k] < 0 || p[k] >= 100) warnings.push(`${k} must be a percentage from 0 to 100.`);
  if (p.fee === null || Number.isNaN(p.fee) || p.fee < 0) warnings.push("Enter the assignment fee you want to earn (a dollar amount).");
  if (p.minFee !== null && (Number.isNaN(p.minFee) || p.minFee < 0)) warnings.push("Minimum fee must be a dollar amount or blank.");
  if (p.asking !== null && (Number.isNaN(p.asking) || p.asking <= 0)) warnings.push("Seller's asking price must be a positive dollar amount or blank.");
  if (warnings.some((w) => !w.startsWith("Comp line") && !w.startsWith("Only the first"))) return { ok: false, warnings };
  if (fromComps && fromComps.n < 3) warnings.push("Fewer than three comps. A comp-based ARV from one or two sales is a rough guess; pull more sold comps from the same neighbourhood and period.");

  const c = ceilings(arv, p);
  const minFee = p.minFee ?? 0;
  const contractTarget = c.buyer - p.fee;
  const contractWalk = c.buyer - minFee;
  if (c.buyer <= 0) warnings.push("At these numbers the end buyer cannot pay anything for the property: repairs and required profit consume the ARV. There is no wholesale deal here unless the ARV is higher or the repairs lower.");
  if (contractTarget <= 0 && c.buyer > 0) warnings.push("The buyer ceiling is below your target fee, so no positive offer to the seller leaves you that fee.");

  let asking = null;
  if (p.asking != null) {
    const fee = c.buyer - p.asking;
    asking = {
      price: p.asking, feeLeft: fee,
      verdict: fee >= p.fee ? "works at your target fee" : fee >= minFee && fee > 0 ? "works, but below your target fee" : "does not work at this price",
      routes: routes(p.asking, Math.max(fee, 0), p),
    };
  }
  const at = routes(Math.max(contractTarget, 0), p.fee, p);

  const buyerPays = Math.max(contractTarget, 0) + p.fee;
  const buyerProfit = arv * (1 - p.sellPct / 100) - buyerPays - p.repairs - p.holding;
  const buyer = {
    pays: buyerPays, profit: buyerProfit, profitPctArv: (buyerProfit / arv) * 100,
    allIn: buyerPays + p.repairs, ruleShare: ((buyerPays + p.repairs) / arv) * 100,
    cashOnCash: buyerPays + p.repairs + p.holding > 0 ? (buyerProfit / (buyerPays + p.repairs + p.holding)) * 100 : null,
  };

  const sensitivity = [-10, -5, 0, 5, 10].map((d) => {
    const a = arv * (1 + d / 100);
    const cc = ceilings(a, p);
    return { d, arv: a, buyer: cc.buyer, contract: cc.buyer - p.fee, feeAtAsking: p.asking != null ? cc.buyer - p.asking : null };
  });

  return { ok: true, warnings, arv, arvSource, fromComps, comps, c, p, contractTarget, contractWalk, minFee, asking, at, buyer, sensitivity };
}

export function toCsv(a) {
  const q = (s) => (/[",\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
  const rows = [
    ["Item", "Value"],
    ["ARV used", a.arv.toFixed(2)], ["ARV source", a.arvSource], ["Repairs", a.p.repairs],
    ["Rule price (ARV x rule - repairs)", a.c.ruleMax.toFixed(2)], ["Profit-based price", a.c.profitMax.toFixed(2)],
    ["End buyer ceiling", a.c.buyer.toFixed(2)], ["Target fee", a.p.fee], ["Max contract price to seller (target fee)", a.contractTarget.toFixed(2)],
    ["Walk-away contract price (minimum fee)", a.contractWalk.toFixed(2)], ["Net to wholesaler, assignment", a.at.assign.toFixed(2)],
    ["Net to wholesaler, double close", a.at.doubleClose.toFixed(2)], ["Buyer profit at the assigned price", a.buyer.profit.toFixed(2)],
  ];
  if (a.asking) rows.push(["Seller asking", a.asking.price], ["Fee left at asking", a.asking.feeLeft.toFixed(2)], ["Asking verdict", a.asking.verdict]);
  return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
}
