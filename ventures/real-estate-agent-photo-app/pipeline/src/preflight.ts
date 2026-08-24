/**
 * preflight.ts — runs the MLS floor-spec check
 * (research/src/lib/photo-spec.ts) against a delivery folder on disk, so a
 * shoot can be checked from the CLI without going through the browser tool
 * at research/src/app/photo-check/. Same rule set, same disclosed
 * unimplemented list (photo-spec.ts's UNIMPLEMENTED_RULES) — this is a
 * floor spec, not a board-specific guarantee; see process/mls-compliance.ts.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { checkBatch, isListingPhoto, type PhotoReport } from "../../research/src/lib/photo-spec";

export type PreflightSummary = {
  dir: string;
  reports: PhotoReport[];
  blockingCount: number;
  degradingCount: number;
  ok: boolean;
};

export async function preflightDir(dir: string): Promise<PreflightSummary> {
  const entries = await readdir(dir, { withFileTypes: true });
  const names = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter(isListingPhoto);

  const files = await Promise.all(
    names.map(async (name) => ({
      name,
      data: new Uint8Array(await readFile(path.join(dir, name))),
    })),
  );

  const reports = checkBatch(files);
  const blockingCount = reports.reduce(
    (n, r) => n + r.findings.filter((f) => f.severity === "blocking").length,
    0,
  );
  const degradingCount = reports.reduce(
    (n, r) => n + r.findings.filter((f) => f.severity === "degrading").length,
    0,
  );

  return { dir, reports, blockingCount, degradingCount, ok: blockingCount === 0 };
}
