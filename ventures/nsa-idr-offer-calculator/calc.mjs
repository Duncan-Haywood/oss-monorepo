// Offer sizing and file-or-skip economics for No Surprises Act IDR disputes. Pure functions, no DOM.
// Arithmetic on figures the user types. Nothing here is a QPA, a fee schedule, a legal deadline
// source, or a prediction of what an arbitrator will do: the win-chance curve is the user's own
// assumption, drawn between two points they enter.

export const DEFAULTS = Object.freeze({
  adminFee: 0, // paid by each party per dispute, not refunded; user types the current figure
  entityFee: 0, // paid per dispute; the model has the losing party bear it
  claimsPerDispute: 1, // lines batched into one dispute share the fees
  staffCost: 0, // your time per dispute, in dollars
  pWinAtQpa: 85, // % chance the arbitrator picks you if you offer exactly the QPA
  pWinAtBilled: 25, // % chance if you offer your full billed charge
  payerOfferPctQpa: 100, // what you expect the payer to offer, as % of the QPA
  grid: 100,
});

const num = (v, d = 0) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

// Lines: "label, billed charge, QPA, amount already paid, your offer (optional)", one per line.
export function parseClaims(text) {
  const rows = [], warnings = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cells.length < 3) { skipped++; continue; }
    const billed = num(cells[1], NaN), qpa = num(cells[2], NaN);
    if (!Number.isFinite(billed) || !Number.isFinite(qpa)) { if (rows.length || !/billed|label|code|service/i.test(line)) skipped++; continue; }
    const paid = num(cells[3], 0);
    const offerCell = cells[4] === undefined || cells[4] === "" ? null : num(cells[4], NaN);
    if (billed <= 0 || qpa <= 0 || !(paid >= 0) || (offerCell !== null && !(offerCell > 0))) { skipped++; continue; }
    rows.push({ label: cells[0] || "Claim", billed, qpa, paid, offer: offerCell });
  }
  if (skipped) warnings.push(`${skipped} line(s) skipped (need a label, a positive billed charge and QPA, and a paid amount of zero or more).`);
  if (!rows.length) return { error: "Add at least one claim: label, billed charge, QPA, amount already paid, optional offer." };
  return { rows, warnings };
}

const clean = (opts) => {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (opts && opts[k] !== undefined) o[k] = num(opts[k], DEFAULTS[k]);
  return o;
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Win chance (0..1) for an offer: flat at pWinAtQpa up to the QPA, then falling in a straight line to
// pWinAtBilled at the billed charge.
export function winChance(offer, qpa, billed, pQpa, pBilled) {
  if (billed <= qpa) return pQpa;
  const t = clamp((offer - qpa) / (billed - qpa), 0, 1);
  return pQpa + (pBilled - pQpa) * t;
}

// Expected net gain over what was already paid. Win: you receive `offer`. Lose: you receive the
// payer's offer. The admin fee is paid either way; the entity fee only on a loss.
export function expectedNet({ offer, theirs, paid, p, admin, entity, staff }) {
  return (theirs - paid) + p * (offer - theirs) - admin - (1 - p) * entity - staff;
}

// Win chance at which expected net is exactly zero for a given offer; null when no chance can reach it.
export function breakEvenWinChance({ offer, theirs, paid, admin, entity, staff }) {
  const gain = theirs - paid;
  const denom = offer - theirs + entity;
  const numer = admin + entity + staff - gain;
  if (numer <= 0) return 0; // pays for itself even if you lose
  if (denom <= 0) return null;
  const p = numer / denom;
  return p > 1 ? null : p;
}

function evaluate(c, o, offer) {
  const claims = o.claimsPerDispute;
  const admin = o.adminFee / claims, entity = o.entityFee / claims, staff = o.staffCost / claims;
  const theirs = Math.max(c.paid, c.qpa * (o.payerOfferPctQpa / 100));
  const p = winChance(offer, c.qpa, c.billed, o.pWinAtQpa / 100, o.pWinAtBilled / 100);
  const ev = expectedNet({ offer, theirs, paid: c.paid, p, admin, entity, staff });
  const be = breakEvenWinChance({ offer, theirs, paid: c.paid, admin, entity, staff });
  return { offer, theirs, p, ev, breakEven: be, admin, entity, staff };
}

// Search offers from the QPA up to the billed charge for the best expected net.
function bestOffer(c, o) {
  const lo = c.qpa, hi = Math.max(c.billed, c.qpa);
  const steps = Math.max(1, Math.round(o.grid));
  let best = null;
  for (let i = 0; i <= steps; i++) {
    const offer = lo + ((hi - lo) * i) / steps;
    const e = evaluate(c, o, offer);
    if (!best || e.ev > best.ev + 1e-9) best = e;
  }
  return best;
}

export function analyze(claims, opts = {}) {
  const o = clean(opts);
  for (const k of Object.keys(DEFAULTS)) if (!Number.isFinite(o[k]) || o[k] < 0) return { error: `Check the number in "${k}".` };
  if (o.claimsPerDispute < 1) return { error: "Claims per dispute must be at least 1." };
  if (o.pWinAtQpa > 100 || o.pWinAtBilled > 100) return { error: "Win chances are percentages between 0 and 100." };
  if (o.pWinAtBilled > o.pWinAtQpa) return { error: "Win chance at the billed charge should not exceed the chance at the QPA; a higher ask does not raise your odds." };
  const warnings = [];
  if (o.adminFee === 0 && o.entityFee === 0) warnings.push("Both fees are zero, so every claim looks worth filing. Enter the current administrative and IDR entity fees from the federal IDR portal.");
  if (claims.some((c) => c.billed <= c.qpa)) warnings.push("At least one billed charge is at or below its QPA; those lines can only be offered at the QPA.");
  if (claims.some((c) => c.offer !== null && c.offer > c.billed)) warnings.push("At least one of your offers is above the billed charge.");

  const lines = claims.map((c) => {
    const opt = bestOffer(c, o);
    const chosenOffer = c.offer !== null ? c.offer : opt.offer;
    const chosen = c.offer !== null ? evaluate(c, o, c.offer) : opt;
    const sameOffer = c.offer !== null && Math.abs(c.offer - opt.offer) < 0.005;
    return {
      ...c,
      theirs: chosen.theirs,
      optimal: opt,
      optimalPctQpa: opt.offer / c.qpa,
      offerUsed: chosenOffer,
      offerPctQpa: chosenOffer / c.qpa,
      userSupplied: c.offer !== null,
      userMatchesBest: sameOffer,
      p: chosen.p,
      ev: chosen.ev,
      breakEven: chosen.breakEven,
      file: chosen.ev > 0,
      upsideIfWin: chosenOffer - c.paid,
      downsideIfLose: -(chosen.admin + chosen.entity + chosen.staff) + (chosen.theirs - c.paid),
      evLeftOnTable: c.offer !== null ? opt.ev - chosen.ev : 0,
    };
  });

  const filing = lines.filter((l) => l.file);
  const totalEv = filing.reduce((a, l) => a + l.ev, 0);
  const skippedValue = lines.filter((l) => !l.file).reduce((a, l) => a + l.ev, 0);
  const atStake = filing.reduce((a, l) => a + l.upsideIfWin, 0);
  const disputes = Math.ceil(filing.length / o.claimsPerDispute);
  const feesCommitted = disputes * o.adminFee;

  // Shift both win chances together to show how much of the answer rides on the assumption.
  const sensitivity = [-20, -10, 0, 10].map((d) => {
    const o2 = { ...o, pWinAtQpa: clamp(o.pWinAtQpa + d, 0, 100), pWinAtBilled: clamp(o.pWinAtBilled + d, 0, 100) };
    let total = 0, n = 0;
    for (const c of claims) {
      const e = c.offer !== null ? evaluate(c, o2, c.offer) : bestOffer(c, o2);
      if (e.ev > 0) { total += e.ev; n++; }
    }
    return { delta: d, pWinAtQpa: o2.pWinAtQpa, filing: n, totalEv: total };
  });

  let verdict;
  if (!filing.length) verdict = "At these fees and win chances no claim has a positive expected value, so none is worth taking to IDR on these numbers.";
  else verdict = `${filing.length} of ${lines.length} claim(s) have a positive expected net: about $${Math.round(totalEv).toLocaleString("en-US")} after fees, with $${Math.round(atStake).toLocaleString("en-US")} more than already paid on the table if all of them win.`;

  return { options: o, lines, filing: filing.length, totalEv, skippedValue, atStake, disputes, feesCommitted, sensitivity, verdict, warnings };
}

// ---- Calibrate the win-chance curve from your own past disputes -------------------------------
// IDR is pick-one: the arbitrator takes your offer or the payer's. Each past dispute is one
// yes/no result at the position of your offer between the QPA (t=0) and the billed charge (t=1).
// A logistic curve p = 1/(1+exp(-(a+b*t))) is fitted by Newton's method with a ridge pull toward
// the curve the user currently assumes, so a handful of results nudges the curve and many results
// replace it. In-sample arithmetic on the user's own records: not a prediction of any arbitrator.

const WON = /^(w|won|win|wins|yes|y|true|1|prevailed|ours)$/i;
const LOST = /^(l|lost|loss|lose|no|n|false|0|payer|theirs)$/i;

// Lines: "label, billed charge, QPA, the offer you submitted, result (won/lost)".
export function parseOutcomes(text) {
  const rows = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cells.length < 5) { skipped++; continue; }
    const billed = num(cells[1], NaN), qpa = num(cells[2], NaN), offer = num(cells[3], NaN);
    const res = cells[4];
    const won = WON.test(res) ? 1 : LOST.test(res) ? 0 : null;
    if (!Number.isFinite(billed) || !Number.isFinite(qpa) || !Number.isFinite(offer) || won === null) {
      if (rows.length || !/billed|label|result|offer/i.test(line)) skipped++;
      continue;
    }
    if (billed <= 0 || qpa <= 0 || offer <= 0) { skipped++; continue; }
    const t = billed <= qpa ? 0 : clamp((offer - qpa) / (billed - qpa), 0, 1);
    rows.push({ label: cells[0] || "Dispute", billed, qpa, offer, won, t });
  }
  if (!rows.length) return { error: "Add at least one past dispute: label, billed charge, QPA, the offer you submitted, won or lost." };
  const warnings = [];
  if (skipped) warnings.push(`${skipped} line(s) skipped (need a label, positive billed charge, QPA and offer, and a result of won or lost).`);
  return { rows, warnings };
}

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const logit = (p) => Math.log(p / (1 - p));
const logitPct = (pct) => logit(clamp(pct, 1, 99) / 100);

// Wilson 95% interval for a win rate.
export function wilson(wins, n, z = 1.96) {
  if (!n) return null;
  const p = wins / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

function newton(rows, prior, lambda, freezeB) {
  let a = prior.a, b = freezeB ? 0 : prior.b;
  for (let it = 0; it < 100; it++) {
    let ga = lambda * (a - prior.a), gb = freezeB ? 0 : lambda * (b - prior.b);
    let haa = lambda, hab = 0, hbb = freezeB ? 1 : lambda;
    for (const r of rows) {
      const p = sigmoid(a + b * r.t), w = p * (1 - p), e = p - r.won;
      ga += e; haa += w;
      if (!freezeB) { gb += e * r.t; hab += w * r.t; hbb += w * r.t * r.t; }
    }
    let da, db = 0;
    if (freezeB) da = ga / haa;
    else { const det = haa * hbb - hab * hab; da = (hbb * ga - hab * gb) / det; db = (haa * gb - hab * ga) / det; }
    a -= da; b -= db;
    if (Math.abs(da) + Math.abs(db) < 1e-10) break;
  }
  return { a, b };
}

const brier = (rows, a, b) => rows.reduce((s, r) => s + (sigmoid(a + b * r.t) - r.won) ** 2, 0) / rows.length;

export function fitWinCurve(rows, opts = {}) {
  const o = clean(opts), lambda = Math.max(0.05, Number.isFinite(+opts.priorWeight) && opts.priorWeight !== undefined && opts.priorWeight !== "" ? +opts.priorWeight : 0.5); // floor keeps a perfectly separated history finite
  if (!rows || !rows.length) return { error: "No past disputes to fit." };
  const prior = { a: logitPct(o.pWinAtQpa) , b: logitPct(o.pWinAtBilled) - logitPct(o.pWinAtQpa) };
  let { a, b } = newton(rows, prior, lambda, false);
  let flattened = false;
  if (b > 0) { ({ a, b } = newton(rows, prior, lambda, true)); flattened = true; } // a higher ask never raises the odds
  const n = rows.length, wins = rows.reduce((s, r) => s + r.won, 0);
  const pWinAtQpa = sigmoid(a) * 100, pWinAtBilled = sigmoid(a + b) * 100;
  const notes = [];
  if (n < 20) notes.push(`Only ${n} result(s): the fit leans on your current assumption. Treat the curve as a nudge, not a measurement.`);
  if (flattened) notes.push("Your results show no drop in wins as offers rise, so the curve was held flat; a higher ask is never modelled as winning more often.");
  const nearQpa = rows.filter((r) => r.t < 0.5).length;
  if (n >= 5 && (nearQpa === 0 || nearQpa === n)) notes.push("All results sit on one side of the QPA-to-billed range, so the slope is mostly your prior. Record some results at the other end.");
  return {
    n, wins, rate: wins / n, interval: wilson(wins, n),
    pWinAtQpa: Math.round(pWinAtQpa * 10) / 10, pWinAtBilled: Math.round(pWinAtBilled * 10) / 10,
    brierFit: brier(rows, a, b), brierPrior: brier(rows, prior.a, prior.b), brierBase: brier(rows, logit(clamp(wins / n, 0.01, 0.99)), 0),
    flattened, notes,
  };
}

// ---- Deadlines -------------------------------------------------------------------------------
// Counts business days (Monday-Friday, minus holidays the user lists) from an ISO date. The tool
// does not know the federal holiday calendar; the user supplies it.

const iso = (d) => d.toISOString().slice(0, 10);
const parseIso = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return iso(d) === `${m[1]}-${m[2]}-${m[3]}` ? d : null;
};

export function parseHolidays(text) {
  const set = new Set(), bad = [];
  for (const tok of String(text || "").split(/[\s,;]+/)) {
    if (!tok) continue;
    const d = parseIso(tok);
    if (d) set.add(iso(d)); else bad.push(tok);
  }
  return { set, bad };
}

export function addBusinessDays(startIso, n, holidays = new Set()) {
  const d = parseIso(startIso);
  if (!d) return null;
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6 || holidays.has(iso(d))) continue;
    left--;
  }
  return iso(d);
}

// Open negotiation runs 30 business days from the initial payment or denial notice; an IDR request
// then has to be started within 4 business days after that period ends. Verify against current
// federal guidance: this is a calendar helper, not a legal determination.
export function deadlines(initialIso, holidaysText = "", negotiationDays = 30, initiationDays = 4) {
  const { set, bad } = parseHolidays(holidaysText);
  const start = parseIso(initialIso);
  if (!start) return { error: "Enter the date of the initial payment or denial as YYYY-MM-DD." };
  const negotiationEnds = addBusinessDays(initialIso, negotiationDays, set);
  const initiateBy = addBusinessDays(negotiationEnds, initiationDays, set);
  const warnings = [];
  if (bad.length) warnings.push(`Ignored holiday entries that are not YYYY-MM-DD dates: ${bad.join(", ")}.`);
  if (!set.size) warnings.push("No holidays entered, so only weekends are skipped. Add federal holidays that fall in the window or the dates will be too early.");
  return { negotiationEnds, initiateBy, negotiationDays, initiationDays, warnings };
}

export function daysUntil(targetIso, todayIso) {
  const a = parseIso(targetIso), b = parseIso(todayIso);
  if (!a || !b) return null;
  return Math.round((a - b) / 86400000);
}

export function sampleOutcomes() {
  return "label,billed,QPA,your offer,result\nER visit level 5,3100,950,1000,won\nER visit level 4,2000,600,640,won\nER visit level 5,3300,1000,1900,lost\nCT abdomen,2800,700,1500,lost\nAnesthesia 60 min,2200,500,520,won\nLaceration repair,1300,250,300,won\nER visit level 5,3000,900,1250,won\nCT abdomen,2900,740,2200,lost\nUrgent care visit,500,160,170,won\nER visit level 4,2100,620,1100,lost\nAnesthesia 90 min,2500,560,900,won\nER visit level 5,3200,980,2800,lost";
}

export function sampleClaims() {
  return "label,billed,QPA,paid so far,your offer (optional)\nER visit level 5,3200,980,640\nER visit level 4,2100,610,420\nCT abdomen with contrast,2850,720,380,1400\nAnesthesia 90 minutes,2400,540,300\nLaceration repair,1350,260,190\nUrgent care visit,480,170,160";
}

const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "");
export function reportCsv(r) {
  const out = [["Claim", "Billed", "QPA", "Paid so far", "Payer offer assumed", "Offer used", "Offer as % of QPA", "Win chance", "Expected net", "Break-even win chance", "Best offer", "File"]];
  for (const l of r.lines) out.push([l.label, f2(l.billed), f2(l.qpa), f2(l.paid), f2(l.theirs), f2(l.offerUsed), (l.offerPctQpa * 100).toFixed(0) + "%", (l.p * 100).toFixed(0) + "%", f2(l.ev), l.breakEven === null ? "n/a" : (l.breakEven * 100).toFixed(0) + "%", f2(l.optimal.offer), l.file ? "yes" : "no"]);
  out.push([]);
  out.push(["Assumed win chance shift", "Claims worth filing", "Total expected net"]);
  for (const s of r.sensitivity) out.push([(s.delta > 0 ? "+" : "") + s.delta + " pts", s.filing, f2(s.totalEv)]);
  const q = (c) => { const s = String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return out.map((row) => row.map(q).join(",")).join("\n") + "\n";
}

export const money = (v) => (v < 0 ? "-$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US");
export const money2 = (v) => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (v, d = 1) => (v * 100).toFixed(d) + "%";
