/**
 * cli-microsite.ts — `npm run microsite -- --dir <delivery-dir> --listing "<address>" --agent-name "<name>" ...`
 *
 * Writes a single index.html into an already-enhanced delivery folder
 * (pipeline/src/enhance.ts's output), turning it into a shareable property
 * microsite — the "Brand" step of STRATEGY.md's 5-step workflow. Never
 * touches the existing photo files, only adds one new HTML file.
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { generateMicrositeForDelivery } from "./microsite";

type CliArgs = {
  dir: string;
  listing: string;
  agentName: string;
  agentPhone?: string;
  agentEmail?: string;
  agentBrokerage?: string;
  agentHeadshot?: string;
  agentLogo?: string;
  tagline?: string;
  out: string;
};

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };

  const dir = get("--dir");
  const listing = get("--listing");
  const agentName = get("--agent-name");

  if (!dir || !listing || !agentName) {
    throw new Error(
      'Usage: npm run microsite -- --dir <delivery-dir> --listing "<address>" --agent-name "<name>" ' +
        '[--agent-phone <phone>] [--agent-email <email>] [--agent-brokerage <brokerage>] ' +
        "[--agent-headshot <filename-in-dir>] [--agent-logo <filename-in-dir>] " +
        '[--tagline "<tagline>"] [--out index.html]',
    );
  }

  return {
    dir,
    listing,
    agentName,
    agentPhone: get("--agent-phone"),
    agentEmail: get("--agent-email"),
    agentBrokerage: get("--agent-brokerage"),
    agentHeadshot: get("--agent-headshot"),
    agentLogo: get("--agent-logo"),
    tagline: get("--tagline"),
    out: get("--out") ?? "index.html",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const result = await generateMicrositeForDelivery(args.dir, {
    listingAddress: args.listing,
    tagline: args.tagline,
    agent: {
      name: args.agentName,
      phone: args.agentPhone,
      email: args.agentEmail,
      brokerage: args.agentBrokerage,
      headshotFilename: args.agentHeadshot,
      logoFilename: args.agentLogo,
    },
  });

  const outPath = join(args.dir, args.out);
  await writeFile(outPath, result.html, "utf8");

  console.log(`\nListing Lens microsite — ${args.listing}`);
  console.log(`  Wrote:  ${outPath}`);
  console.log(`  Photos: ${result.photoCount}`);
  if (result.photoCount === 0) {
    console.warn(`  Warning: no gallery photos found in ${args.dir} — run enhance first.`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
