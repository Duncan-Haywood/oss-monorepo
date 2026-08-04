import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildVariantMappingSummary,
  clearVariantMappingsForTest,
  getOperatorAuditLogs,
  getVariantMappings,
  persistVariantMapping,
} from "../src/lib/variant-persistence.ts";

test("persistVariantMapping creates mapping and records operator audit log", () => {
  clearVariantMappingsForTest();

  const record = persistVariantMapping(
    {
      provider: "printful",
      artworkSlug: "coastal-mist-fine-art-print",
      sizeOption: "24x36",
      materialOption: "archival_rag",
      externalVariantId: "pf_var_9912",
      sku: "SKU_COASTAL_24X36_RAG",
      retailPriceCents: 18500,
      estimatedCostCents: 4200,
      active: true,
    },
    "operator_duncan",
    "Initial catalog mapping creation",
  );

  assert.ok(record.mappingId.startsWith("vmap_"));
  assert.equal(record.externalVariantId, "pf_var_9912");

  const mappings = getVariantMappings("printful");
  assert.equal(mappings.length, 1);

  const logs = getOperatorAuditLogs(record.mappingId);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].action, "create");
  assert.equal(logs[0].operatorId, "operator_duncan");
});

test("persistVariantMapping updates existing mapping and appends audit log entry", () => {
  clearVariantMappingsForTest();

  const initial = persistVariantMapping(
    {
      provider: "gelato",
      artworkSlug: "desert-dunes-canvas",
      sizeOption: "18x24",
      materialOption: "stretched_canvas",
      externalVariantId: "gel_uid_101",
      sku: "SKU_DESERT_18X24_CANVAS",
      retailPriceCents: 14000,
      estimatedCostCents: 3800,
      active: true,
    },
    "operator_duncan",
    "Initial Gelato setup",
  );

  const updated = persistVariantMapping(
    {
      provider: "gelato",
      artworkSlug: "desert-dunes-canvas",
      sizeOption: "18x24",
      materialOption: "stretched_canvas",
      externalVariantId: "gel_uid_102_v2",
      sku: "SKU_DESERT_18X24_CANVAS",
      retailPriceCents: 14000,
      estimatedCostCents: 3600,
      active: true,
    },
    "operator_duncan",
    "Updated Gelato SKU UID for EU routing",
  );

  assert.equal(updated.mappingId, initial.mappingId);
  assert.equal(updated.externalVariantId, "gel_uid_102_v2");

  const logs = getOperatorAuditLogs(initial.mappingId);
  assert.equal(logs.length, 2);
  assert.equal(logs[0].action, "update");
  assert.equal(logs[0].previousVariantId, "gel_uid_101");
  assert.equal(logs[0].newVariantId, "gel_uid_102_v2");

  const summary = buildVariantMappingSummary(10);
  assert.equal(summary.activeMappings, 1);
  assert.equal(summary.auditLogCount, 2);
});
