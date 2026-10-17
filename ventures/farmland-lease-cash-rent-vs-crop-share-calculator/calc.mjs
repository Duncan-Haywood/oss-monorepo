// Farmland lease comparison: cash rent vs crop share vs flexible cash rent, per acre and per field.
// Pure functions, no dependencies, nothing leaves the browser. Every default is a placeholder:
// yields, prices, input costs and rents differ by county, crop and year. Replace each with your
// own numbers (county rent surveys, your own cost records) before relying on any output.

export const DEFAULTS = {
  acres: 160,
  yieldPerAcre: 200,
  price: 4.5,
  sharedInputs: 380,
  operatorOnly: 250,
  cashRent: 250,
  cropSharePct: 50,
  landlordInputPct: 50,
  flexBase: 200,
  flexBonusPct: 30,
  flexThreshold: 800,
  targetOperatorProfit: 30,
};

export function num(v) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[$,%\s]/g, ""));
  return String(v ?? "").trim() === "" ? NaN : n;
}

const nz = (x) => (Number.isFinite(x) && x > 0 ? x : 0);
const fin = (x) => (Number.isFinite(x) ? x : 0);

export function money(x) {
  const n = Math.round(x);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}
export function pct(x, d = 1) {
  return (x * 100).toFixed(d) + "%";
}

// One year, per acre, at a given yield and price. Shared inputs are seed, fertilizer, chemicals
// and drying or hauling: the landlord pays `landlordInputPct` of them under a crop share and
// none under a cash lease. Operator-only costs are machinery, labor, fuel, insurance, interest.
// Profits can be negative; nothing is clamped.
export function perAcre(yieldPerAcre, price, o) {
  const revenue = nz(yieldPerAcre) * nz(price);
  const shared = nz(o.sharedInputs);
  const own = nz(o.operatorOnly);
  const s = Math.min(100, nz(o.cropSharePct)) / 100;
  const p = Math.min(100, nz(o.landlordInputPct)) / 100;
  const allCosts = shared + own;

  const cashLandlord = nz(o.cashRent);
  const shareLandlord = s * revenue - p * shared;
  const flexLandlord = nz(o.flexBase) + (nz(o.flexBonusPct) / 100) * Math.max(0, revenue - nz(o.flexThreshold));

  return {
    revenue,
    allCosts,
    cash: { landlord: cashLandlord, operator: revenue - allCosts - cashLandlord },
    share: { landlord: shareLandlord, operator: (1 - s) * revenue - (1 - p) * shared - own },
    flex: { landlord: flexLandlord, operator: revenue - allCosts - flexLandlord },
  };
}

// Landlord's crop-share income and operator's cash-rent profit cross at one yield: below it the
// landlord is better off on cash rent, above it on the share. Null when the share earns nothing
// per bushel (zero share or zero price).
export function shareBeatsCashYield(o) {
  const s = Math.min(100, nz(o.cropSharePct)) / 100;
  const p = Math.min(100, nz(o.landlordInputPct)) / 100;
  if (s * nz(o.price) === 0) return null;
  return (nz(o.cashRent) + p * nz(o.sharedInputs)) / (s * nz(o.price));
}

// Rent the operator can pay and still keep `targetOperatorProfit` per acre at the expected yield,
// next to the cash a landlord would have to receive to match the share at the same yield. If the
// first is below the second, no cash rent clears both sides at these numbers.
export function negotiationRange(o) {
  const at = perAcre(o.yieldPerAcre, o.price, o);
  const operatorCeiling = at.revenue - at.allCosts - nz(o.targetOperatorProfit);
  const landlordFloor = at.share.landlord;
  return { operatorCeiling, landlordFloor, gap: operatorCeiling - landlordFloor, overlaps: operatorCeiling >= landlordFloor };
}

export const YIELD_FACTORS = [0.7, 0.85, 1, 1.15, 1.3];
export const PRICE_FACTORS = [0.8, 1, 1.2];

// Yield-by-price grid, per acre, for all three leases, with the best lease for each party in each
// cell. Ties go to cash rent (the simpler lease).
export function sensitivity(o) {
  const cells = [];
  for (const pf of PRICE_FACTORS) {
    for (const yf of YIELD_FACTORS) {
      const y = nz(o.yieldPerAcre) * yf;
      const pr = nz(o.price) * pf;
      const r = perAcre(y, pr, o);
      const best = (side) => {
        let b = "cash";
        for (const k of ["share", "flex"]) if (r[k][side] > r[b][side] + 1e-9) b = k;
        return b;
      };
      cells.push({ yieldFactor: yf, priceFactor: pf, yield: y, price: pr, ...r, bestLandlord: best("landlord"), bestOperator: best("operator") });
    }
  }
  return cells;
}

// Worst, expected and best landlord income and operator profit per lease across the grid. The
// spread is the risk each party carries: a crop share moves with the crop, cash rent does not.
export function riskSummary(o) {
  const cells = sensitivity(o);
  const out = {};
  for (const k of ["cash", "share", "flex"]) {
    const l = cells.map((c) => c[k].landlord);
    const op = cells.map((c) => c[k].operator);
    out[k] = {
      landlordWorst: Math.min(...l), landlordBest: Math.max(...l),
      operatorWorst: Math.min(...op), operatorBest: Math.max(...op),
      landlordSpread: Math.max(...l) - Math.min(...l),
      operatorSpread: Math.max(...op) - Math.min(...op),
    };
  }
  return out;
}

export function analyze(o) {
  const acres = nz(o.acres);
  const at = perAcre(o.yieldPerAcre, o.price, o);
  const perField = (k) => ({ landlord: at[k].landlord * acres, operator: at[k].operator * acres });
  return {
    at,
    field: { cash: perField("cash"), share: perField("share"), flex: perField("flex") },
    breakevenYield: shareBeatsCashYield(o),
    range: negotiationRange(o),
    grid: sensitivity(o),
    risk: riskSummary(o),
    acres: fin(acres),
  };
}
