// EV charger (EVSE) installation quote: sizes the circuit from the charger's amps, checks voltage drop and panel
// headroom on the user's own figures, and prices the job from cost and a target margin. Arithmetic only; the
// install is designed and permitted by a licensed electrician under the adopted local code.

// Copper conductors, 75 C column of NEC Table 310.16 (the column most EVSE terminals are rated to), and circular mils.
export const COPPER = [
  { awg: "12", amps: 25, cm: 6530 },
  { awg: "10", amps: 35, cm: 10380 },
  { awg: "8", amps: 50, cm: 16510 },
  { awg: "6", amps: 65, cm: 26240 },
  { awg: "4", amps: 85, cm: 41740 },
  { awg: "3", amps: 100, cm: 52620 },
  { awg: "2", amps: 115, cm: 66360 },
  { awg: "1", amps: 130, cm: 83690 },
];
export const BREAKERS = [15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125];
const K_COPPER = 12.9; // ohm-circular-mil per foot, the usual design constant for copper
export const VD_LIMIT_PCT = 3; // branch-circuit voltage drop commonly designed to; guidance, not a mandate

export const SAMPLE = {
  chargerAmps: "32", volts: "240", runFt: "60", serviceAmps: "200", existingAmps: "135",
  chargerCost: "0", wirePerFt: "3.40", materials: "180", permit: "120", baseHours: "3.5", hoursPer100Ft: "2",
  laborRate: "95", overheadPct: "12", marginPct: "30",
};

function num(v) { if (v === "" || v === null || v === undefined) return NaN; return Number(v); }

export function sizeCircuit(chargerAmps) {
  const need = chargerAmps * 1.25; // continuous load
  const breaker = BREAKERS.find((b) => b >= need) ?? null;
  const conductors = COPPER.filter((c) => c.amps >= need);
  return { need, breaker, minWire: conductors[0] ?? null };
}

export function voltageDrop(wire, loadAmps, oneWayFt, volts) {
  const v = (2 * K_COPPER * loadAmps * oneWayFt) / wire.cm;
  return { volts: v, pct: (v / volts) * 100 };
}

export function price(cost, marginPct) { return cost / (1 - marginPct / 100); }

export function compute(raw) {
  const f = {};
  for (const k of Object.keys(SAMPLE)) f[k] = num(raw[k]);
  const errors = [];
  const need = (k, label, min, max) => {
    if (!Number.isFinite(f[k])) errors.push(`${label} is required.`);
    else if (f[k] < min || (max !== undefined && f[k] > max)) errors.push(`${label} must be ${max !== undefined ? `between ${min} and ${max}` : `at least ${min}`}.`);
  };
  need("chargerAmps", "Charger output amps", 8, 80);
  need("volts", "Supply voltage", 120, 277);
  need("runFt", "One-way run length in feet", 1, 500);
  need("serviceAmps", "Service size in amps", 60, 800);
  need("existingAmps", "Existing calculated demand in amps", 0, 800);
  need("chargerCost", "Charger cost you supply", 0);
  need("wirePerFt", "Conductor cost per foot", 0);
  need("materials", "Other materials", 0);
  need("permit", "Permit and inspection fees", 0);
  need("baseHours", "Base labor hours", 0);
  need("hoursPer100Ft", "Extra hours per 100 ft of run", 0);
  need("laborRate", "Labor rate per hour", 0);
  need("overheadPct", "Overhead percent", 0, 100);
  need("marginPct", "Target margin percent", 0, 90);
  if (errors.length) return { errors };
  const sz = sizeCircuit(f.chargerAmps);
  if (!sz.breaker || !sz.minWire) return { errors: ["That charger needs a larger circuit than this worksheet's tables cover (125 A breaker, 1 AWG copper)."] };

  const nominal = sz.minWire;
  let chosen = nominal;
  let vd = voltageDrop(chosen, f.chargerAmps, f.runFt, f.volts);
  let stepped = false;
  while (vd.pct > VD_LIMIT_PCT) {
    const next = COPPER[COPPER.indexOf(chosen) + 1];
    if (!next) break;
    chosen = next; stepped = true;
    vd = voltageDrop(chosen, f.chargerAmps, f.runFt, f.volts);
  }
  const nominalVd = voltageDrop(nominal, f.chargerAmps, f.runFt, f.volts);
  const addedAmps = sz.need;
  const headroom = f.serviceAmps - f.existingAmps - addedAmps;

  const lines = (run, margin) => {
    const wire = f.wirePerFt * run; // per foot of run, for the whole conductor set
    const labor = (f.baseHours + (f.hoursPer100Ft * run) / 100) * f.laborRate;
    const direct = f.chargerCost + wire + f.materials + f.permit + labor;
    const cost = direct * (1 + f.overheadPct / 100);
    const p = price(cost, margin);
    return { wire, labor, direct, cost, price: p, profit: p - cost, hours: f.baseHours + (f.hoursPer100Ft * run) / 100 };
  };
  const quote = lines(f.runFt, f.marginPct);
  const marginSweep = [f.marginPct - 10, f.marginPct - 5, f.marginPct, f.marginPct + 5, f.marginPct + 10]
    .filter((m) => m >= 0 && m <= 90).map((m) => ({ margin: m, price: lines(f.runFt, m).price }));
  const runSweep = [0, 25, 50, 100].map((extra) => ({ extra, run: f.runFt + extra, price: lines(f.runFt + extra, f.marginPct).price }));

  const findings = [];
  if (headroom < 0) findings.push({ severity: "high", title: `Panel: service ${f.serviceAmps} A minus existing demand ${f.existingAmps} A leaves ${(f.serviceAmps - f.existingAmps).toFixed(0)} A, less than the ${addedAmps.toFixed(0)} A this charger adds. Look at load management or a service upgrade before quoting a plain install.` });
  else if (headroom < 0.1 * f.serviceAmps) findings.push({ severity: "medium", title: `Panel headroom is thin: ${headroom.toFixed(0)} A left after this charger. Confirm the demand figure with a load calculation.` });
  if (stepped) findings.push({ severity: "medium", title: `${nominal.awg} AWG meets ampacity but drops ${nominalVd.pct.toFixed(1)}% over ${f.runFt} ft; ${chosen.awg} AWG brings it to ${vd.pct.toFixed(1)}%. Price the conductor you will actually pull.` });
  if (sz.breaker > chosen.amps) findings.push({ severity: "high", title: `Breaker ${sz.breaker} A exceeds the ${chosen.awg} AWG ampacity in the table.` });
  if (f.marginPct < 15) findings.push({ severity: "medium", title: `A ${f.marginPct}% margin is thin for a job with a permit and an inspection in it.` });
  findings.push({ severity: "info", title: "Check conductor size, breaker, grounding, GFCI and any load-management rule against the code your jurisdiction has adopted, and the charger's own installation manual." });

  return { errors: [], input: f, sizing: { ...sz, nominal, chosen, vd, nominalVd, stepped }, headroom, addedAmps, quote, marginSweep, runSweep, findings };
}

export function summaryText(r) {
  const s = r.sizing;
  return [
    `EV charger install: ${r.input.chargerAmps} A charger, ${r.input.runFt} ft run`,
    `Circuit: ${s.breaker} A breaker (125% of ${r.input.chargerAmps} A = ${s.need.toFixed(1)} A), ${s.chosen.awg} AWG copper (75 C ampacity ${s.chosen.amps} A)`,
    `Voltage drop: ${s.vd.volts.toFixed(2)} V = ${s.vd.pct.toFixed(2)}% at ${r.input.volts} V`,
    `Panel headroom after charger: ${r.headroom.toFixed(0)} A`,
    `Cost incl. overhead: $${r.quote.cost.toFixed(2)}; price at ${r.input.marginPct}% margin: $${r.quote.price.toFixed(2)}; profit $${r.quote.profit.toFixed(2)}`,
    "Worksheet only. Verify against the adopted electrical code and a load calculation.",
  ].join("\n");
}

export function sweepCsv(r) {
  return ["margin_pct,price", ...r.marginSweep.map((x) => `${x.margin},${x.price.toFixed(2)}`)].join("\n") + "\n";
}
