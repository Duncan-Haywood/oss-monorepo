// Flat-fee pricing for freelance grant writers. Pure functions, no dependencies.
// Every figure is arithmetic on numbers the writer types. There is deliberately
// no "percentage of the award" price: that is shown only as a check on a flat fee.

const nn = (x) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : 0);
const r2 = (x) => Math.round(x * 100) / 100;

export const money = (x) =>
  (x < 0 ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
export const pct = (x) => (x === null || !Number.isFinite(x) ? "n/a" : (x * 100).toFixed(1) + "%");

// One proposal per line: name, estimated hours, fee quoted (optional), award requested (optional).
// Comma or tab separated. Bad lines are reported rather than silently dropped.
export function parseProposals(text) {
  const rows = [];
  const bad = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\t|,/).map((s) => s.trim());
    if (/^(proposal|name|funder)$/i.test(parts[0])) continue;
    const clean = (s) => (s === undefined || s === "" ? null : Number(String(s).replace(/[$\s]/g, "")));
    const hours = clean(parts[1]);
    const quoted = clean(parts[2]);
    const award = clean(parts[3]);
    const badNum = (v) => v !== null && (!Number.isFinite(v) || v < 0);
    if (!parts[0] || !Number.isFinite(hours) || hours <= 0 || badNum(quoted) || badNum(award)) {
      bad.push(line);
      continue;
    }
    rows.push({ name: parts[0], hours, quoted: quoted || null, award: award || null });
  }
  return { rows, bad };
}

// The hourly rate a flat fee has to be built on.
//   target = what you want to take home per billable hour. Billable hours are
//   a share of paid hours (the rest is finding clients, admin, learning a
//   funder's portal), and a payroll/self-employment tax share comes off revenue.
export function hourlyFloor(i) {
  const target = nn(i.targetHourly);
  const billable = Math.min(nn(i.billablePct) || 100, 100) / 100;
  const se = Math.min(nn(i.seTaxPct), 50) / 100;
  const overhead = nn(i.overheadPerHour);
  if (target <= 0) return null;
  return r2((target / billable + overhead) / (1 - se));
}

export function priceFor(hours, floor, bufferPct) {
  const padded = hours * (1 + Math.min(nn(bufferPct), 200) / 100);
  return { paddedHours: r2(padded), fee: r2(padded * floor) };
}

export function analyse(input) {
  const findings = [];
  const parsed = parseProposals(input.proposalText);
  if (parsed.bad.length) {
    findings.push({ severity: "high", title: "Some lines were not read",
      detail: `Ignored: ${parsed.bad.join(" | ")}. Use proposal name, hours above zero, then optional fee and award requested as plain numbers.` });
  }
  const floor = hourlyFloor(input);
  if (floor === null) {
    findings.push({ severity: "high", title: "Enter the hourly pay you want",
      detail: "Your target take-home per hour of billable work. The fee floor is built from it." });
    return { result: null, findings, bad: parsed.bad };
  }
  const buffer = nn(input.bufferPct);
  const rows = parsed.rows.map((p) => {
    const price = priceFor(p.hours, floor, buffer);
    const out = { ...p, ...price };
    if (p.quoted) {
      out.effectiveHourly = r2(p.quoted / p.hours);
      // Take-home per hour implied by the quoted fee, undoing the same adjustments.
      const se = Math.min(nn(input.seTaxPct), 50) / 100;
      const billable = Math.min(nn(input.billablePct) || 100, 100) / 100;
      out.takeHomeHourly = r2(((p.quoted * (1 - se)) / p.hours - nn(input.overheadPerHour)) * billable);
      out.gap = r2(price.fee - p.quoted);
    }
    out.feeShareOfAward = p.award ? (p.quoted || price.fee) / p.award : null;
    return out;
  });

  const totalHours = rows.reduce((s, r) => s + r.hours, 0);
  const totalFee = r2(rows.reduce((s, r) => s + r.fee, 0));
  const quotedRows = rows.filter((r) => r.quoted);
  const underpriced = quotedRows.filter((r) => r.gap > 0);
  const capacityHours = nn(input.monthlyHours);
  const result = { floor, buffer, rows, totalHours, totalFee, underpriced, capacityHours,
    capacityUse: capacityHours > 0 ? totalHours / capacityHours : null };

  findings.push({ severity: "info", title: "Your fee floor",
    detail: `To take home ${money(nn(input.targetHourly))} per billable hour with ${pct(1 - (Math.min(nn(input.billablePct) || 100, 100) / 100))} of paid time unbillable, ${money(nn(input.overheadPerHour))} an hour of software and insurance and ${nn(input.seTaxPct)}% tax load, you have to invoice ${money(floor)} per hour of estimated writing time.` });
  if (buffer > 0) {
    findings.push({ severity: "info", title: "Revision buffer is priced in",
      detail: `Each estimate is padded ${buffer}% for funder questions, new budget templates and the rounds of client edits that every proposal collects.` });
  }
  if (parsed.rows.length) {
    if (underpriced.length) {
      const worst = [...underpriced].sort((a, b) => b.gap - a.gap)[0];
      findings.push({ severity: "high", title: `${underpriced.length} quoted fee${underpriced.length > 1 ? "s are" : " is"} below your floor`,
        detail: `Largest shortfall: ${worst.name}, quoted ${money(worst.quoted)} for ${worst.hours} hours (${money(worst.effectiveHourly)} an hour) against a floor fee of ${money(worst.fee)}.` });
    } else if (quotedRows.length) {
      findings.push({ severity: "info", title: "Every quoted fee clears the floor",
        detail: "Each fee you entered is at or above the floor price for its estimated hours." });
    }
    const pctRows = rows.filter((r) => r.feeShareOfAward !== null);
    for (const r of pctRows) {
      if (r.feeShareOfAward > 0.1) {
        findings.push({ severity: "medium", title: `${r.name}: fee is ${pct(r.feeShareOfAward)} of the award requested`,
          detail: "A flat fee that is a large share of a small ask can look out of proportion to the client. Check the funder allows grant-writing costs, and price on hours of work either way." });
      }
    }
    if (result.capacityUse !== null && result.capacityUse > 1) {
      findings.push({ severity: "high", title: "These proposals exceed your month",
        detail: `${totalHours} estimated hours (${r2(totalHours * (1 + buffer / 100))} with the buffer) against ${capacityHours} billable hours of capacity.` });
    }
  }
  findings.push({ severity: "info", title: "Why a flat fee, not a share of the award",
    detail: "Professional codes for fundraisers and grant writers, and many funders, object to paying a writer a percentage of money raised. This tool prices on hours only; a percentage of the award is shown purely as a sense check." });
  findings.push({ severity: "info", title: "Modelling choices",
    detail: "Floor rate = (target take-home per billable hour divided by billable share, plus overhead per hour) divided by (1 minus tax load). Fee = estimated hours padded by the revision buffer times the floor rate. Win rate is not priced in: unfunded proposals still cost the same hours. Income tax, travel and reporting work after an award are not modelled." });
  return { result, findings, bad: parsed.bad };
}
