// Lumper fee reimbursement check. Pure arithmetic over what the user types in: a receiver charges a driver a lumper (unloading) fee, and the
// driver gets it back through some route -- a broker-issued cash advance code, paying out of pocket and billing it on the invoice, or a
// factoring-company advance. Routes differ in the fee they charge, how much of the lumper they refund, a cap, and how many days the money
// is out. This turns each route into the dollars the driver is really out, plus the cost of the dock wait that came with it.

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

// One route per line: name, flat fee $, fee % of lumper, % of lumper refunded, cap $ (0 = none), days until the money is back
export function parseRoutes(text) {
  const routes = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const p = line.split(",").map((s) => s.trim());
    const [name, flatRaw, pctRaw, refundRaw, capRaw, daysRaw] = p;
    const where = `Route line ${i + 1}`;
    if (!name || refundRaw === undefined) return errors.push(`${where}: need "name, flat fee $, fee % of lumper, % refunded, cap $ (0 for none), days until paid".`);
    const flat = flatRaw === "" ? 0 : num(flatRaw), feePct = pctRaw === "" ? 0 : num(pctRaw), refundPct = num(refundRaw);
    const cap = capRaw === undefined || capRaw === "" ? 0 : num(capRaw), days = daysRaw === undefined || daysRaw === "" ? 0 : num(daysRaw);
    if (![flat, feePct, refundPct, cap, days].every(Number.isFinite)) return errors.push(`${where}: use plain numbers.`);
    if (flat < 0 || feePct < 0 || cap < 0 || days < 0) return errors.push(`${where}: fees, cap and days cannot be negative.`);
    if (refundPct < 0 || refundPct > 100) return errors.push(`${where}: the refunded percent must be between 0 and 100.`);
    routes.push({ name, flat, feePct, refundPct, cap, days });
  });
  return { routes, errors };
}

export function routeCost(route, { lumper, apr }) {
  const fee = route.flat + (lumper * route.feePct) / 100;
  const cashOut = lumper + fee;
  const wanted = (lumper * route.refundPct) / 100;
  const refunded = route.cap > 0 ? Math.min(wanted, route.cap) : wanted;
  const financing = (cashOut * (apr / 100) * route.days) / 365;
  const net = cashOut - refunded + financing;
  return {
    name: route.name,
    fee: round2(fee),
    cashOut: round2(cashOut),
    refunded: round2(refunded),
    financing: round2(financing),
    net: round2(net),
    makeWhole: round2(cashOut + financing),
    recoveredPct: cashOut > 0 ? Math.round((refunded / cashOut) * 100) : null,
  };
}

export function dockCost({ waitHours, freeHours, detentionRate, hourlyValue }) {
  const paidHours = Math.max(0, waitHours - freeHours);
  const detentionPaid = paidHours * detentionRate;
  const timeCost = waitHours * hourlyValue;
  return { paidHours: round2(paidHours), detentionPaid: round2(detentionPaid), timeCost: round2(timeCost), net: round2(timeCost - detentionPaid) };
}

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const v = {
    lumper: f("lumper"), linehaul: f("linehaul"), apr: f("apr"), waitHours: f("waitHours"), freeHours: f("freeHours", 2),
    detentionRate: f("detentionRate"), hourlyValue: f("hourlyValue"), perMonth: f("perMonth"),
  };
  for (const [k, x] of Object.entries(v)) if (!Number.isFinite(x) || x < 0) return { error: `Check the ${k}: use a plain number that is not negative.` };
  if (v.lumper <= 0) return { error: "Enter the lumper fee on the receipt (above zero)." };
  return { v };
}

export function plan(input) {
  const { v, error } = readInput(input);
  if (error) return { error };
  const { routes, errors } = parseRoutes(input.routes);
  if (errors.length) return { error: errors[0] };
  if (!routes.length) return { error: "Add at least one reimbursement route." };
  const dock = dockCost(v);
  const rows = routes.map((r) => {
    const c = routeCost(r, v);
    return { ...c, total: round2(c.net + dock.net), yearly: round2((c.net + dock.net) * v.perMonth * 12) };
  });
  const best = rows.reduce((a, b) => (b.net < a.net ? b : a));
  const worst = rows.reduce((a, b) => (b.net > a.net ? b : a));
  const advice = [];
  advice.push(`Best route: ${best.name}, leaving you out ${usd(best.net)} on a ${usd(v.lumper)} lumper.${rows.length > 1 ? ` The worst, ${worst.name}, leaves you out ${usd(worst.net)}.` : ""}`);
  if (best.net > 0.005) advice.push(`To end the load whole, the reimbursement request on ${best.name} needs to be ${usd(best.makeWhole)}: the lumper receipt plus the route's fee plus ${usd(best.financing)} of money tied up.`);
  if (dock.paidHours > 0) advice.push(`The dock wait earns ${dock.paidHours} paid detention hours (${usd(dock.detentionPaid)}) if the broker pays detention.`);
  else if (v.waitHours > 0) advice.push(`The wait of ${v.waitHours} hours is inside the ${v.freeHours} free hours, so none of it is billable detention; it cost ${usd(dock.timeCost)} of your time.`);
  if (v.linehaul > 0) advice.push(`The lumper is ${Math.round((v.lumper / v.linehaul) * 100)}% of the ${usd(v.linehaul)} linehaul; the whole stop costs ${usd(best.total)} net, or ${Math.round((best.total / v.linehaul) * 100)}%.`);
  return { error: null, input: v, dock, rows, best, worst, advice };
}

export function sensitivity(input) {
  const { v } = readInput(input);
  const { routes } = parseRoutes(input.routes);
  if (!v || !routes.length) return [];
  return [0.5, 0.75, 1, 1.25, 1.5, 2].map((m) => {
    const lumper = round2(v.lumper * m);
    const c = routeCost(routes[0], { ...v, lumper });
    return { lumper, net: c.net, refunded: c.refunded };
  });
}

function usd(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function sampleInput() {
  return {
    lumper: "175", linehaul: "1900", apr: "24", waitHours: "4.5", freeHours: "2", detentionRate: "40", hourlyValue: "35", perMonth: "6",
    routes: "Broker advance code, 0, 3, 100, 0, 0\nPay cash and bill the invoice, 0, 0, 100, 150, 30\nCash and hope after a short-pay, 0, 0, 60, 0, 45",
  };
}

export function toCsv(result) {
  const head = "route,fee,cash_out,refunded,financing,net,total_with_dock";
  return [head, ...result.rows.map((r) => [JSON.stringify(r.name), r.fee, r.cashOut, r.refunded, r.financing, r.net, r.total].join(","))].join("\n");
}
