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
  // Labeled "Bucket or job size" on the page -- keep the error naming the
  // field a visitor actually sees, not the recipe-scale concept behind it.
  const batchGallons = positive(input.batchGallons ?? 1, 'Bucket or job size');
  const wasteRate = positive(input.wasteRate ?? 0, 'Waste allowance', true);
  if (wasteRate >= 100) throw new Error('Waste allowance must be less than 100%');
  const laborMinutes = positive(input.laborMinutes ?? 0, 'Mixing labor', true);
  const laborRate = positive(input.laborRate ?? 0, 'Labor rate', true);
  const concentrateCostPerOz = containerCost / containerOz;
  const chemicalCost = concentrateOz * concentrateCostPerOz;
  const laborCost = laborMinutes / 60 * laborRate;
  const batchCost = (chemicalCost + laborCost) / (1 - wasteRate / 100);
  const costPerGallon = batchCost / waterGallons;
  // One batch of `concentrateOz` mixed into `waterGallons` of water only
  // yields that many *usable* gallons after waste -- the same (1 - waste%)
  // divide `batchCost` already applies. Buying concentrate is a whole-batch
  // question, not a continuous one: a job needing 5.2 batches' worth of
  // usable gallons still needs the concentrate for 6, and that concentrate
  // still only comes in whole containers. Reporting only the smooth
  // cost-per-gallon rate hides both roundings from an operator writing a
  // purchase order or a bid that has to actually be filled.
  const usableGallonsPerBatch = waterGallons * (1 - wasteRate / 100);
  const concentrateOzPerUsableGallon = concentrateOz / usableGallonsPerBatch;
  const concentrateNeededOz = concentrateOzPerUsableGallon * batchGallons;
  const containersNeeded = Math.ceil(concentrateNeededOz / containerOz);
  const containerPurchaseCost = containersNeeded * containerCost;
  return {
    concentrateCostPerOz,
    chemicalCost,
    laborCost,
    batchCost,
    costPerGallon,
    costPerBucket: costPerGallon * batchGallons,
    readyToUseGallons: waterGallons,
    wasteAllowanceCost: batchCost - chemicalCost - laborCost,
    concentrateNeededOz,
    containersNeeded,
    containerPurchaseCost,
    leftoverConcentrateOz: containersNeeded * containerOz - concentrateNeededOz,
  };
}
