// LCL vs FCL: pure arithmetic over numbers the user types.
// LCL is charged on the greater of volume (CBM) and weight (tonnes), with a minimum. FCL is a flat price per
// container, so the cost per CBM falls as the box fills. Nothing here knows a carrier's real tariff.

export const CONTAINERS = {
  "20GP": { label: "20' standard", cbm: 28, payloadKg: 26000 },
  "40GP": { label: "40' standard", cbm: 58, payloadKg: 26500 },
  "40HC": { label: "40' high cube", cbm: 68, payloadKg: 26500 },
};

const num = (v) => {
  const x = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(x) ? x : NaN;
};
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

export function parseInput(raw) {
  const f = {};
  for (const k of ["cbm", "weightKg", "units", "lclRate", "lclMinCbm", "lclFixed", "fclFixed", "rate20GP", "rate40GP", "rate40HC", "perWeekShipments", "carryPctYear", "goodsValue", "daysLclExtra"]) {
    f[k] = raw[k] === "" || raw[k] == null ? NaN : num(raw[k]);
  }
  if (!(f.cbm > 0)) return { error: "Enter the shipment volume in cubic metres (CBM), greater than zero." };
  if (!(f.weightKg >= 0)) return { error: "Enter the gross weight in kilograms (0 or more)." };
  if (!(f.lclRate > 0)) return { error: "Enter the LCL rate per CBM or tonne from your forwarder's quote." };
  const rates = {};
  for (const [id, key] of [["20GP", "rate20GP"], ["40GP", "rate40GP"], ["40HC", "rate40HC"]]) if (f[key] > 0) rates[id] = f[key];
  if (!Object.keys(rates).length) return { error: "Enter at least one full-container (FCL) price." };
  return {
    value: {
      cbm: f.cbm, weightKg: f.weightKg || 0, units: f.units > 0 ? f.units : 0,
      lclRate: f.lclRate, lclMinCbm: f.lclMinCbm >= 0 ? f.lclMinCbm : 1,
      lclFixed: f.lclFixed >= 0 ? f.lclFixed : 0, fclFixed: f.fclFixed >= 0 ? f.fclFixed : 0,
      rates, perWeek: f.perWeekShipments > 0 ? f.perWeekShipments : 0,
      carryPct: f.carryPctYear >= 0 ? f.carryPctYear : 0, goodsValue: f.goodsValue >= 0 ? f.goodsValue : 0,
      daysLclExtra: f.daysLclExtra >= 0 ? f.daysLclExtra : 0,
    },
  };
}

// Cost to ship a given volume LCL. Weight scales with volume at the shipment's own density.
export function lclCost(v, cbm = v.cbm) {
  const kg = v.cbm > 0 ? (v.weightKg / v.cbm) * cbm : 0;
  const chargeable = Math.max(cbm, kg / 1000, v.lclMinCbm);
  return { chargeable, basis: kg / 1000 > cbm ? "weight" : "volume", total: round2(chargeable * v.lclRate + v.lclFixed) };
}

export function fclCost(v, id, cbm = v.cbm) {
  const c = CONTAINERS[id];
  const kg = v.cbm > 0 ? (v.weightKg / v.cbm) * cbm : 0;
  const byVol = Math.ceil(cbm / c.cbm - 1e-9);
  const byWt = Math.ceil(kg / c.payloadKg - 1e-9);
  const n = Math.max(1, byVol, byWt);
  const filled = (cbm / (n * c.cbm)) * 100;
  return { id, n, limit: byWt > byVol ? "weight" : "volume", fillPct: Math.min(100, Math.round(filled)), total: round2(n * v.rates[id] + v.fclFixed) };
}

export function bestFcl(v, cbm = v.cbm) {
  return Object.keys(v.rates).map((id) => fclCost(v, id, cbm)).sort((a, b) => a.total - b.total)[0];
}

// Smallest volume (0.5 CBM steps) at which the cheapest full container is no dearer than LCL.
export function breakevenCbm(v) {
  for (let c = 0.5; c <= 200; c += 0.5) {
    if (bestFcl(v, c).total <= lclCost(v, c).total) return c;
  }
  return null;
}

export function plan(raw) {
  const p = parseInput(raw);
  if (p.error) return { error: p.error };
  const v = p.value;
  const lcl = lclCost(v);
  const options = [{ id: "LCL", label: "LCL (shared container)", total: lcl.total, note: `${lcl.chargeable.toFixed(2)} chargeable ${lcl.basis === "weight" ? "tonnes (weight governs)" : "CBM"}` }];
  for (const id of Object.keys(v.rates)) {
    const f = fclCost(v, id);
    options.push({ id, label: `${f.n} × ${CONTAINERS[id].label}`, total: f.total, note: `${f.fillPct}% full by ${f.limit}`, fillPct: f.fillPct });
  }
  const carry = (days) => (v.goodsValue && v.carryPct && days ? round2(v.goodsValue * (v.carryPct / 100) * (days / 365)) : 0);
  const carryLcl = carry(v.daysLclExtra);
  for (const o of options) {
    o.carry = o.id === "LCL" ? carryLcl : 0;
    o.all = round2(o.total + o.carry);
    o.perCbm = round2(o.total / v.cbm);
    o.perUnit = v.units ? round2(o.all / v.units) : null;
  }
  options.sort((a, b) => a.all - b.all);
  const best = options[0];
  const cheapestLclOrFcl = (kind) => options.find((o) => (kind === "lcl" ? o.id === "LCL" : o.id !== "LCL"));
  const lclOpt = cheapestLclOrFcl("lcl"), fclOpt = cheapestLclOrFcl("fcl");
  const be = breakevenCbm(v);
  const advice = [];
  if (best.id === "LCL") {
    advice.push(`LCL is cheapest at ${usd(best.all)} (${usd(best.perCbm)} per CBM). The cheapest container, ${fclOpt.label}, costs ${usd(fclOpt.all)}, which is ${usd(fclOpt.all - best.all)} more.`);
  } else {
    advice.push(`${best.label} is cheapest at ${usd(best.all)}${best.id !== "LCL" ? ` (${usd(best.perCbm)} per CBM)` : ""}, ${usd(lclOpt.all - best.all)} less than LCL at ${usd(lclOpt.all)}.`);
  }
  if (be !== null) advice.push(`At this cargo's density and these prices, a full container becomes no dearer than LCL from about ${be} CBM. You are shipping ${v.cbm} CBM, ${v.cbm >= be ? "above" : "below"} that line.`);
  else advice.push("At these prices a full container never undercuts LCL up to 200 CBM; check the container prices.");
  if (v.weightKg / 1000 > v.cbm) advice.push("Weight, not volume, sets the LCL charge (a tonne counts as one chargeable unit). Dense cargo is where LCL gets expensive fastest.");
  if (best.id !== "LCL" && best.fillPct < 60) advice.push(`The container would be only ${best.fillPct}% full; ask whether other stock can ride with it, which lowers the cost per unit.`);
  if (v.daysLclExtra && v.goodsValue) advice.push(`LCL's extra transit and consolidation days tie up about ${usd(carryLcl)} of money on this cargo; that is already included above.`);
  const yearly = v.perWeek ? round2((lclOpt.all - best.all) * v.perWeek * 52) : null;
  if (yearly !== null && best.id !== "LCL") advice.push(`Repeated every week, choosing ${best.label} over LCL is worth about ${usd(yearly)} a year.`);
  return { value: v, options, best, breakeven: be, advice, yearly };
}

export function sensitivity(raw, steps = [0.5, 1, 2, 5, 10, 15, 20, 25, 30, 40, 55, 65]) {
  const p = parseInput(raw);
  if (p.error) return [];
  const v = p.value;
  return steps.map((cbm) => {
    const l = lclCost(v, cbm), f = bestFcl(v, cbm);
    return { cbm, lcl: l.total, fcl: f.total, fclLabel: `${f.n} × ${f.id}`, winner: f.total <= l.total ? "FCL" : "LCL", perCbmLcl: round2(l.total / cbm), perCbmFcl: round2(f.total / cbm) };
  });
}

export function usd(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function sampleInput() {
  return { cbm: "12", weightKg: "3800", units: "2400", lclRate: "85", lclMinCbm: "1", lclFixed: "180", fclFixed: "250", rate20GP: "2400", rate40GP: "3300", rate40HC: "3450", perWeekShipments: "0", carryPctYear: "12", goodsValue: "30000", daysLclExtra: "10" };
}

export function toCsv(r) {
  const rows = [["option", "freight", "carrying cost", "total", "per CBM", "per unit"]];
  for (const o of r.options) rows.push([o.label, o.total, o.carry, o.all, o.perCbm, o.perUnit ?? ""]);
  return rows.map((x) => x.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}
