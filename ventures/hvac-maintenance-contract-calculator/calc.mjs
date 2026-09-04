function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

export function calculatePlan(input) {
  const visitsPerYear = number(input.visitsPerYear ?? 0, 'Preventive visits per year', { allowZero: false });
  const laborHoursPerVisit = number(input.laborHoursPerVisit ?? 0, 'Labor hours per visit', { allowZero: false });
  const loadedHourlyRate = number(input.loadedHourlyRate ?? 0, 'Loaded technician cost per hour', { allowZero: false });
  const travelCostPerVisit = number(input.travelCostPerVisit ?? 0, 'Travel cost per visit');
  const partsReservePerVisit = number(input.partsReservePerVisit ?? 0, 'Parts reserve per visit');
  const callbackVisitsPerYear = number(input.callbackVisitsPerYear ?? 0, 'Callback visits per year');
  const callbackHours = number(input.callbackHours ?? 0, 'Labor hours per callback');
  const callbackCostPerVisit = number(input.callbackCostPerVisit ?? 0, 'Callback non-labor cost');
  const annualOverhead = number(input.annualOverhead ?? 0, 'Annual overhead allocation');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const scheduledLabor = visitsPerYear * laborHoursPerVisit * loadedHourlyRate;
  const scheduledOther = visitsPerYear * (travelCostPerVisit + partsReservePerVisit);
  const callbackLabor = callbackVisitsPerYear * callbackHours * loadedHourlyRate;
  const callbackOther = callbackVisitsPerYear * callbackCostPerVisit;
  const annualCost = scheduledLabor + scheduledOther + callbackLabor + callbackOther + annualOverhead;
  const annualPrice = annualCost / (1 - targetMargin / 100);
  const monthlyPrice = annualPrice / 12;
  const annualProfit = annualPrice - annualCost;
  const totalTechnicianHours = visitsPerYear * laborHoursPerVisit + callbackVisitsPerYear * callbackHours;
  const proposedPrice = input.proposedMonthlyPrice === '' || input.proposedMonthlyPrice == null
    ? null : number(input.proposedMonthlyPrice, 'Monthly price being considered');
  return {
    visitsPerYear, callbackVisitsPerYear, scheduledLabor, scheduledOther,
    callbackLabor, callbackOther, annualOverhead, annualCost, annualPrice,
    monthlyPrice, annualProfit, totalTechnicianHours,
    breakEvenMonthlyPrice: annualCost / 12,
    effectiveHourlyRevenue: totalTechnicianHours === 0 ? null : annualPrice / totalTechnicianHours,
    proposed: proposedPrice == null ? null : {
      monthlyPrice: proposedPrice,
      annualRevenue: proposedPrice * 12,
      annualProfit: proposedPrice * 12 - annualCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice * 12 - annualCost) / (proposedPrice * 12) * 100,
      belowBreakEven: proposedPrice < annualCost / 12,
    },
  };
}

export function formatPlanSummary(result) {
  const money = (value) => {
    const format = (value) => `$${value.toFixed(2)}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const proposed = result.proposed ? `\nPrice considered: ${money(result.proposed.monthlyPrice)}/month (${result.proposed.belowBreakEven ? 'below break-even' : `${result.proposed.margin.toFixed(1)}% margin`})` : '';
  return `HVAC maintenance agreement\nPrice at target margin: ${money(result.monthlyPrice)}/month (${money(result.annualPrice)}/year)\nBreak-even floor: ${money(result.breakEvenMonthlyPrice)}/month\nTechnician hours reserved: ${result.totalTechnicianHours.toFixed(1)}/year\nEffective revenue per technician hour: ${money(result.effectiveHourlyRevenue)}${proposed}`;
}
