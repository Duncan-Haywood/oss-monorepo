#!/usr/bin/env node
// CLI: follows a URL's real HTTP redirect chain, one hop at a time, and
// reports a redirect loop, a chain longer than recommended, an HTTPS-to-HTTP
// downgrade, a permanent-looking move using a temporary status code, a chain
// that ends in a 4xx/5xx error, or a chain that is still redirecting when it
// runs out of hops. Your machine, your network -- nothing goes through this
// portfolio.
//
//   node check.mjs <start-url> [--json] [--timeout <ms>] [--max-hops <n>]
//                  [--recommended-max-hops <n>]
//
// Exit code 0 when the chain landed cleanly with no finding; 1 when a
// danger-severity finding was produced, the chain could not be completed, or
// it was still redirecting when it ran out of hops.

import { walkChain } from './fetch-chain.mjs';
import { classifyChain } from './engine.mjs';

const DEFAULT_MAX_HOPS = 10;

function parseArgs(argv) {
  const args = {
    target: null,
    json: false,
    timeoutMs: undefined,
    maxHops: DEFAULT_MAX_HOPS,
    recommendedMaxHops: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--timeout') args.timeoutMs = Number(argv[++i]);
    else if (argv[i] === '--max-hops') args.maxHops = Number(argv[++i]);
    else if (argv[i] === '--recommended-max-hops') args.recommendedMaxHops = Number(argv[++i]);
    else if (!args.target && !argv[i].startsWith('--')) args.target = argv[i];
  }
  return args;
}

/** Pure orchestration: given an injectable walk function, walk and classify.
 * Kept separate from main() so tests can supply a fake instead of hitting
 * the network. */
export async function runCheck(target, {
  walkChainFn = walkChain,
  timeoutMs,
  maxHops = DEFAULT_MAX_HOPS,
  recommendedMaxHops,
} = {}) {
  const { hops, truncated } = await walkChainFn(target, { timeoutMs, maxHops });
  const report = classifyChain(hops, recommendedMaxHops ? { recommendedMaxHops } : {});
  return { target, hops, truncated, maxHops, report };
}

function formatText({ target, hops, truncated, maxHops, report }) {
  const lines = [];
  lines.push(`Starting URL: ${target}`);
  lines.push('');
  lines.push(`Hops fetched: ${hops.length}${truncated ? ` (stopped at --max-hops ${maxHops}, still redirecting)` : ''}`);
  for (const [i, h] of hops.entries()) {
    lines.push(`  ${i + 1}. ${h.status ?? 'ERROR'}  ${h.url}${h.error ? `  (${h.error})` : ''}`);
  }
  lines.push('');

  if (report.inputError) {
    lines.push(report.inputError);
    return lines.join('\n');
  }

  if (report.findings.length === 0) {
    lines.push('None of the checked redirect-chain issues were found.');
  } else {
    for (const f of report.findings) {
      const mark = f.severity === 'danger' ? '!!' : '--';
      lines.push(`${mark} [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`     ${f.detail}`);
      lines.push('');
    }
  }

  lines.push(
    'This is evidence from the chain fetched above, not a full technical-SEO audit -- ' +
      'see README.md for what this tool does and does not check.',
  );
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.target) {
    console.error('Usage: node check.mjs <start-url> [--json] [--timeout <ms>] [--max-hops <n>] [--recommended-max-hops <n>]');
    process.exit(2);
  }
  try {
    // eslint-disable-next-line no-new
    new URL(args.target);
  } catch {
    console.error(`Not a valid URL: ${args.target}`);
    process.exit(2);
  }

  const result = await runCheck(args.target, {
    timeoutMs: args.timeoutMs,
    maxHops: args.maxHops,
    recommendedMaxHops: args.recommendedMaxHops,
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatText(result));
  }

  process.exit(result.report.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
