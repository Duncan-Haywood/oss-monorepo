export type CreativeTestStatus = "draft" | "active" | "completed" | "archived";

export type CreativeTestItem = {
  testId: string;
  conceptName: string;
  channel: "meta" | "google" | "pinterest" | "tiktok" | string;
  predictedCac: number;
  actualCac: number | null;
  impressions: number;
  clicks: number;
  conversions: number;
  spendUsd: number;
  winningConcept: boolean;
  status: CreativeTestStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreativeTestSummary = {
  totalTests: number;
  activeTests: number;
  completedTests: number;
  winningConceptsCount: number;
  blendedPredictedCac: number;
  blendedActualCac: number;
  totalSpendUsd: number;
  totalConversions: number;
};

const STORAGE_KEY = "print-atelier-creative-tests";

let inMemoryCreativeTests: CreativeTestItem[] = [];

export function generateCreativeTestId(): string {
  return `ctest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function parseCreativeTests(raw: string | null): CreativeTestItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) => typeof item === "object" && item !== null && typeof item.testId === "string",
    );
  } catch {
    return [];
  }
}

export function serializeCreativeTests(tests: CreativeTestItem[]): string {
  return JSON.stringify(tests);
}

export function getCreativeTests(): CreativeTestItem[] {
  let tests = inMemoryCreativeTests;
  if (typeof window !== "undefined") {
    tests = parseCreativeTests(window.localStorage.getItem(STORAGE_KEY));
  }
  return tests;
}

export function recordCreativeTest(
  testInput: Omit<CreativeTestItem, "testId" | "createdAt" | "updatedAt" | "actualCac" | "winningConcept"> & {
    testId?: string;
    actualCac?: number | null;
    winningConcept?: boolean;
    createdAt?: string;
    updatedAt?: string;
  },
): CreativeTestItem {
  const tests = getCreativeTests();
  const now = new Date().toISOString();

  const conversions = testInput.conversions ?? 0;
  const spendUsd = testInput.spendUsd ?? 0;
  const calculatedActualCac =
    conversions > 0 ? Math.round((spendUsd / conversions) * 100) / 100 : testInput.actualCac ?? null;

  const isWinner =
    testInput.winningConcept ??
    (calculatedActualCac !== null && calculatedActualCac <= testInput.predictedCac && conversions >= 3);

  const testRecord: CreativeTestItem = {
    testId: testInput.testId ?? generateCreativeTestId(),
    conceptName: testInput.conceptName,
    channel: testInput.channel,
    predictedCac: testInput.predictedCac,
    actualCac: calculatedActualCac,
    impressions: testInput.impressions ?? 0,
    clicks: testInput.clicks ?? 0,
    conversions,
    spendUsd,
    winningConcept: isWinner,
    status: testInput.status ?? "active",
    createdAt: testInput.createdAt ?? now,
    updatedAt: testInput.updatedAt ?? now,
  };

  const updatedTests = [testRecord, ...tests.filter((t) => t.testId !== testRecord.testId)].slice(
    0,
    100,
  );

  inMemoryCreativeTests = updatedTests;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, serializeCreativeTests(updatedTests));
  }

  return testRecord;
}

export function updateCreativeTestActuals(
  testId: string,
  spendUsd: number,
  conversions: number,
  impressions: number,
  clicks: number,
): CreativeTestItem | null {
  const tests = getCreativeTests();
  const existing = tests.find((t) => t.testId === testId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const actualCac =
    conversions > 0 ? Math.round((spendUsd / conversions) * 100) / 100 : null;
  const winningConcept =
    actualCac !== null && actualCac <= existing.predictedCac && conversions >= 3;

  const updatedRecord: CreativeTestItem = {
    ...existing,
    spendUsd,
    conversions,
    impressions,
    clicks,
    actualCac,
    winningConcept,
    status: conversions > 0 ? "completed" : existing.status,
    updatedAt: now,
  };

  const updatedTests = tests.map((t) => (t.testId === testId ? updatedRecord : t));
  inMemoryCreativeTests = updatedTests;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, serializeCreativeTests(updatedTests));
  }

  return updatedRecord;
}

export function clearCreativeTests(): void {
  inMemoryCreativeTests = [];
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function summarizeCreativeTests(
  tests: CreativeTestItem[] = getCreativeTests(),
): CreativeTestSummary {
  const activeTests = tests.filter((t) => t.status === "active").length;
  const completedTests = tests.filter((t) => t.status === "completed").length;
  const winningConceptsCount = tests.filter((t) => t.winningConcept).length;

  const totalSpendUsd = tests.reduce((sum, t) => sum + t.spendUsd, 0);
  const totalConversions = tests.reduce((sum, t) => sum + t.conversions, 0);

  const blendedPredictedCac =
    tests.length > 0
      ? Math.round((tests.reduce((sum, t) => sum + t.predictedCac, 0) / tests.length) * 100) / 100
      : 0;

  const blendedActualCac =
    totalConversions > 0 ? Math.round((totalSpendUsd / totalConversions) * 100) / 100 : 0;

  return {
    totalTests: tests.length,
    activeTests,
    completedTests,
    winningConceptsCount,
    blendedPredictedCac,
    blendedActualCac,
    totalSpendUsd,
    totalConversions,
  };
}
