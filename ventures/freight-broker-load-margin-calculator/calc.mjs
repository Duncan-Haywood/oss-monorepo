// Freight broker load margin calculator: per-load and per-book net margin after
// the costs a gross-margin figure leaves out (the days the broker fronts the
// carrier's money, factoring, claims reserve, overhead, rep commission), plus
// the shipper rate to quote and the carrier rate to pay to hit a target net
// margin. Pure functions, no I/O, no network.

const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
export const money = (x) => (x < 0 ? "-" : "") + "$" + Math.abs(round(x, 0)).toLocaleString("en-US");
export const money2 = (x) => (x < 0 ? "-" : "") + "$" + Math.abs(round(x, 2)).toFixed(2);
export const pct = (x, d = 1) => round(x, d).toFixed(d) + "%";
export const num = (s) => {
  const n = Number(String(s ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) && String(s ?? "").trim() !== "" ? n : NaN;
};

export const DEFAULTS = { targetMarginPct: 10, financingAprPct: 10, factoringPct: 0, reservePct: 1, overheadPerLoad: 0, commissionPct: 0, carrierPayDays: 3 };

function splitFields(line) {
  const out = [];
  let cur = "", q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if ((ch === "," || ch === "\t") && !q) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const opt = (v, dflt) => (v === undefined || v === "" ? dflt : num(v));

// name, shipper rate, carrier rate, miles, extras billed, extras paid,
// days until the shipper pays, days until the carrier is paid.
export function parseLoads(text) {
  const loads = [], errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const c = splitFields(line);
    const at = `Line ${i + 1}`;
    if (/^(load|name)$/i.test(c[0])) return;
    if (c.length < 3) return errors.push(`${at}: need load name, shipper rate, carrier rate (got ${c.length} fields)`);
    const l = {
      name: c[0] || `Load ${loads.length + 1}`,
      shipperRate: num(c[1]), carrierRate: num(c[2]),
      miles: opt(c[3], 0), billedExtras: opt(c[4], 0), paidExtras: opt(c[5], 0),
      shipperDays: opt(c[6], 30), carrierDays: opt(c[7], null),
    };
    if (!(l.shipperRate > 0)) return errors.push(`${at}: shipper rate must be a positive number`);
    if (!(l.carrierRate >= 0)) return errors.push(`${at}: carrier rate must be 0 or more`);
    if (!(l.miles >= 0) || !(l.billedExtras >= 0) || !(l.paidExtras >= 0)) return errors.push(`${at}: miles and extras must be 0 or more`);
    if (!(l.shipperDays >= 0 && l.shipperDays <= 365)) return errors.push(`${at}: shipper days must be 0 to 365`);
    if (l.carrierDays !== null && !(l.carrierDays >= 0 && l.carrierDays <= 365)) return errors.push(`${at}: carrier days must be 0 to 365`);
    loads.push(l);
  });
  return { loads, errors };
}

function checkSettings(s) {
  const o = { ...DEFAULTS, ...s };
  for (const k of Object.keys(DEFAULTS)) if (!Number.isFinite(o[k]) || o[k] < 0) return { error: `${k} must be 0 or more` };
  if (o.financingAprPct > 100 || o.factoringPct >= 20 || o.reservePct >= 20 || o.commissionPct >= 100 || o.targetMarginPct >= 60) return { error: "a setting is out of range (target margin under 60, reserve and factoring under 20, commission under 100)" };
  return { o };
}

// Net profit is linear in revenue R and carrier cost K:
//   net = R(1 - f - q - m) - K(1 + g - m) - overhead
// f factoring, q reserve, m commission on gross profit, g = financing of K for
// the days the broker pays out before it collects. That linearity is what makes
// the quote and the ceiling exact rather than searched.
export function analyzeLoad(l, o) {
  const R = l.shipperRate + l.billedExtras;
  const K = l.carrierRate + l.paidExtras;
  const carrierDays = l.carrierDays === null ? o.carrierPayDays : l.carrierDays;
  const gapDays = Math.max(0, l.shipperDays - carrierDays);
  const f = o.factoringPct / 100, q = o.reservePct / 100, m = o.commissionPct / 100, t = o.targetMarginPct / 100;
  const g = (o.financingAprPct / 100) * gapDays / 365;
  const gross = R - K;
  const financing = K * g;
  const factoring = R * f;
  const reserve = R * q;
  const commission = Math.max(0, gross) * m;
  const net = gross - financing - factoring - reserve - commission - o.overheadPerLoad;
  const kc = 1 + g - m, rc = 1 - f - q - m;
  // Commission is paid on gross profit, so below zero gross it is not clawed back; the algebra
  // below assumes gross >= 0 and the quote is only quoted where that holds.
  const minRevenue = (K * kc + o.overheadPerLoad) / (rc - t);
  const maxCarrier = (R * (rc - t) - o.overheadPerLoad) / kc;
  const breakEvenRevenue = (K * kc + o.overheadPerLoad) / rc;
  const r = {
    name: l.name, revenue: R, carrierCost: K, gross, grossMargin: (gross / R) * 100,
    gapDays, financing, factoring, reserve, commission, overhead: o.overheadPerLoad,
    net, netMargin: (net / R) * 100,
    minShipperRate: Math.max(0, minRevenue - l.billedExtras),
    maxCarrierRate: Math.max(0, maxCarrier - l.paidExtras),
    breakEvenShipperRate: Math.max(0, breakEvenRevenue - l.billedExtras),
    shipperRate: l.shipperRate, carrierRate: l.carrierRate, miles: l.miles, flags: [],
  };
  if (l.miles > 0) {
    r.shipperPerMile = l.shipperRate / l.miles; r.carrierPerMile = l.carrierRate / l.miles;
    r.grossPerMile = gross / l.miles; r.netPerMile = net / l.miles;
  }
  r.shortfall = Math.max(0, minRevenue - R);
  if (net < 0) r.flags.push(gross >= 0 ? `Gross profit ${money(gross)} is positive but net is ${money(net)}: financing, reserve and overhead use it up.` : `Carrier cost exceeds what the shipper pays by ${money(-gross)}.`);
  else if (r.netMargin < o.targetMarginPct) r.flags.push(`Net margin ${pct(r.netMargin)} is under your ${pct(o.targetMarginPct)} target; quote ${money(r.minShipperRate)} or pay the carrier at most ${money(r.maxCarrierRate)}.`);
  if (gapDays >= 45 && financing > 0.25 * Math.max(gross, 1)) r.flags.push(`You front the carrier's money for ${gapDays} days; financing takes ${money(financing)}, ${pct((financing / Math.max(gross, 0.01)) * 100, 0)} of gross profit.`);
  if (!(l.miles > 0)) r.flags.push("No miles entered, so per-mile figures are blank.");
  return r;
}

export function analyze(loads, settings = {}) {
  const chk = checkSettings(settings);
  if (chk.error) return { error: chk.error };
  if (!loads.length) return { error: "Enter at least one load." };
  const o = chk.o;
  const results = loads.map((l) => analyzeLoad(l, o));
  const sum = (k) => results.reduce((a, r) => a + r[k], 0);
  const revenue = sum("revenue"), gross = sum("gross"), net = sum("net");
  const miles = results.reduce((a, r) => a + (r.miles || 0), 0);
  const under = results.filter((r) => r.net < 0), below = results.filter((r) => r.net >= 0 && r.netMargin < o.targetMarginPct);
  const best = [...results].sort((a, b) => b.net - a.net)[0], worst = [...results].sort((a, b) => a.net - b.net)[0];
  const totals = {
    loads: results.length, revenue, carrierCost: sum("carrierCost"), gross, grossMargin: (gross / revenue) * 100,
    financing: sum("financing"), factoring: sum("factoring"), reserve: sum("reserve"), commission: sum("commission"), overhead: sum("overhead"),
    net, netMargin: (net / revenue) * 100, netPerLoad: net / results.length,
    netPerMile: miles > 0 ? net / miles : undefined, losing: under.length, belowTarget: below.length,
    leak: gross - net, shortfall: sum("shortfall"),
  };
  return { settings: o, results, totals, best: best.name, worst: worst.name };
}

export function sampleLoads() {
  return [
    "# name, shipper rate, carrier rate, miles, extras billed, extras paid, shipper pays in (days), carrier paid in (days)",
    "Dallas to Atlanta, 2650, 2250, 780, 0, 0, 30, 3",
    "Chicago to Denver, 3100, 2790, 1000, 150, 150, 45, 3",
    "Reefer LA to Phoenix, 1480, 1310, 370, 0, 0, 60, 2",
    "Flatbed Houston to Memphis, 2200, 1730, 590, 100, 0, 30, 5",
    "Newark to Columbus, 1250, 1180, 540, 0, 75, 35, 3",
  ].join("\n");
}

export function loadsCsv(r) {
  const cols = ["load", "revenue", "carrier_cost", "gross_profit", "gross_margin_pct", "financing", "factoring", "reserve", "commission", "overhead", "net_profit", "net_margin_pct", "min_shipper_rate_for_target", "max_carrier_rate_for_target"];
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = r.results.map((x) => [x.name, x.revenue, x.carrierCost, x.gross, x.grossMargin, x.financing, x.factoring, x.reserve, x.commission, x.overhead, x.net, x.netMargin, x.minShipperRate, x.maxCarrierRate].map((v) => (typeof v === "number" ? round(v, 2) : v)));
  return [cols, ...rows].map((row) => row.map(esc).join(",")).join("\n") + "\n";
}
