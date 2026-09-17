// Vector DB Cost Calculator -- arithmetic only, no network, no vendor
// pricing baked in. Two things an engineer sizing a vector index needs and
// usually computes by hand, wrong, in a spreadsheet:
//
//   1. How many gigabytes does my index actually occupy? A raw embedding is
//      vectorCount * dimension * 4 bytes (float32) plus whatever metadata
//      rides along with each vector -- but the index structure a vector DB
//      actually builds (HNSW graphs, quantization bookkeeping, replication)
//      adds overhead on top of the raw vectors, and that overhead varies by
//      engine and by the tuning parameters you chose. Rather than assert a
//      specific multiplier as fact (which would be a claim about vendor
//      internals this tool cannot verify and would go stale the moment a
//      vendor changes its index format), `indexOverhead` is a number the
//      user sets themselves -- 1.0 means "just the raw vectors", higher
//      values model whatever overhead their own vendor's docs or their own
//      measured index size imply.
//   2. Given that many gigabytes and that much monthly query volume, what
//      does each candidate provider actually bill? Bring-your-own-rates,
//      the same discipline ventures/cloud-egress-calculator uses for cloud
//      storage pricing: this tool does not fetch or assert any vendor's
//      current price, because a wrong number here is worse than no number.

const BYTES_PER_DIMENSION = 4; // IEEE-754 float32, the overwhelmingly common
// on-disk/in-memory representation for embeddings. A provider that stores
// quantized (int8/binary) vectors will use less; this is the raw-vector
// baseline the overhead multiplier is meant to be adjusted from.

const GB = 1024 ** 3;

function assertNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
}

/**
 * Raw embedding bytes for the whole index: vectorCount * dimension * 4,
 * plus vectorCount * metadataBytesPerVector for any payload stored
 * alongside each vector (a source id, a chunk of text, tags -- whatever a
 * "metadata" field on the record holds).
 */
export function rawIndexBytes({ vectorCount, dimension, metadataBytesPerVector = 0 }) {
  assertNonNegative(vectorCount, "Vector count");
  assertNonNegative(dimension, "Dimension");
  assertNonNegative(metadataBytesPerVector, "Metadata bytes per vector");
  return vectorCount * dimension * BYTES_PER_DIMENSION + vectorCount * metadataBytesPerVector;
}

/**
 * Estimated on-disk/in-memory footprint after the index structure itself is
 * built, in GiB. `indexOverhead` is a multiplier the caller supplies (1.0 =
 * no overhead modeled); this function does not assume a value.
 */
export function estimatedStorageGb({ vectorCount, dimension, metadataBytesPerVector = 0, indexOverhead = 1 }) {
  assertNonNegative(indexOverhead, "Index overhead multiplier");
  if (indexOverhead < 1) {
    throw new Error("Index overhead multiplier must be at least 1 (1 = raw vectors only, no index structure counted).");
  }
  const raw = rawIndexBytes({ vectorCount, dimension, metadataBytesPerVector });
  return (raw * indexOverhead) / GB;
}

/**
 * One provider's monthly bill for a given storage footprint and query
 * volume: (storage above its free allowance) * storageRate, plus (queries
 * above its free allowance) * queryRate. Both rates are $ the caller
 * supplies -- this never asserts a vendor's real price.
 */
export function providerMonthlyCost({
  name,
  storageGb,
  queriesMillion,
  storageRate,
  queryRate,
  freeStorageGb = 0,
  freeQueriesMillion = 0,
}) {
  assertNonNegative(storageGb, "Storage (GB)");
  assertNonNegative(queriesMillion, "Queries (millions/month)");
  assertNonNegative(storageRate, `${name || "Provider"} storage rate`);
  assertNonNegative(queryRate, `${name || "Provider"} query rate`);
  assertNonNegative(freeStorageGb, `${name || "Provider"} free storage allowance`);
  assertNonNegative(freeQueriesMillion, `${name || "Provider"} free query allowance`);

  const billableStorageGb = Math.max(0, storageGb - freeStorageGb);
  const billableQueriesMillion = Math.max(0, queriesMillion - freeQueriesMillion);
  const storageCost = billableStorageGb * storageRate;
  const queryCost = billableQueriesMillion * queryRate;

  return {
    name: name || "Provider",
    billableStorageGb,
    billableQueriesMillion,
    storageCost,
    queryCost,
    total: storageCost + queryCost,
  };
}

/**
 * Ranks every provider row by total monthly cost (ascending) and names the
 * cheapest. `providers` is an array of the same shape `providerMonthlyCost`
 * takes, each carrying its own storageGb/queriesMillion (normally the same
 * workload figures repeated per row, computed once by the caller).
 */
export function compareProviders(providers) {
  if (!Array.isArray(providers) || providers.length === 0) {
    throw new Error("At least one provider is required.");
  }
  const results = providers.map((p) => providerMonthlyCost(p));
  const ranked = [...results].sort((a, b) => a.total - b.total);
  const cheapest = ranked[0];
  const mostExpensive = ranked[ranked.length - 1];
  return {
    results,
    ranked,
    cheapestName: cheapest.name,
    cheapestTotal: cheapest.total,
    spread: mostExpensive.total - cheapest.total,
  };
}

/** Plain-text decision summary suitable for pasting into a ticket or note. */
export function decisionSummary({ storageGb, queriesMillion, providers }) {
  const { ranked, spread } = compareProviders(providers);
  const lines = [
    `Vector DB monthly cost estimate: ${storageGb.toFixed(2)} GB, ${queriesMillion} million queries/month`,
    ...ranked.map((r, i) => `${i + 1}. ${r.name}: $${r.total.toFixed(2)}/month (storage $${r.storageCost.toFixed(2)}, queries $${r.queryCost.toFixed(2)})`),
    spread > 0
      ? `Spread: $${spread.toFixed(2)}/month between cheapest and most expensive.`
      : "All providers total the same at these rates.",
    "Estimate only, from rates you entered -- verify against each provider's current pricing before deciding.",
  ];
  return lines.join("\n");
}
