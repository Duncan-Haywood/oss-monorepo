function positive(value, label, allowZero = false) {
  const n = Number(value);
  if (!Number.isFinite(n) || (allowZero ? n < 0 : n <= 0)) {
    throw new Error(`${label} must be ${allowZero ? 'zero or greater' : 'greater than zero'}`);
  }
  return n;
}

export function calculateDilution(input) {
  const concentrateOz = positive(input.concentrateOz, 'Concentrate volume');
  const waterGallons = positive(input.waterGallons, 'Water volume');
  const containerCost = positive(input.containerCost, 'Container cost', true);
  const containerOz = positive(input.containerOz, 'Container size');
  const batchGallons = positive(input.batchGallons ?? 1, 'Batch size');
  const wasteRate = positive(input.wasteRate ?? 0, 'Waste allowance', true);
  if (wasteRate >= 100) throw new Error('Waste allowance must be less than 100%');
  const laborMinutes = positive(input.laborMinutes ?? 0, 'Mixing labor', true);
  const laborRate = positive(input.laborRate ?? 0, 'Labor rate', true);
  const concentrateCostPerOz = containerCost / containerOz;
  const chemicalCost = concentrateOz * concentrateCostPerOz;
  const laborCost = laborMinutes / 60 * laborRate;
  const batchCost = (chemicalCost + laborCost) / (1 - wasteRate / 100);
  const costPerGallon = batchCost / waterGallons;
  return {
    concentrateCostPerOz,
    chemicalCost,
    laborCost,
    batchCost,
    costPerGallon,
    costPerBucket: costPerGallon * batchGallons,
    readyToUseGallons: waterGallons,
    wasteAllowanceCost: batchCost - chemicalCost - laborCost,
  };
}
