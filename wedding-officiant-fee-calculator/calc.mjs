// Wedding officiant fee maths. Pure functions, no DOM, no network.
// Every figure is the officiant's own input; nothing here is a market rate or
// a prediction of how many ceremonies anyone will book.

export const SAMPLE = {
  fee: "450", ceremonies: "30", ceremonyHours: "1", consultHours: "1.5", scriptHours: "3", rehearsalHours: "1",
  rehearsalFee: "100", rehearsalShare: "50", miles: "40", mileageRate: "0.70", travelFee: "0", licenseYear: "150",
  insuranceYear: "200", listingsYear: "400", suppliesEvent: "15", targetHourly: "60",
};

const num = (v) => {
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const opt = (v, d) => (String(v ?? "").trim() === "" ? d : num(v));
export const dollars = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n) => Math.round(n * 100) / 100;

export function parse(raw) {
  const errors = [];
  const fee = num(raw.fee), ceremonies = num(raw.ceremonies);
  if (!(fee > 0)) errors.push("Enter your ceremony fee in dollars (more than 0).");
  if (!(ceremonies > 0)) errors.push("Enter how many ceremonies you expect to perform in a year (more than 0).");
  const p = {
    ceremonyHours: opt(raw.ceremonyHours, 1), consultHours: opt(raw.consultHours, 0), scriptHours: opt(raw.scriptHours, 0),
    rehearsalHours: opt(raw.rehearsalHours, 0), rehearsalFee: opt(raw.rehearsalFee, 0), rehearsalShare: opt(raw.rehearsalShare, 0),
    miles: opt(raw.miles, 0), mileageRate: opt(raw.mileageRate, 0), travelFee: opt(raw.travelFee, 0),
    licenseYear: opt(raw.licenseYear, 0), insuranceYear: opt(raw.insuranceYear, 0), listingsYear: opt(raw.listingsYear, 0),
    suppliesEvent: opt(raw.suppliesEvent, 0), targetHourly: opt(raw.targetHourly, 0),
  };
  const labels = { ceremonyHours: "Ceremony hours", consultHours: "Consultation hours", scriptHours: "Script writing hours", rehearsalHours: "Rehearsal hours", rehearsalFee: "Rehearsal fee", rehearsalShare: "Rehearsal share", miles: "Round-trip miles", mileageRate: "Mileage rate", travelFee: "Travel fee", licenseYear: "Registration costs", insuranceYear: "Insurance", listingsYear: "Directory and advertising costs", suppliesEvent: "Supplies per ceremony", targetHourly: "Target hourly pay" };
  for (const [k, v] of Object.entries(p)) if (!(v >= 0)) errors.push(`${labels[k]} must be 0 or more.`);
  if (p.rehearsalShare > 100) errors.push("Rehearsal share is a percentage from 0 to 100.");
  if (!(p.ceremonyHours > 0)) errors.push("Ceremony hours must be more than 0 (include arrival and waiting time).");
  return { errors, fee, ceremonies, ...p };
}

function perCeremony(p, fee) {
  const rehearsals = p.rehearsalShare / 100;
  const hours = p.ceremonyHours + p.consultHours + p.scriptHours + rehearsals * p.rehearsalHours;
  const revenue = fee + p.travelFee + rehearsals * p.rehearsalFee;
  const drive = p.miles * p.mileageRate;
  const direct = drive + p.suppliesEvent;
  return { hours, revenue, drive, direct };
}

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const c = perCeremony(p, p.fee);
  const fixedYear = p.licenseYear + p.insuranceYear + p.listingsYear;
  const fixedPer = fixedYear / p.ceremonies;
  const netPer = c.revenue - c.direct - fixedPer;
  const hourly = netPer / c.hours;
  const yearNet = netPer * p.ceremonies;
  const yearHours = c.hours * p.ceremonies;
  const contribution = c.revenue - c.direct;
  const breakEvenCeremonies = contribution > 0 ? Math.ceil(fixedYear / contribution) : null;
  // Fee that reaches the target hourly pay at the stated volume: revenue needed = target x hours + direct + fixed share,
  // less the extras already collected on top of the base fee.
  const minFee = p.targetHourly > 0 ? round2(p.targetHourly * c.hours + c.direct + fixedPer - (c.revenue - p.fee)) : null;
  const feeSteps = [...new Set([p.fee * 0.75, p.fee, p.fee * 1.25, p.fee * 1.5, p.fee * 2].map((f) => Math.round(f)))].sort((a, b) => a - b);
  const scenarios = feeSteps.map((f) => {
    const s = perCeremony(p, f);
    const net = s.revenue - s.direct - fixedPer;
    return { fee: f, netPer: round2(net), hourly: round2(net / s.hours), yearNet: round2(net * p.ceremonies) };
  });
  const findings = [];
  if (p.targetHourly > 0 && hourly < p.targetHourly) findings.push({ severity: "high", title: `Real pay is ${dollars(hourly)} an hour against your ${dollars(p.targetHourly)} target. At ${p.ceremonies} ceremonies a year the fee that reaches the target is about ${dollars(minFee)}.` });
  else if (p.targetHourly > 0) findings.push({ severity: "info", title: `Real pay is ${dollars(hourly)} an hour, above your ${dollars(p.targetHourly)} target.` });
  findings.push({ severity: "info", title: `The ${dollars(p.fee)} fee covers ${c.hours.toFixed(1)} hours of work per ceremony, not the ${p.ceremonyHours} hour at the altar: ${dollars(c.revenue / c.hours)} an hour before costs.` });
  const unseen = p.consultHours + p.scriptHours;
  if (unseen > 2 * p.ceremonyHours) findings.push({ severity: "medium", title: `Consultation and script writing take ${unseen.toFixed(1)} hours, more than twice the ceremony itself. Reusing a base script or batching consultations is where hourly pay is gained.` });
  if (p.miles > 0 && c.drive > 0.1 * p.fee && p.travelFee === 0) findings.push({ severity: "medium", title: `Driving costs ${dollars(c.drive)} a ceremony (${((c.drive / p.fee) * 100).toFixed(0)}% of the fee) and you charge no travel fee. A travel fee past a set distance passes that cost on.` });
  if (fixedPer > 0.15 * p.fee) findings.push({ severity: "medium", title: `Fixed yearly costs add ${dollars(fixedPer)} to every ceremony at this volume. They are paid off after ${breakEvenCeremonies} ceremonies.` });
  if (breakEvenCeremonies !== null) findings.push({ severity: "info", title: `You need ${breakEvenCeremonies} ceremonies a year just to cover ${dollars(fixedYear)} of fixed costs.` });
  return { errors: [], input: p, hours: round2(c.hours), revenue: round2(c.revenue), direct: round2(c.direct), fixedPer: round2(fixedPer), fixedYear: round2(fixedYear), netPer: round2(netPer), hourly: round2(hourly), yearNet: round2(yearNet), yearHours: round2(yearHours), breakEvenCeremonies, minFee, scenarios, findings };
}

export function summaryText(r) {
  const p = r.input;
  return [
    `Wedding officiant: ${dollars(p.fee)} fee, ${p.ceremonies} ceremonies a year, ${r.hours.toFixed(1)} hours of work per ceremony`,
    `Per ceremony: revenue ${dollars(r.revenue)} - direct costs ${dollars(r.direct)} - fixed share ${dollars(r.fixedPer)} = ${dollars(r.netPer)} net`,
    `Real hourly pay: ${dollars(r.hourly)}; yearly net: ${dollars(r.yearNet)} for ${r.yearHours.toFixed(0)} hours`,
    r.minFee === null ? "Target hourly pay: not entered" : `Fee for your target hourly pay: ${dollars(r.minFee)}`,
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function scenariosCsv(r) {
  return ["fee,net_per_ceremony,hourly_pay,yearly_net", ...r.scenarios.map((x) => `${x.fee},${x.netPer.toFixed(2)},${x.hourly.toFixed(2)},${x.yearNet.toFixed(2)}`)].join("\n");
}
