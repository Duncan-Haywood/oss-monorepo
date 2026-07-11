/**
 * cli.ts — `npm run enhance -- --in <dir> --out <dir> --listing "<address>"`
 *
 * Turns a folder of raw guided-shoot photos into an MLS-ready delivery
 * folder in one command, and reports whether the shoot hit the expected
 * shot count from process/capture-checklist.ts. This is the concrete
 * artifact behind roadmap task p2-ai-pipeline / STRATEGY.md's "Enhance"
 * step for the concierge MVP — see process/decisions-log.ts for why it's
 * a local deterministic pass rather than a cloud AI call.
 */

import { batchEnhance, DEFAULT_ENHANCE_OPTIONS } from "./enhance";
import { checkCoverage } from "./coverage";

type CliArgs = {
  in: string;
  out: string;
  listing: string;
  maxWidth: number;
  quality: number;
};

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };

  const inDir = get("--in");
  const outDir = get("--out");
  const listing = get("--listing");

  if (!inDir || !outDir || !listing) {
    throw new Error(
      'Usage: npm run enhance -- --in <raw-photos-dir> --out <delivery-dir> --listing "<address or slug>" [--max-width 2048] [--quality 88]',
    );
  }

  return {
    in: inDir,
    out: outDir,
    listing,
    maxWidth: Number(get("--max-width") ?? DEFAULT_ENHANCE_OPTIONS.maxWidth),
    quality: Number(get("--quality") ?? DEFAULT_ENHANCE_OPTIONS.quality),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const summary = await batchEnhance(args.in, args.out, {
    listingSlug: args.listing,
    maxWidth: args.maxWidth,
    quality: args.quality,
  });

  const coverage = checkCoverage(summary.processed.length);

  console.log(`\nListing Lens enhance pipeline — ${args.listing}`);
  console.log(`  Input:  ${args.in}`);
  console.log(`  Output: ${args.out}\n`);

  for (const r of summary.processed) {
    const savedPct = r.inputBytes > 0 ? Math.round((1 - r.outputBytes / r.inputBytes) * 100) : 0;
    console.log(`  ✓ ${r.outputPath}  (${r.width}x${r.height}, ${savedPct >= 0 ? "-" : "+"}${Math.abs(savedPct)}% size)`);
  }
  for (const s of summary.skipped) {
    console.log(`  - skipped ${s.path}: ${s.reason}`);
  }

  console.log(
    `\n  Processed ${summary.processed.length}/${coverage.expected} expected shots` +
      (coverage.ok
        ? " — coverage OK."
        : ` — ${coverage.shortfall} short of the capture checklist. Review before delivering.`),
  );

  if (!coverage.ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
