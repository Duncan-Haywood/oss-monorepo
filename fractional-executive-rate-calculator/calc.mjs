// Day rate, monthly retainer and capacity for a fractional executive (CFO, CMO,
// CTO, COO, CPO...). Pure functions, no dependencies. Every figure is arithmetic
// on numbers the consultant types.

const nn = (x) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : 0);
const r2 = (x) => Math.round(x * 100) / 100;

export const money = (x) =>
  (x < 0 ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
export const pct = (x) => (x === null || !Number.isFinite(x) ? "n/a" : (x * 100).toFixed(1) + "%");

// One client per line: name, days per month. Comma or tab separated.
// Bad lines are reported rather than silently dropped.
export function parseClients(text) {
  const rows = [];
  const bad = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\t|,/).map((s) => s.trim());
    if (/^(client|name)$/i.test(parts[0])) continue;
    const days = Number(String(parts[1] ?? "").replace(/[\s]/g, ""));
    if (!parts[0] || parts.length < 2 || !Number.isFinite(days) || days <= 0) {
      bad.push(line);
      continue;
    }
    rows.push({ name: parts[0], daysPerMonth: days });
  }
  return { rows, bad };
}

// Convert a full-time package into the rate that replaces it.
//   needed = takeHome + replaced benefits + business costs, then grossed up
//   for the employer half of payroll tax a consultant now pays (seTaxPct, as a
//   share of revenue). Billable days = working days less time off, less the
//   share spent on admin and finding work, times the share actually sold.
export function rateFor(i) {
  const takeHome = nn(i.salary) + nn(i.bonus);
  const benefits = nn(i.benefits);
  const costs = nn(i.businessCosts);
  const se = Math.min(nn(i.seTaxPct), 50) / 100;
  const revenueNeeded = (takeHome + benefits + costs) / (1 - se);
  const workingDays = nn(i.workingDays) || 260;
  const timeOff = nn(i.timeOffDays);
  const available = Math.max(workingDays - timeOff, 0);
  const nonBillable = Math.min(nn(i.nonBillablePct), 90) / 100;
  const capacityDays = available * (1 - nonBillable);
  const sold = Math.min(nn(i.soldPct) || 100, 100) / 100;
  const soldDays = capacityDays * sold;
  const dayRate = soldDays > 0 ? revenueNeeded / soldDays : null;
  const hoursPerDay = nn(i.hoursPerDay) || 8;
  return {
    takeHome, benefits, costs, revenueNeeded: r2(revenueNeeded),
    available, capacityDays: r2(capacityDays), soldDays: r2(soldDays),
    dayRate: dayRate === null ? null : r2(dayRate),
    hourlyRate: dayRate === null ? null : r2(dayRate / hoursPerDay),
    capacityPerMonth: r2(capacityDays / 12),
    soldPerMonth: r2(soldDays / 12),
    // A full-time employee is paid for ~260 days; the day rate as a multiple of
    // that employee's daily pay is the figure fractional pricing is argued in.
    fteDayPay: nn(i.salary) > 0 ? r2(nn(i.salary) / workingDays) : null,
    multiple: nn(i.salary) > 0 && dayRate !== null ? dayRate / (nn(i.salary) / workingDays) : null,
  };
}

export function retainerFor(dayRate, days, discountPct) {
  const list = dayRate * days;
  const price = list * (1 - Math.min(nn(discountPct), 90) / 100);
  return { days, list: r2(list), price: r2(price), effectiveDayRate: days > 0 ? r2(price / days) : 0 };
}

export function analyse(input) {
  const findings = [];
  const parsed = parseClients(input.clientText);
  if (parsed.bad.length) {
    findings.push({ severity: "high", title: "Some lines were not read",
      detail: `Ignored: ${parsed.bad.join(" | ")}. Use client name, days per month, with days above zero.` });
  }
  const rate = rateFor(input);
  if (nn(input.salary) + nn(input.bonus) <= 0) {
    findings.push({ severity: "high", title: "Enter the full-time pay you want to replace",
      detail: "Base salary (and bonus) of the role you are matching. Take-home target is built from these." });
    return { result: null, findings, bad: parsed.bad };
  }
  if (rate.dayRate === null) {
    findings.push({ severity: "high", title: "No billable days left",
      detail: "Time off, non-billable share and sold share leave zero days to price against." });
    return { result: null, findings, bad: parsed.bad };
  }
  const discount = nn(input.retainerDiscountPct);
  const retainers = [2, 4, 6, 8, 10].map((d) => retainerFor(rate.dayRate, d, discount));
  const clients = parsed.rows.map((c) => {
    const r = retainerFor(rate.dayRate, c.daysPerMonth, discount);
    return { ...c, monthly: r.price, annual: r2(r.price * 12), effectiveDayRate: r.effectiveDayRate };
  });
  const bookedDays = clients.reduce((s, c) => s + c.daysPerMonth, 0);
  const monthlyRevenue = r2(clients.reduce((s, c) => s + c.monthly, 0));
  const annualRevenue = r2(monthlyRevenue * 12);
  const grossUp = 1 - Math.min(nn(input.seTaxPct), 50) / 100;
  const netEquivalent = r2(annualRevenue * grossUp - rate.benefits - rate.costs);
  const result = {
    rate, retainers, clients, bookedDays, monthlyRevenue, annualRevenue, netEquivalent,
    capacityUse: rate.capacityPerMonth > 0 ? bookedDays / rate.capacityPerMonth : null,
    gap: r2(rate.takeHome - netEquivalent),
    discount,
  };

  findings.push({ severity: "info", title: "Your day rate",
    detail: `To replace ${money(rate.takeHome)} of take-home plus ${money(rate.benefits)} of benefits and ${money(rate.costs)} of business costs you need ${money(rate.revenueNeeded)} of revenue, spread over ${rate.soldDays.toFixed(0)} sold days: ${money(rate.dayRate)} a day, ${money(rate.hourlyRate)} an hour.` });
  if (rate.multiple !== null) {
    findings.push({ severity: rate.multiple < 1.5 ? "medium" : "info", title: `That is ${rate.multiple.toFixed(1)}x the employee's daily pay`,
      detail: `A full-time hire at that salary is paid ${money(rate.fteDayPay)} a day. Fractional work carries unsold days, admin, benefits and tax the employer used to carry, so a multiple under about 1.5x usually means the rate is not covering them.` });
  }
  if (discount > 0) {
    findings.push({ severity: "info", title: "Retainer discount is counted",
      detail: `Retainer prices below take ${discount}% off the day rate. The discount lowers the effective rate, so booked revenue is lower than days times the day rate. Consider whether the committed months are worth it.` });
  }
  if (clients.length) {
    if (result.capacityUse > 1) {
      findings.push({ severity: "high", title: "Booked days exceed your capacity",
        detail: `Your clients need ${bookedDays} days a month against ${rate.capacityPerMonth.toFixed(1)} billable days of capacity.` });
    }
    if (result.gap > 0) {
      findings.push({ severity: "high", title: "This client mix does not replace your target",
        detail: `${money(annualRevenue)} of retainers leaves ${money(netEquivalent)} after tax load, benefits and costs: ${money(result.gap)} short of ${money(rate.takeHome)}. Add days or raise the rate.` });
    } else {
      findings.push({ severity: "info", title: "This client mix meets your target",
        detail: `${money(annualRevenue)} of retainers leaves ${money(netEquivalent)}, ${money(-result.gap)} above ${money(rate.takeHome)}.` });
    }
    const top = [...clients].sort((a, b) => b.monthly - a.monthly)[0];
    if (clients.length > 1 && monthlyRevenue > 0 && top.monthly / monthlyRevenue > 0.5) {
      findings.push({ severity: "medium", title: `${top.name} is over half of revenue`,
        detail: `${pct(top.monthly / monthlyRevenue)} of monthly revenue. Losing that retainer is the one event that breaks the plan.` });
    }
  }
  findings.push({ severity: "info", title: "Modelling choices",
    detail: "Revenue needed = (take-home + benefits you now buy yourself + business costs) divided by (1 minus the payroll-tax share you now pay). Sold days = working days less time off, less non-billable time, times the share you expect to sell. Income tax, equity upside, sick leave and slow collection are not modelled." });
  return { result, findings, bad: parsed.bad };
}
