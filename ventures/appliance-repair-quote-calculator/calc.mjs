const required = ['diagnosticHours', 'repairHours', 'travelHours', 'laborRate', 'tripCost', 'partsCost', 'partsMarkup', 'callbackReserve', 'overheadRate', 'targetMargin'];

function number(input, name) {
  const value = Number(input[name]);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be zero or greater`);
  return value;
}

export function calculateQuote(input) {
  for (const name of required) number(input, name);
  const laborHours = number(input, 'diagnosticHours') + number(input, 'repairHours') + number(input, 'travelHours');
  const labor = laborHours * number(input, 'laborRate');
  const parts = number(input, 'partsCost') * (1 + number(input, 'partsMarkup') / 100);
  const callback = (labor + parts + number(input, 'tripCost')) * number(input, 'callbackReserve') / 100;
  const direct = labor + parts + number(input, 'tripCost') + callback;
  const overhead = direct * number(input, 'overheadRate') / 100;
  const cost = direct + overhead;
  const margin = Math.min(99.9, number(input, 'targetMargin'));
  const target = cost / (1 - margin / 100);
  return { laborHours, labor, parts, callback, overhead, cost, target, walkAway: cost, effectiveRate: target / Math.max(laborHours, 0.01), margin };
}

export function priceAt(input, price) {
  const result = calculateQuote(input);
  const value = Number(price);
  if (!Number.isFinite(value) || value < 0) throw new Error('price must be zero or greater');
  return { price: value, profit: value - result.cost, margin: value ? ((value - result.cost) / value) * 100 : -Infinity };
}

function positive(input, name) {
  const value = Number(input[name]);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be greater than zero`);
  return value;
}

function money(value) {
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

/**
 * Finish this service-call repair versus recommending a replacement.
 * Distinct from the boiler bid's winters-of-patches model: here the unit is
 * one quoted repair against the customer's remaining years on that machine
 * versus years on a replacement, plus what you keep if they decline.
 */
export function compareServiceCallVsReplace(quoteInput, replaceInput = {}) {
  const quote = calculateQuote(quoteInput);
  const replacementPrice = number(replaceInput, 'replacementPrice');
  const remainingRepairYears = positive(replaceInput, 'remainingRepairYears');
  const remainingReplaceYears = positive(replaceInput, 'remainingReplaceYears');
  const diagnosticCollected = number(replaceInput, 'diagnosticCollected');
  const yourReplaceProfit = number(replaceInput, 'yourReplaceProfit');

  const customerRepairPerYear = quote.target / remainingRepairYears;
  const customerReplacePerYear = replacementPrice / remainingReplaceYears;
  const yourProfitIfRepair = quote.target - quote.cost;
  const yourProfitIfReplace = diagnosticCollected + yourReplaceProfit;
  const customerGapPerYear = customerRepairPerYear - customerReplacePerYear;
  const yourGap = yourProfitIfRepair - yourProfitIfReplace;
  const customerBetter = customerRepairPerYear <= customerReplacePerYear ? 'repair' : 'replace';
  const youKeepMore = yourProfitIfRepair >= yourProfitIfReplace ? 'repair' : 'replace';

  return {
    quote,
    replacementPrice,
    remainingRepairYears,
    remainingReplaceYears,
    diagnosticCollected,
    yourReplaceProfit,
    customerRepairPerYear,
    customerReplacePerYear,
    customerGapPerYear,
    yourProfitIfRepair,
    yourProfitIfReplace,
    yourGap,
    customerBetter,
    youKeepMore,
    agree: customerBetter === youKeepMore,
    // Years the repaired unit must last before its $/year matches replace.
    repairYearsToMatchReplace: customerReplacePerYear > 0
      ? quote.target / customerReplacePerYear
      : Infinity,
  };
}

export function serviceCallVsReplaceNote(comparison) {
  if (!comparison || !comparison.customerBetter || !comparison.youKeepMore) {
    throw new Error('Service-call vs replace comparison is missing rows');
  }
  const customerLine = comparison.customerBetter === 'repair'
    ? `Repair is ${money(Math.abs(comparison.customerGapPerYear))} / year cheaper for the customer (${money(comparison.customerRepairPerYear)} vs ${money(comparison.customerReplacePerYear)}).`
    : `Replace is ${money(Math.abs(comparison.customerGapPerYear))} / year cheaper for the customer (${money(comparison.customerReplacePerYear)} vs ${money(comparison.customerRepairPerYear)}).`;
  const yourLine = comparison.youKeepMore === 'repair'
    ? `Finishing the repair still leaves you ${money(Math.abs(comparison.yourGap))} more (${money(comparison.yourProfitIfRepair)} vs ${money(comparison.yourProfitIfReplace)}).`
    : `Walking with the diagnostic plus a replacement leaves you ${money(Math.abs(comparison.yourGap))} more (${money(comparison.yourProfitIfReplace)} vs ${money(comparison.yourProfitIfRepair)}).`;
  if (comparison.agree && comparison.customerBetter === 'replace') {
    return `${customerLine} ${yourLine} Recommend replace on these numbers.`;
  }
  if (comparison.agree && comparison.customerBetter === 'repair') {
    return `${customerLine} ${yourLine} The repair still beats replace for both of you.`;
  }
  if (comparison.customerBetter === 'replace') {
    return `${customerLine} ${yourLine} The honest tension: the customer pays more per remaining year if you finish this repair.`;
  }
  return `${customerLine} ${yourLine} The honest tension: you keep more walking, but the customer keeps more finishing the repair.`;
}
