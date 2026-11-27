import { computeApplications, type PeriodInput, type SovLineInput } from "@shared/payapp-math";
import type { ApplicationDocumentData } from "@worker/services/export/model";

/** A two-line project with one billed period, for export tests. */
export function sampleDocument(overrides: { lines?: number; status?: string } = {}) {
  const count = overrides.lines ?? 2;
  const sov: SovLineInput[] = Array.from({ length: count }, (_, i) => ({
    id: `L${i + 1}`,
    itemNumber: String(i + 1),
    description: i === 0 ? 'Rough-in, "phase 1" (levels 1-2)' : `=Line ${i + 1} — fixtures`,
    originalCents: 1_000_000,
    sortOrder: i,
  }));
  const period: PeriodInput = {
    id: "P1",
    number: 1,
    periodTo: "2026-01-31",
    retainagePctBps: 1000,
    storedRetainagePctBps: 1000,
    lines: {
      L1: { workThisPeriodCents: 250_000, storedMaterialsCents: 10_000, retainageReleasedCents: 0 },
    },
  };
  const [computed] = computeApplications(
    { originalContractSumCents: count * 1_000_000 },
    sov,
    [],
    [period],
  );
  if (!computed) throw new Error("no computed application");
  const data: ApplicationDocumentData = {
    contractor: { name: "Example Mechanical LLC" },
    project: {
      name: "Example Clinic (Tenant Improvement)",
      number: "P-101",
      location: null,
      gcName: "Example Builders Inc.",
      gcAddress: null,
      ownerName: "Example Owner",
      architectName: null,
      contractDate: "2025-12-01",
    },
    payApp: {
      number: 1,
      periodFrom: "2026-01-01",
      periodTo: "2026-01-31",
      applicationDate: "2026-01-31",
      status: overrides.status ?? "draft",
    },
    computed,
  };
  return data;
}
