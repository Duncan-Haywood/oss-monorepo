export const PRINT_FILE_SPEC_ID = "print-atelier-floor-2026-08-24";
export const MIN_IMPLIED_DPI = 150;
export const PIXEL_FLOOR_SHORT_EDGE = 1500;
export const MAX_BYTES = 50 * 1024 * 1024;
export const MAX_COMPARE_FILES = 5;
export const DEFAULT_COMPARE_SIZE = "11x14";

const WEB_FILENAME_TOKENS = ["web", "thumbnail", "lowres", "instagram", "facebook"];
const PRINT_SIZES: Record<string, [number, number]> = {
  "5x7": [5, 7],
  "8x10": [8, 10],
  "11x14": [11, 14],
  "12x16": [12, 16],
  "16x20": [16, 20],
  "18x24": [18, 24],
  "24x36": [24, 36],
};

export type PreflightFinding = {
  rule: string;
  detail: string;
  severity: "blocking" | "degrading";
};

export type PreflightResult = {
  fileName: string;
  format: string;
  bytes: number;
  width: number;
  height: number;
  sizeToken: string | null;
  findings: PreflightFinding[];
};

export type PreflightExportRecord = PreflightResult & {
  spec: string;
  generatedAt: string;
  disclaimer: string;
};

export type PreflightComparisonRow = {
  fileName: string;
  rank: number;
  passed: boolean;
  blockingCount: number;
  reviewCount: number;
  width: number;
  height: number;
  dpiAtTarget: number;
  meetsDpiFloor: boolean;
  aspectDelta: number;
  recommended: boolean;
};

export type PreflightComparison = {
  targetSize: string;
  fileCount: number;
  rows: PreflightComparisonRow[];
  recommendedFileName: string | null;
  reason: string;
};

export type BatchPreflightExportRecord = {
  spec: string;
  generatedAt: string;
  disclaimer: string;
  comparison: PreflightComparison;
  files: PreflightResult[];
};

export const PREFLIGHT_DISCLAIMER =
  "Limited automated evidence, not a print-ready warranty or lab approval. Confirm requirements with your printer.";

export function preflightImage(
  file: Pick<File, "name" | "size" | "type">,
  width: number,
  height: number,
): PreflightResult {
  const format =
    file.type === "image/jpeg" ? "jpeg" : file.type === "image/png" ? "png" : file.type || "unknown";
  const findings: PreflightFinding[] = [];
  const sizeToken = findSizeToken(file.name);

  if (!["jpeg", "png"].includes(format)) {
    findings.push({
      rule: "format",
      detail: `${format} is not JPEG or PNG`,
      severity: "blocking",
    });
  }
  if (file.size > MAX_BYTES) {
    findings.push({
      rule: "byte_size",
      detail: `${formatBytes(file.size)} exceeds 50 MiB`,
      severity: "blocking",
    });
  }
  const webToken = WEB_FILENAME_TOKENS.find((token) => file.name.toLowerCase().includes(token));
  if (webToken) {
    findings.push({
      rule: "web_filename",
      detail: `filename contains web-export token '${webToken}'`,
      severity: "blocking",
    });
  }
  if (sizeToken) {
    const inches = namedSizeInches(sizeToken, width, height);
    const dpi = Math.min(width / inches[0], height / inches[1]);
    if (dpi < MIN_IMPLIED_DPI) {
      findings.push({
        rule: "implied_dpi",
        detail: `${Math.round(dpi)} DPI at ${sizeToken}; floor is ${MIN_IMPLIED_DPI} DPI`,
        severity: "blocking",
      });
    }
    const ratio = width / height;
    const expected = inches[0] / inches[1];
    if (Math.abs(ratio - expected) / expected > 0.04) {
      findings.push({
        rule: "named_aspect",
        detail: `${width}x${height} does not match the ${sizeToken} crop`,
        severity: "degrading",
      });
    }
  } else if (Math.min(width, height) < PIXEL_FLOOR_SHORT_EDGE) {
    findings.push({
      rule: "pixel_floor",
      detail: `short edge is ${Math.min(width, height)}px; floor is ${PIXEL_FLOOR_SHORT_EDGE}px`,
      severity: "blocking",
    });
  }

  return {
    fileName: file.name,
    format,
    bytes: file.size,
    width,
    height,
    sizeToken,
    findings,
  };
}

export function listPrintSizes(): string[] {
  return Object.keys(PRINT_SIZES);
}

export function isPrintSize(sizeToken: string): boolean {
  return sizeToken in PRINT_SIZES;
}

export function namedSizeInches(
  sizeToken: string,
  width: number,
  height: number,
): [number, number] {
  const pair = PRINT_SIZES[sizeToken];
  if (!pair) {
    throw new Error(`Unsupported print size token: ${sizeToken}`);
  }
  const [a, b] = pair;
  const landscape = width / height > a / b;
  return landscape ? [b, a] : [a, b];
}

export function impliedDpiForNamedSize(
  width: number,
  height: number,
  sizeToken: string,
): number {
  const inches = namedSizeInches(sizeToken, width, height);
  return Math.min(width / inches[0], height / inches[1]);
}

export function namedAspectDelta(
  width: number,
  height: number,
  sizeToken: string,
): number {
  const inches = namedSizeInches(sizeToken, width, height);
  const ratio = width / height;
  const expected = inches[0] / inches[1];
  return Math.abs(ratio - expected) / expected;
}

export function defaultCompareSize(results: readonly PreflightResult[]): string {
  const counts = new Map<string, number>();
  for (const result of results) {
    if (!result.sizeToken) continue;
    counts.set(result.sizeToken, (counts.get(result.sizeToken) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  // Array.from: tsconfig target is es5, so `for...of` on Map fails TS2802.
  for (const [token, count] of Array.from(counts.entries())) {
    if (count > bestCount || (count === bestCount && best !== null && token < best)) {
      best = token;
      bestCount = count;
    }
  }
  return best ?? DEFAULT_COMPARE_SIZE;
}

function comparisonScore(row: Omit<PreflightComparisonRow, "rank" | "recommended">): number[] {
  return [
    row.passed ? 1 : 0,
    row.meetsDpiFloor ? 1 : 0,
    row.dpiAtTarget,
    -row.reviewCount,
    Math.min(row.width, row.height),
  ];
}

function compareScores(left: number[], right: number[]): number {
  for (let index = 0; index < left.length; index += 1) {
    const delta = (right[index] ?? 0) - (left[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

export function comparePreflightCandidates(
  results: readonly PreflightResult[],
  targetSize: string,
): PreflightComparison {
  if (!isPrintSize(targetSize)) {
    throw new Error(`Unsupported print size token: ${targetSize}`);
  }

  const scored = results.map((result) => {
    const summary = summarizeFindings(result);
    const dpiAtTarget = impliedDpiForNamedSize(result.width, result.height, targetSize);
    const row = {
      fileName: result.fileName,
      passed: summary.passed,
      blockingCount: summary.blockingCount,
      reviewCount: summary.reviewCount,
      width: result.width,
      height: result.height,
      dpiAtTarget,
      meetsDpiFloor: dpiAtTarget >= MIN_IMPLIED_DPI,
      aspectDelta: namedAspectDelta(result.width, result.height, targetSize),
    };
    return { row, score: comparisonScore(row) };
  });

  scored.sort((left, right) => {
    const byScore = compareScores(left.score, right.score);
    if (byScore !== 0) return byScore;
    return left.row.fileName.localeCompare(right.row.fileName);
  });

  const winner = scored[0];
  const hasClearWinner =
    winner !== undefined &&
    winner.row.passed &&
    winner.row.meetsDpiFloor &&
    (scored.length === 1 || compareScores(winner.score, scored[1]?.score ?? []) < 0);

  const rows: PreflightComparisonRow[] = scored.map((entry, index) => ({
    ...entry.row,
    rank: index + 1,
    recommended: hasClearWinner && index === 0,
  }));

  return {
    targetSize,
    fileCount: results.length,
    rows,
    recommendedFileName: hasClearWinner ? winner.row.fileName : null,
    reason: comparisonReason(rows, targetSize),
  };
}

function comparisonReason(rows: PreflightComparisonRow[], targetSize: string): string {
  if (rows.length === 0) {
    return "Add two print masters to compare.";
  }
  if (rows.length === 1) {
    const only = rows[0];
    if (!only.meetsDpiFloor) {
      return `${only.fileName} does not clear the ${MIN_IMPLIED_DPI} DPI floor at ${targetSize}. Add another master to compare.`;
    }
    if (!only.passed) {
      return `${only.fileName} meets the ${MIN_IMPLIED_DPI} DPI floor at ${targetSize} but is still blocked. Add another master to compare.`;
    }
    return `Add another master to compare against ${only.fileName} at ${targetSize}.`;
  }

  const recommended = rows.find((row) => row.recommended);
  if (!recommended) {
    if (rows.every((row) => !row.meetsDpiFloor)) {
      return `None of these files meet the ${MIN_IMPLIED_DPI} DPI floor at ${targetSize}.`;
    }
    if (rows.every((row) => !row.passed)) {
      return `No file both passes the checks and meets the ${MIN_IMPLIED_DPI} DPI floor at ${targetSize}. A blocked file can still be above the floor — check the dated record before you pay for a proof.`;
    }
    return `These files are too close to rank at ${targetSize}. Check the dated record before you pay for a proof.`;
  }

  const dpi = Math.round(recommended.dpiAtTarget);
  const runnerUp = rows[1];
  if (runnerUp && (!runnerUp.passed || !runnerUp.meetsDpiFloor)) {
    return `${recommended.fileName} is the better master for ${targetSize} at ${dpi} DPI; the other files are below the floor or blocked.`;
  }
  return `${recommended.fileName} is the better master for ${targetSize} at ${dpi} DPI.`;
}

function findSizeToken(name: string): string | null {
  const match = name.match(/(?<!\d)(\d{1,2})x(\d{1,2})(?!\d)/i);
  if (!match) return null;
  const token = `${Math.min(Number(match[1]), Number(match[2]))}x${Math.max(Number(match[1]), Number(match[2]))}`;
  return token in PRINT_SIZES ? token : null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function summarizeFindings(result: PreflightResult): {
  blockingCount: number;
  reviewCount: number;
  passed: boolean;
} {
  const blockingCount = result.findings.filter((finding) => finding.severity === "blocking").length;
  const reviewCount = result.findings.filter((finding) => finding.severity === "degrading").length;
  return {
    blockingCount,
    reviewCount,
    passed: blockingCount === 0,
  };
}

export function buildPreflightExportRecord(
  result: PreflightResult,
  generatedAt: string,
): PreflightExportRecord {
  return {
    spec: PRINT_FILE_SPEC_ID,
    generatedAt,
    ...result,
    disclaimer: PREFLIGHT_DISCLAIMER,
  };
}

export function preflightExportFileName(fileName: string): string {
  return `${fileName.replace(/[^a-z0-9._-]/gi, "-")}-preflight.json`;
}

export function buildBatchPreflightExportRecord(
  results: readonly PreflightResult[],
  targetSize: string,
  generatedAt: string,
): BatchPreflightExportRecord {
  return {
    spec: PRINT_FILE_SPEC_ID,
    generatedAt,
    disclaimer: PREFLIGHT_DISCLAIMER,
    comparison: comparePreflightCandidates(results, targetSize),
    files: [...results],
  };
}

export function batchPreflightExportFileName(targetSize: string, generatedAt: string): string {
  const stamp = generatedAt.replace(/[:.]/g, "-");
  return `print-masters-${targetSize}-${stamp}-preflight.json`;
}
