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
  return `$${value.toFixed(2)}`;
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
