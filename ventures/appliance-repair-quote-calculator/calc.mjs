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
