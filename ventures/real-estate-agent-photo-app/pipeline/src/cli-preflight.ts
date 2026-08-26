/**
 * cli-preflight.ts — `npm run preflight -- --dir <delivery-dir>`
 *
 * Checks a delivery folder against the MLS floor spec before it goes to an
 * agent/broker: format, byte size, long edge, aspect ratio, branding
 * filename tokens, and staged/original pairing (see
 * research/src/lib/photo-spec.ts). Exits non-zero when any blocking finding
 * is present, so it composes with `npm run enhance` the same way `coverage`
 * does inside cli.ts.
 *
 * --agent-headshot/--agent-logo mirror cli-microsite.ts's flags of the same
 * name: those files are agent branding assets intentionally co-located in
 * the delivery dir for the microsite, not MLS-bound listing photos, so they
 * must be excluded here the same way microsite.ts's listGalleryPhotos()
 * excludes them from the gallery.
 *
 * This is a floor spec, not a board-specific compliance guarantee — it does
 * not check visual watermarks, burned-in contact info, or board-specific
 * rules (photo-spec.ts's UNIMPLEMENTED_RULES). See process/mls-compliance.ts.
 */

import { buildReshootPlan, formatReshootPlan } from "../../research/src/lib/photo-spec";
import { preflightDir } from "./preflight";

type CliArgs = { dir: string; excludeFilenames: string[] };

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };

  const dir = get("--dir");

  if (!dir) {
    throw new Error(
      "Usage: npm run preflight -- --dir <delivery-dir> " +
        "[--agent-headshot <filename-in-dir>] [--agent-logo <filename-in-dir>]",
    );
  }

  const excludeFilenames = [get("--agent-headshot"), get("--agent-logo")].filter(
    (name): name is string => Boolean(name),
  );

  return { dir, excludeFilenames };
}

async function main() {
  const { dir, excludeFilenames } = parseArgs(process.argv.slice(2));
  const summary = await preflightDir(dir, excludeFilenames);

  console.log(`\nListing Lens MLS preflight — ${dir}\n`);

  if (summary.reports.length === 0) {
    console.log("  No .jpg/.jpeg/.png files found in this directory.\n");
    process.exitCode = 1;
    return;
  }

  for (const report of summary.reports) {
    if (report.findings.length === 0) {
      console.log(`  ✓ ${report.info.name}`);
      continue;
    }
    for (const f of report.findings) {
      const marker = f.severity === "blocking" ? "✗" : "!";
      console.log(`  ${marker} ${report.info.name}: [${f.rule}] ${f.detail} (${f.severity})`);
    }
  }

  console.log(
    `\n  ${summary.reports.length} photo(s) checked — ${summary.blockingCount} blocking, ` +
      `${summary.degradingCount} degrading.` +
      (summary.ok ? " Floor spec OK." : " Fix blocking findings before delivering."),
  );
  console.log(`\n${formatReshootPlan(buildReshootPlan(summary.reports))}`);
  console.log(
    "\n  This is a floor spec, not a board-specific compliance guarantee — see " +
      "process/mls-compliance.ts. Not checked: visual watermark, burned-in contact info, " +
      "board-specific rules.",
  );

  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
