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

import {
  BRANDING_FILENAME_TOKENS,
  checkBatch,
  isListingPhoto,
  type PhotoReport,
} from "../../research/src/lib/photo-spec";

/** Collateral the Brand/microsite step co-locates (logo.png, headshot.jpg). */
function isBrandingCompanion(name: string): boolean {
  const dot = name.lastIndexOf(".");
  const stem = (dot > 0 ? name.slice(0, dot) : name).toLowerCase();
  return (BRANDING_FILENAME_TOKENS as readonly string[]).includes(stem);
}

export type PreflightSummary = {
  dir: string;
  reports: PhotoReport[];
  blockingCount: number;
  degradingCount: number;
  ok: boolean;
};

/**
 * `excludeFilenames` — extra agent branding assets (headshot/logo) that
 * cli-microsite.ts's --agent-headshot/--agent-logo intentionally co-locate
 * in the delivery dir for the microsite, same convention as
 * microsite.ts's listGalleryPhotos(). Documented companion names
 * (logo.png, headshot.jpg) are always skipped via isBrandingCompanion so
 * `npm run preflight -- --dir ./delivery` works on a complete Brand folder
 * without repeating those flags.
 */
export async function preflightDir(dir: string, excludeFilenames: string[] = []): Promise<PreflightSummary> {
  const exclude = new Set(excludeFilenames);
  const entries = await readdir(dir, { withFileTypes: true });
  const names = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => isListingPhoto(name) && !isBrandingCompanion(name) && !exclude.has(name));

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

  return {
    dir,
    reports,
    blockingCount,
    degradingCount,
    ok: reports.length > 0 && blockingCount === 0,
  };
}
