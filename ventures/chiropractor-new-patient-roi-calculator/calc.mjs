// New-patient economics for a chiropractic, physical therapy or similar
// cash/insurance clinic. Pure functions, no dependencies. Every figure is
// arithmetic on numbers the owner types.

const nn = (x) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : 0);

export const money = (x) =>
  (x < 0 ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
export const pct = (x) => (x === null || !Number.isFinite(x) ? "n/a" : (x * 100).toFixed(1) + "%");

// One patient segment per line: name, share of new patients (%), visits over
// the episode, collected per visit, cost per visit. Comma or tab separated.
// Bad lines are reported rather than silently dropped.
export function parseSegments(text) {
  const rows = [];
  const bad = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\t|,/).map((s) => s.trim());
    if (/^name$/i.test(parts[0])) continue;
    const [name, share, visits, collected, cost] = parts;
    const nums = [share, visits, collected, cost === undefined || cost === "" ? "0" : cost].map((s) =>
      Number(String(s ?? "").replace(/[$%\s]/g, "")));
    if (!name || parts.length < 4 || nums.some((n) => !Number.isFinite(n) || n < 0) || nums[0] <= 0 || nums[1] <= 0) {
      bad.push(line);
      continue;
    }
    rows.push({ name, share: nums[0], visits: nums[1], collected: nums[2], cost: nums[3] });
  }
  return { rows, bad };
}

// Value of one new patient who walks in, by segment and blended.
export function segmentValue(seg, newPatientExtra = 0) {
  const revenue = seg.visits * seg.collected + nn(newPatientExtra);
  const cost = seg.visits * seg.cost;
  return { revenue, cost, margin: revenue - cost };
}

export function analyse(input) {
  const { segments: text, spend, leads, bookedPct, showPct, newPatientExtra, targetRoi, fixedPerMonth } = input;
  const { rows, bad } = parseSegments(text);
  const findings = [];
  if (bad.length) {
    findings.push({ severity: "medium", title: `${bad.length} line${bad.length > 1 ? "s" : ""} could not be read`,
      detail: `Each line needs a name, a share, visits, and collected per visit: ${bad.slice(0, 3).join(" | ")}` });
  }
  if (!rows.length) {
    findings.push({ severity: "high", title: "No patient segments",
      detail: "Add at least one line such as: Cash care plan, 60, 24, 55, 18" });
    return { result: null, findings };
  }
  const totalShare = rows.reduce((s, r) => s + r.share, 0);
  const segs = rows.map((r) => {
    const w = r.share / totalShare;
    return { ...r, weight: w, ...segmentValue(r, newPatientExtra) };
  });
  const blended = {
    revenue: segs.reduce((s, r) => s + r.weight * r.revenue, 0),
    cost: segs.reduce((s, r) => s + r.weight * r.cost, 0),
    visits: segs.reduce((s, r) => s + r.weight * r.visits, 0),
  };
  blended.margin = blended.revenue - blended.cost;

  const booked = nn(bookedPct) / 100;
  const shows = nn(showPct) / 100;
  const L = nn(leads);
  const S = nn(spend);
  const newPatients = L * booked * shows;
  const cac = newPatients > 0 ? S / newPatients : null;
  const costPerLead = L > 0 ? S / L : null;
  const roi = cac !== null && cac > 0 ? (blended.margin - cac) / cac : null;
  const monthlyMargin = newPatients * blended.margin;
  const monthlyProfit = monthlyMargin - S - nn(fixedPerMonth);
  const target = nn(targetRoi) / 100;
  // Highest acquisition cost that still earns the target return on each patient.
  const maxCac = blended.margin / (1 + target);
  const funnel = booked * shows;
  const maxCostPerLead = maxCac * funnel;
  // Visits needed before a patient's margin covers what it cost to win them.
  const marginPerVisit = blended.visits > 0 ? blended.margin / blended.visits : 0;
  const paybackVisits = cac !== null && marginPerVisit > 0 ? cac / marginPerVisit : null;

  const result = { segs, blended, newPatients, cac, costPerLead, roi, monthlyMargin, monthlyProfit,
    maxCac, maxCostPerLead, paybackVisits, marginPerVisit, spend: S, fixed: nn(fixedPerMonth), funnel };

  if (blended.margin <= 0) {
    findings.push({ severity: "high", title: "Patients lose money before marketing",
      detail: "The blended margin per patient is zero or negative. Cost per visit exceeds what you collect, so more patients makes it worse." });
  } else if (cac !== null && cac > blended.margin) {
    findings.push({ severity: "high", title: "Each new patient costs more to win than they return",
      detail: `Acquisition cost ${money(cac)} against ${money(blended.margin)} of margin per patient. The ceiling at your target return is ${money(maxCac)}.` });
  } else if (cac !== null && cac > maxCac) {
    findings.push({ severity: "medium", title: "Positive, but below your target return",
      detail: `Acquisition cost ${money(cac)} is above the ${money(maxCac)} ceiling for a ${nn(targetRoi)}% return. Spend per lead would need to fall to ${money(maxCostPerLead)}.` });
  }
  const weakest = [...segs].sort((a, b) => a.margin / a.visits - b.margin / b.visits)[0];
  if (segs.length > 1 && weakest.margin / weakest.visits < 0.4 * marginPerVisit) {
    findings.push({ severity: "info", title: `${weakest.name} earns the least per visit`,
      detail: `${money(weakest.margin / weakest.visits)} of margin per visit against ${money(marginPerVisit)} blended. Check whether the visit count or the collected amount is the lever.` });
  }
  if (showPct !== undefined && nn(showPct) > 0 && nn(showPct) < 70) {
    findings.push({ severity: "info", title: "Show rate is low",
      detail: "Raising show rate costs no extra spend: every booked patient who attends lowers acquisition cost." });
  }
  return { result, findings };
}
