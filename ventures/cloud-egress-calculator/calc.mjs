// Pure object-storage and egress arithmetic. No network, no state.
// Rates are user-supplied from a current price sheet — never fetched,
// cached, or endorsed as a provider's live schedule.

function nonNegative(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return number;
}

function atMost(value, name, cap) {
  const number = nonNegative(value, name);
  if (number > cap) throw new Error(`${name} must be at most ${cap}`);
  return number;
}

function cents(value) {
  return Math.round(value * 100) / 100;
}

export function scenarioCost(input = {}) {
  const storageGb = nonNegative(input.storageGb, "Storage");
  const requestsMillion = nonNegative(input.requestsMillion ?? 0, "Requests");
  const egressGb = nonNegative(input.egressGb ?? 0, "Egress");
  const storageRate = nonNegative(input.storageRate ?? 0, "Storage rate");
  const requestRate = nonNegative(input.requestRate ?? 0, "Request rate");
  const egressRate = nonNegative(input.egressRate ?? 0, "Egress rate");
  const storage = cents(storageGb * storageRate);
  const requests = cents(requestsMillion * requestRate);
  const egress = cents(egressGb * egressRate);
  return {
    storage,
    requests,
    egress,
    egressRate,
    total: cents(storage + requests + egress),
  };
}

/**
 * Outbound GB where the two options bill the same.
 * firstFixed + e * r1 = secondFixed + e * r2
 * e = (secondFixed - firstFixed) / (r1 - r2)
 * Null when rates match or the crossing is not a positive volume.
 */
export function breakEvenEgressGb(first, second) {
  const rateDelta = first.egressRate - second.egressRate;
  if (rateDelta === 0) return null;
  const firstFixed = first.storage + first.requests;
  const secondFixed = second.storage + second.requests;
  const volume = (secondFixed - firstFixed) / rateDelta;
  if (!Number.isFinite(volume) || volume <= 0) return null;
  return volume;
}

export function compareScenarios(input = {}) {
  const first = scenarioCost(input.first);
  const second = scenarioCost(input.second);
  const difference = first.total - second.total;
  const expensiveTotal = Math.max(first.total, second.total);
  return {
    first,
    second,
    difference,
    cheaper: difference > 0 ? "second" : difference < 0 ? "first" : "tie",
    savings: cents(Math.abs(difference)),
    annualSavings: cents(Math.abs(difference) * 12),
    savingsPercentage: expensiveTotal === 0 ? 0 : (Math.abs(difference) / expensiveTotal) * 100,
    breakEvenEgressGb: breakEvenEgressGb(first, second),
  };
}

/**
 * Ticket-ready text for a migration review. Totals and the cheaper option
 * only — no stored-GB, request, or rate-sheet inputs, so a copied note
 * cannot leak a price sheet.
 */
export function decisionSummary(input = {}) {
  const firstName = input.first?.name || "Option A";
  const secondName = input.second?.name || "Option B";
  const result = compareScenarios({
    first: { ...input.first },
    second: { ...input.second },
  });
  const cheaperName = result.cheaper === "first" ? firstName : result.cheaper === "second" ? secondName : null;
  const lines = [
    "Cloud egress cost comparison",
    `${firstName}: $${result.first.total.toFixed(2)}/month`,
    `${secondName}: $${result.second.total.toFixed(2)}/month`,
  ];
  if (cheaperName) lines.push(`${cheaperName} is cheaper by $${result.savings.toFixed(2)}/month.`);
  else lines.push("Both options have the same monthly cost.");
  if (result.annualSavings) {
    lines.push(`Annual impact: $${result.annualSavings.toFixed(2)}.`);
  }
  lines.push("Review current provider price sheets before relying on this estimate.");
  return lines.join("\n");
}

export function reviewRecord(input = {}) {
  const workload = {
    storageGb: nonNegative(input.storageGb, "Storage"),
    requestsMillion: nonNegative(input.requestsMillion ?? 0, "Requests"),
    egressGb: nonNegative(input.egressGb ?? 0, "Egress"),
  };
  const comparison = compareScenarios({
    first: { ...workload, ...input.first },
    second: { ...workload, ...input.second },
  });
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    workload,
    options: [
      { name: input.first?.name || "Option A", storage: comparison.first.storage, requests: comparison.first.requests, egress: comparison.first.egress, total: comparison.first.total },
      { name: input.second?.name || "Option B", storage: comparison.second.storage, requests: comparison.second.requests, egress: comparison.second.egress, total: comparison.second.total },
    ],
    cheaper: comparison.cheaper,
    savings: comparison.savings,
    annualSavings: comparison.annualSavings,
    breakEvenEgressGb: comparison.breakEvenEgressGb,
  };
}

/**
 * Origin-only internet egress vs a CDN in front of the same object store.
 * Every user download still pays CDN egress. Misses also pay origin fetch
 * (bytes that leave the origin toward the CDN). Storage is the same on
 * both paths and is omitted so the table is only the transfer decision.
 */
export function compareCdn(input = {}) {
  const egressGb = nonNegative(input.egressGb ?? 0, "Outbound data");
  const hitRatePercent = atMost(input.hitRatePercent ?? 0, "Cache hit rate", 100);
  const originEgressRate = nonNegative(input.originEgressRate ?? 0, "Origin egress rate");
  const cdnEgressRate = nonNegative(input.cdnEgressRate ?? 0, "CDN egress rate");
  const originFetchRate = nonNegative(input.originFetchRate ?? originEgressRate, "Origin fetch rate");
  const cdnRequestRate = nonNegative(input.cdnRequestRate ?? 0, "CDN request rate");
  const requestsMillion = nonNegative(input.requestsMillion ?? 0, "Requests");

  const hitRate = hitRatePercent / 100;
  const missGb = egressGb * (1 - hitRate);

  const originOnly = {
    id: "origin",
    label: "Origin only",
    egress: cents(egressGb * originEgressRate),
    originFetch: 0,
    requests: 0,
    total: cents(egressGb * originEgressRate),
  };

  const withCdn = {
    id: "cdn",
    label: "With CDN",
    egress: cents(egressGb * cdnEgressRate),
    originFetch: cents(missGb * originFetchRate),
    requests: cents(requestsMillion * cdnRequestRate),
    total: 0,
  };
  withCdn.total = cents(withCdn.egress + withCdn.originFetch + withCdn.requests);

  const signed = originOnly.total - withCdn.total;
  const cheaper = signed > 0 ? "cdn" : signed < 0 ? "origin" : "tie";

  let hitRateFloorPercent = null;
  if (egressGb > 0 && originFetchRate > 0) {
    const fetchAtZeroHits = egressGb * originFetchRate;
    const floor = (withCdn.egress + fetchAtZeroHits + withCdn.requests - originOnly.total) / fetchAtZeroHits;
    if (Number.isFinite(floor)) {
      if (floor <= 0) hitRateFloorPercent = 0;
      else if (floor <= 1) hitRateFloorPercent = floor * 100;
    }
  }

  return {
    originOnly,
    withCdn,
    cheaper,
    savings: cents(Math.abs(signed)),
    cdnSaves: cents(signed),
    annualSavings: cents(Math.abs(signed) * 12),
    hitRatePercent,
    hitRateFloorPercent,
    missGb,
  };
}

function money(value) {
  const format = (value) => `$${value.toFixed(2)}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

export function cdnNote(result) {
  const hit = `${result.hitRatePercent.toFixed(1)}%`;
  if (result.cheaper === "tie") {
    return `At ${hit} cache hits both paths bill the same this month.`;
  }
  const winner = result.cheaper === "origin" ? "origin-only" : "the CDN path";
  let floorBit = "With these rates the CDN path does not match origin-only at any hit rate.";
  if (result.hitRateFloorPercent === 0) {
    floorBit = "The CDN path is already cheaper at 0% hits.";
  } else if (result.hitRateFloorPercent != null) {
    floorBit = `The CDN path matches origin-only at ${result.hitRateFloorPercent.toFixed(1)}% hits.`;
  }
  return `At ${hit} cache hits ${winner} is ${money(result.savings)} cheaper this month. ${floorBit}`;
}

/**
 * Keep pulling a dataset across regions every month vs copy it once
 * (seed) and pay replica storage plus incremental change-sync.
 * Internet/CDN egress is a different page; this one is only the
 * region-to-region transfer vs a second copy.
 */
export function compareReplica(input = {}) {
  const replicaGb = nonNegative(input.replicaGb, "Replica size");
  const pullGbPerMonth = nonNegative(input.pullGbPerMonth, "Monthly pull");
  const crossRegionRate = nonNegative(input.crossRegionRate, "Cross-region rate");
  const storageRate = nonNegative(input.storageRate, "Replica storage rate");
  const seedGb = nonNegative(input.seedGb ?? replicaGb, "Seed size");
  const seedRate = nonNegative(input.seedRate ?? crossRegionRate, "Seed rate");
  const changeGbPerMonth = nonNegative(input.changeGbPerMonth ?? 0, "Monthly change");
  const changeRate = nonNegative(input.changeRate ?? crossRegionRate, "Change rate");
  const horizonMonths = nonNegative(input.horizonMonths ?? 12, "Horizon");
  if (!Number.isInteger(horizonMonths) || horizonMonths < 1 || horizonMonths > 120) {
    throw new Error("Horizon must be an integer from 1 to 120");
  }

  const pullMonthly = cents(pullGbPerMonth * crossRegionRate);
  const pull = {
    id: "pull",
    label: "Keep pulling",
    seed: 0,
    storage: 0,
    change: 0,
    monthly: pullMonthly,
    total: pullMonthly,
    horizon: cents(pullMonthly * horizonMonths),
  };

  const replicaStorage = cents(replicaGb * storageRate);
  const replicaChange = cents(changeGbPerMonth * changeRate);
  const replicaMonthly = cents(replicaStorage + replicaChange);
  const replicaSeed = cents(seedGb * seedRate);
  const replica = {
    id: "replica",
    label: "Replicate once",
    seed: replicaSeed,
    storage: replicaStorage,
    change: replicaChange,
    monthly: replicaMonthly,
    total: replicaMonthly,
    horizon: cents(replicaSeed + replicaMonthly * horizonMonths),
  };

  const monthlySigned = cents(pull.monthly - replica.monthly);
  const horizonSigned = cents(pull.horizon - replica.horizon);
  const cheaperMonthly = monthlySigned > 0 ? "replica" : monthlySigned < 0 ? "pull" : "tie";
  const cheaperHorizon = horizonSigned > 0 ? "replica" : horizonSigned < 0 ? "pull" : "tie";

  let breakEvenPullGb = null;
  if (crossRegionRate > 0) {
    const volume = replica.monthly / crossRegionRate;
    if (Number.isFinite(volume) && volume >= 0) breakEvenPullGb = volume;
  }

  let monthsToRecoverSeed = null;
  if (monthlySigned > 0) {
    monthsToRecoverSeed = replica.seed === 0 ? 0 : replica.seed / monthlySigned;
  }

  return {
    pull,
    replica,
    cheaper: cheaperHorizon,
    cheaperMonthly,
    cheaperHorizon,
    monthlySavings: cents(Math.abs(monthlySigned)),
    replicaSavesMonthly: monthlySigned,
    horizonSavings: cents(Math.abs(horizonSigned)),
    replicaSavesHorizon: horizonSigned,
    breakEvenPullGb,
    monthsToRecoverSeed,
    horizonMonths,
  };
}

function pathLabel(id) {
  return id === "replica" ? "the replica path" : "keep-pulling";
}

export function replicaNote(result) {
  let monthlyBit;
  if (result.cheaperMonthly === "tie") {
    monthlyBit = "At the typed monthly pull both paths bill the same this month.";
  } else {
    monthlyBit = `At the typed monthly pull ${pathLabel(result.cheaperMonthly)} is ${money(result.monthlySavings)} cheaper this month.`;
  }

  let seedBit = "";
  if (result.monthsToRecoverSeed === 0) {
    seedBit = " There is no seed to recover.";
  } else if (result.monthsToRecoverSeed != null) {
    seedBit = ` The ${money(result.replica.seed)} seed pays back in about ${result.monthsToRecoverSeed.toFixed(1)} months.`;
  } else if (result.replica.seed > 0) {
    seedBit = ` The ${money(result.replica.seed)} seed does not pay back while keep-pulling is cheaper this month.`;
  }

  let horizonBit;
  if (result.cheaperHorizon === "tie") {
    horizonBit = ` Over ${result.horizonMonths} months including the seed both paths bill the same.`;
  } else {
    horizonBit = ` Over ${result.horizonMonths} months including the seed ${pathLabel(result.cheaperHorizon)} is ${money(result.horizonSavings)} cheaper.`;
  }

  let floorBit = " With these rates the replica path does not match keep-pulling at any pull volume.";
  if (result.breakEvenPullGb === 0) {
    floorBit = " The replica path is already cheaper at 0 GB of monthly pull.";
  } else if (result.breakEvenPullGb != null) {
    floorBit = ` The replica path matches keep-pulling at ${result.breakEvenPullGb.toFixed(0)} GB of monthly pull.`;
  }

  return `${monthlyBit}${seedBit}${horizonBit}${floorBit}`;
}

/**
 * Keep a bucket on the standard (hot) class vs move the same bytes to an
 * infrequent / archive class. Storage is cheaper on the cold path;
 * every gigabyte you read back pays a retrieve fee the hot path often
 * bills at $0. Provider A-vs-B and CDN-vs-origin are different pages.
 *
 * retrieveGbCeiling is the monthly restore volume where both classes
 * bill the same. Above it, standard is cheaper on these rates.
 */
export function compareStorageClass(input = {}) {
  const storageGb = nonNegative(input.storageGb ?? 0, "Stored data");
  const retrieveGb = nonNegative(input.retrieveGb ?? 0, "Retrieved data");
  const standardStorageRate = nonNegative(input.standardStorageRate ?? 0, "Standard storage rate");
  const infrequentStorageRate = nonNegative(input.infrequentStorageRate ?? 0, "Infrequent storage rate");
  const standardRetrieveRate = nonNegative(input.standardRetrieveRate ?? 0, "Standard retrieve rate");
  const infrequentRetrieveRate = nonNegative(input.infrequentRetrieveRate ?? 0, "Infrequent retrieve rate");
  const retrieveRequestsMillion = nonNegative(input.retrieveRequestsMillion ?? 0, "Retrieve requests");
  const standardRetrieveRequestRate = nonNegative(
    input.standardRetrieveRequestRate ?? 0,
    "Standard retrieve request rate",
  );
  const infrequentRetrieveRequestRate = nonNegative(
    input.infrequentRetrieveRequestRate ?? 0,
    "Infrequent retrieve request rate",
  );

  const standard = {
    id: "standard",
    label: "Standard class",
    storage: cents(storageGb * standardStorageRate),
    retrieve: cents(retrieveGb * standardRetrieveRate),
    requests: cents(retrieveRequestsMillion * standardRetrieveRequestRate),
    total: 0,
  };
  standard.total = cents(standard.storage + standard.retrieve + standard.requests);

  const infrequent = {
    id: "infrequent",
    label: "Infrequent / archive class",
    storage: cents(storageGb * infrequentStorageRate),
    retrieve: cents(retrieveGb * infrequentRetrieveRate),
    requests: cents(retrieveRequestsMillion * infrequentRetrieveRequestRate),
    total: 0,
  };
  infrequent.total = cents(infrequent.storage + infrequent.retrieve + infrequent.requests);

  const signed = standard.total - infrequent.total;
  const cheaper = signed > 0 ? "infrequent" : signed < 0 ? "standard" : "tie";

  // S*stdStore + R*stdRet + reqStd = S*iaStore + R*iaRet + reqIa
  // R = (S*(stdStore - iaStore) + (reqStd - reqIa)) / (iaRet - stdRet)
  let retrieveGbCeiling = null;
  const retrieveDelta = infrequentRetrieveRate - standardRetrieveRate;
  if (retrieveDelta > 0) {
    const storageSave = storageGb * (standardStorageRate - infrequentStorageRate);
    const requestDelta = retrieveRequestsMillion * (
      standardRetrieveRequestRate - infrequentRetrieveRequestRate
    );
    const volume = (storageSave + requestDelta) / retrieveDelta;
    if (Number.isFinite(volume)) {
      if (volume <= 0) retrieveGbCeiling = 0;
      else retrieveGbCeiling = cents(volume);
    }
  }

  return {
    standard,
    infrequent,
    cheaper,
    savings: cents(Math.abs(signed)),
    infrequentSaves: cents(signed),
    annualSavings: cents(Math.abs(signed) * 12),
    retrieveGb,
    retrieveGbCeiling,
    retrieveSharePercent: storageGb === 0 ? 0 : (retrieveGb / storageGb) * 100,
  };
}

export function storageClassNote(result) {
  const retrieved = `${result.retrieveGb.toFixed(1)} GB`;
  if (result.cheaper === "tie") {
    return `At ${retrieved} retrieved both classes bill the same this month.`;
  }
  const winner = result.cheaper === "standard"
    ? "standard class"
    : "infrequent / archive class";
  let ceilingBit = "With these rates infrequent / archive does not match standard at any retrieve volume.";
  if (result.retrieveGbCeiling === 0) {
    ceilingBit = "Infrequent / archive is already more expensive at 0 GB retrieved.";
  } else if (result.retrieveGbCeiling != null) {
    ceilingBit = `Infrequent / archive matches standard at ${result.retrieveGbCeiling.toFixed(1)} GB retrieved.`;
  }
  return `At ${retrieved} retrieved ${winner} is ${money(result.savings)} cheaper this month. ${ceilingBit}`;
}
