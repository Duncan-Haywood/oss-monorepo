export type FulfillmentProvider = "printful" | "gelato";

export type VariantMappingRecord = {
  mappingId: string;
  provider: FulfillmentProvider;
  artworkSlug: string;
  sizeOption: string;
  materialOption: string;
  externalVariantId: string; // e.g. Printful variant_id or Gelato product_uid
  sku: string;
  retailPriceCents: number;
  estimatedCostCents: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OperatorAuditLogRecord = {
  logId: string;
  mappingId: string;
  operatorId: string;
  action: "create" | "update" | "deactivate" | "cost_adjustment";
  previousVariantId: string | null;
  newVariantId: string | null;
  reason: string;
  timestamp: string;
};

export type VariantMappingSummary = {
  totalMappings: number;
  printfulMappings: number;
  gelatoMappings: number;
  activeMappings: number;
  auditLogCount: number;
  coveragePct: number;
};

const mappingStore: VariantMappingRecord[] = [];
const auditLogStore: OperatorAuditLogRecord[] = [];

export function persistVariantMapping(
  mapping: Omit<VariantMappingRecord, "mappingId" | "createdAt" | "updatedAt">,
  operatorId: string,
  reason: string,
): VariantMappingRecord {
  const existing = mappingStore.find(
    (m) =>
      m.provider === mapping.provider &&
      m.artworkSlug === mapping.artworkSlug &&
      m.sizeOption === mapping.sizeOption &&
      m.materialOption === mapping.materialOption,
  );

  const now = new Date().toISOString();
  let record: VariantMappingRecord;

  if (existing) {
    const prevVariant = existing.externalVariantId;
    existing.externalVariantId = mapping.externalVariantId;
    existing.sku = mapping.sku;
    existing.retailPriceCents = mapping.retailPriceCents;
    existing.estimatedCostCents = mapping.estimatedCostCents;
    existing.active = mapping.active;
    existing.updatedAt = now;
    record = existing;

    const log: OperatorAuditLogRecord = {
      logId: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      mappingId: existing.mappingId,
      operatorId,
      action: "update",
      previousVariantId: prevVariant,
      newVariantId: mapping.externalVariantId,
      reason,
      timestamp: now,
    };
    auditLogStore.unshift(log);
  } else {
    const mappingId = `vmap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    record = {
      ...mapping,
      mappingId,
      createdAt: now,
      updatedAt: now,
    };
    mappingStore.unshift(record);

    const log: OperatorAuditLogRecord = {
      logId: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      mappingId,
      operatorId,
      action: "create",
      previousVariantId: null,
      newVariantId: mapping.externalVariantId,
      reason,
      timestamp: now,
    };
    auditLogStore.unshift(log);
  }

  return record;
}

export function getVariantMappings(
  provider?: FulfillmentProvider,
  artworkSlug?: string,
): VariantMappingRecord[] {
  let results = [...mappingStore];
  if (provider) {
    results = results.filter((m) => m.provider === provider);
  }
  if (artworkSlug) {
    results = results.filter((m) => m.artworkSlug === artworkSlug);
  }
  return results;
}

export function getOperatorAuditLogs(mappingId?: string): OperatorAuditLogRecord[] {
  if (mappingId) {
    return auditLogStore.filter((l) => l.mappingId === mappingId);
  }
  return [...auditLogStore];
}

export function buildVariantMappingSummary(totalLiveSkus: number = 20): VariantMappingSummary {
  const active = mappingStore.filter((m) => m.active);
  const printful = active.filter((m) => m.provider === "printful");
  const gelato = active.filter((m) => m.provider === "gelato");

  const mappedSkus = new Set(active.map((m) => `${m.artworkSlug}_${m.sizeOption}`));
  const coveragePct =
    totalLiveSkus > 0
      ? Math.round((mappedSkus.size / totalLiveSkus) * 10000) / 100
      : 0;

  return {
    totalMappings: mappingStore.length,
    printfulMappings: printful.length,
    gelatoMappings: gelato.length,
    activeMappings: active.length,
    auditLogCount: auditLogStore.length,
    coveragePct,
  };
}

export function clearVariantMappingsForTest(): void {
  mappingStore.length = 0;
  auditLogStore.length = 0;
}
