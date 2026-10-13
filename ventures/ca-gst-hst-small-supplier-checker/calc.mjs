// Canada GST/HST small supplier check: when does a business have to register and start charging?
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. The rule modelled is the
// CAD 30,000 small-supplier threshold: exceeded in a single calendar quarter, or in total over
// four consecutive calendar quarters. Taxi and ride-share operators have no small-supplier
// exception. Every result names its source to verify.

export const VERIFY = "CRA 'Do you need to register for and start charging the GST/HST?' and 'Register for a GST/HST account'; Excise Tax Act (Canada) s. 148 (small supplier) and s. 240 (registration)";
export const THRESHOLD = 30_000;
export const QUARTERS = 8;

export function parse(input) {
  const i = input || {};
  const errors = [];
  const q = [];
  for (let k = 1; k <= QUARTERS; k++) {
    const raw = i["q" + k] === undefined || i["q" + k] === "" || i["q" + k] === null ? 0 : Number(i["q" + k]);
    if (!Number.isFinite(raw) || raw < 0) { errors.push(`Enter an amount of zero or more for quarter ${k}.`); q.push(0); } else q.push(raw);
  }
  const year = Number(i.lastYear), quarter = Number(i.lastQ);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) errors.push("Enter the year of your most recent quarter, such as 2026.");
  if (![1, 2, 3, 4].includes(quarter)) errors.push("Pick the calendar quarter (1 to 4) of your most recent quarter.");
  const yn = (v) => v === true || v === "yes";
  return { errors, q, year, quarter, taxi: yn(i.taxi), quebec: yn(i.quebec), charity: yn(i.charity) };
}

// Label for quarter index k (0 = oldest) given the most recent quarter.
export function quarterAt(year, quarter, k) {
  const idx = year * 4 + (quarter - 1) - (QUARTERS - 1 - k);
  const y = Math.floor(idx / 4), n = (idx % 4) + 1;
  const endMonth = n * 3;
  return { year: y, n, label: `Q${n} ${y}`, endMonth, endIso: isoDate(y, endMonth, lastDay(y, endMonth)) };
}

const pad = (n) => String(n).padStart(2, "0");
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const isoDate = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const addDays = (iso, days) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

// The rolling-total rule: small supplier status ends at the end of the month after the
// quarter in which the four-quarter total passed 30,000, so charging starts the day after.
export function rollingEffective(quarterEndYear, endMonth) {
  const m = endMonth + 1;
  const y = quarterEndYear + (m > 12 ? 1 : 0);
  const mm = m > 12 ? m - 12 : m;
  return addDays(isoDate(y, mm, lastDay(y, mm)), 1);
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const quarters = p.q.map((amount, k) => {
    const meta = quarterAt(p.year, p.quarter, k);
    const rolling = k >= 3 ? p.q[k] + p.q[k - 1] + p.q[k - 2] + p.q[k - 3] : null;
    return { ...meta, amount, rolling, single: amount > THRESHOLD, rollingOver: rolling !== null && rolling > THRESHOLD };
  });
  const hit = quarters.find((x) => x.single || x.rollingOver) || null;
  const findings = [];
  const obligations = [];
  let trigger = null;

  if (p.taxi) {
    trigger = { kind: "taxi", label: "Taxi or ride-share operator" };
    findings.push({ severity: "high", title: "Taxi, limousine and ride-share operators cannot be small suppliers. You must be registered from the first fare, whatever your revenue." });
  } else if (hit) {
    if (hit.single) {
      trigger = { kind: "single", label: hit.label, quarter: hit };
      findings.push({ severity: "high", title: `${hit.label} sales of CAD ${hit.amount.toLocaleString("en-CA")} are above CAD 30,000 in one quarter. You become a registrant on the sale that took the quarter over CAD 30,000, must charge GST/HST on that sale, and register within 29 days.` });
    } else {
      const effective = rollingEffective(hit.year, hit.endMonth);
      trigger = { kind: "rolling", label: hit.label, quarter: hit, effective, registerBy: addDays(effective, 29) };
      findings.push({ severity: "high", title: `The four quarters ending ${hit.label} total CAD ${hit.rolling.toLocaleString("en-CA")}, above CAD 30,000. Small supplier status ends at the end of the month after that quarter; charging starts ${effective} and registration is due within 29 days (${trigger.registerBy}).` });
    }
  }

  const latest = quarters[QUARTERS - 1];
  if (!trigger) {
    const sum = latest.rolling;
    const room = THRESHOLD - sum;
    findings.unshift({ severity: "info", title: `No threshold crossed in the quarters you entered. The latest four quarters total CAD ${sum.toLocaleString("en-CA")}, leaving CAD ${room.toLocaleString("en-CA")} before CAD 30,000.` });
    if (sum >= THRESHOLD * 0.9) findings.push({ severity: "medium", title: "Within 10% of the CAD 30,000 line over four quarters. Track every sale from here; one large order can end small supplier status." });
    if (latest.amount >= THRESHOLD * 0.8) findings.push({ severity: "medium", title: "This quarter alone is above 80% of CAD 30,000. A single-quarter breach makes you a registrant on that very sale." });
    obligations.push(
      { ref: "Voluntary", title: "Registering early is allowed", why: "You can register voluntarily to claim input tax credits on your business costs, at the price of charging tax from then on." },
      { ref: "Watch", title: "Re-test every quarter", why: "Add each finished quarter and drop the oldest. The test is rolling, not a calendar year." },
    );
  } else {
    obligations.push(
      { ref: "Register", title: "Get a GST/HST account", why: "Register through CRA My Business Account or by phone to receive a business number with an RT account." },
      { ref: "Charge", title: "Charge the right rate", why: "Apply 5% GST, or the HST rate of the province where the customer is, from your effective date." },
      { ref: "Credits", title: "Claim input tax credits", why: "Once registered you can recover the GST/HST you paid on business purchases; keep invoices and receipts." },
      { ref: "File", title: "Choose a filing period", why: "Annual, quarterly or monthly depending on revenue; CRA assigns the default, and annual filers still pay instalments in some cases." },
    );
  }
  if (p.quebec) findings.push({ severity: "info", title: "In Quebec the QST has its own CAD 30,000 test and a separate registration with Revenu Quebec. Registering for GST does not register you for QST." });
  if (p.charity) findings.push({ severity: "info", title: "Charities and public institutions have a different small-supplier test (CAD 50,000). This tool uses the CAD 30,000 test." });
  return { errors: [], quarters, trigger, findings, obligations, latestTotal: latest.rolling };
}

export const SAMPLE = { lastYear: 2026, lastQ: 3, q1: 4000, q2: 5200, q3: 6100, q4: 6800, q5: 7400, q6: 8200, q7: 9300, q8: 10400, taxi: "no", quebec: "no", charity: "no" };

// Quick Method vs regular accounting for a year (rates written from memory; confirm on canada.ca).
// sales: yearly taxable sales before tax. costs: yearly costs carrying GST/HST you could claim as input tax credits.
export const QM_LIMIT = 400_000;
export const QM_REGIONS = [
  { id: "gst5", label: "GST only: AB, NT, NU, YT, BC, SK, MB, QC (5%)", rate: 0.05, services: 0.036, goods: 0.018 },
  { id: "on13", label: "Ontario HST (13%)", rate: 0.13, services: 0.088, goods: 0.044 },
  { id: "atl15", label: "NB, NL, PE HST (15%)", rate: 0.15, services: 0.1, goods: 0.05 },
];
export function quickCompare(input) {
  const errors = [];
  const sales = input.sales === "" || input.sales == null ? NaN : Number(input.sales);
  const costs = input.costs === "" || input.costs == null ? NaN : Number(input.costs);
  const region = QM_REGIONS.find((r) => r.id === input.region);
  const kind = input.kind === "goods" || input.kind === "services" ? input.kind : null;
  if (!Number.isFinite(sales) || sales < 0) errors.push("Yearly sales must be zero or more.");
  if (!Number.isFinite(costs) || costs < 0) errors.push("Yearly costs must be zero or more.");
  if (!region) errors.push("Choose where you sell.");
  if (!kind) errors.push("Choose services or goods.");
  if (errors.length) return { ok: false, errors };
  const collected = sales * region.rate;
  const itc = costs * region.rate;
  const regularPay = collected - itc;
  const gross = sales * (1 + region.rate);
  const qmRate = region[kind];
  const credit = 0.01 * Math.min(gross, 30_000);
  const quickPay = gross * qmRate - credit;
  const diff = regularPay - quickPay;
  const findings = [];
  if (gross > QM_LIMIT) findings.push({ severity: "high", title: "Above the Quick Method limit", detail: `The method is open to businesses with worldwide taxable supplies of CAD ${QM_LIMIT.toLocaleString("en-CA")} or less, tax included. Above that, use regular accounting.` });
  findings.push({ severity: "info", title: diff > 0 ? "Quick Method remits less" : "Regular accounting remits less", detail: diff > 0 ? `You would remit about CAD ${Math.round(diff).toLocaleString("en-CA")} less a year. You still charge customers the full tax; you cannot claim input tax credits except on capital purchases.` : `Regular accounting leaves you about CAD ${Math.round(-diff).toLocaleString("en-CA")} better off a year because your input tax credits are worth more.` });
  findings.push({ severity: "info", title: "Not modelled", detail: "Nova Scotia (14%), mixed goods-and-services businesses, and professions the CRA bars from the Quick Method (accounting, legal, bookkeeping, financial consulting) are not modelled." });
  return { ok: true, sales, gross, collected, itc, regularPay, qmRate, credit, quickPay, diff, findings, errors: [] };
}

export function summaryText(r) {
  const L = ["Canada GST/HST small supplier check", ""];
  for (const x of r.quarters) L.push(`${x.label}: CAD ${x.amount.toLocaleString("en-CA")}${x.rolling === null ? "" : `  (4-quarter total CAD ${x.rolling.toLocaleString("en-CA")})`}${x.single ? "  ABOVE 30,000 IN ONE QUARTER" : x.rollingOver ? "  ABOVE 30,000 OVER FOUR QUARTERS" : ""}`);
  L.push("");
  if (r.trigger) {
    L.push(`Registration required: ${r.trigger.kind === "taxi" ? "from the first fare (taxi or ride-share)" : r.trigger.kind === "single" ? `on the sale that took ${r.trigger.label} over 30,000` : `from ${r.trigger.effective}, register by ${r.trigger.registerBy}`}`);
  } else L.push("Not required on these figures.");
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
