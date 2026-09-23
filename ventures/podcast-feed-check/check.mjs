#!/usr/bin/env node
// CLI: fetches a podcast RSS feed URL for real and checks it against the
// documented spec/Apple-Podcasts-requirement violations engine.mjs knows
// about. Your machine, your network -- nothing goes through this portfolio.
//
//   node check.mjs <feed-url> [--json] [--timeout <ms>]
//
// Exit code 0 when no danger-severity finding was produced; 1 when the feed
// could not be fetched/parsed, or a danger-severity finding was produced.

import { fetchFeedXml } from './fetch-feed.mjs';
import { parseFeed } from './feed-parser.mjs';
import { classifyFeed } from './engine.mjs';

function parseArgs(argv) {
  const args = { target: null, json: false, timeoutMs: undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--timeout') args.timeoutMs = Number(argv[++i]);
    else if (!args.target && !argv[i].startsWith('--')) args.target = argv[i];
  }
  return args;
}

/** Pure orchestration: given an injectable fetch function, fetch, parse, and
 * classify. Kept separate from main() so tests can supply a fake instead of
 * hitting the network. */
export async function runCheck(target, { fetchFeedXmlFn = fetchFeedXml, timeoutMs } = {}) {
  const fetched = await fetchFeedXmlFn(target, timeoutMs ? { timeoutMs } : {});
  if (!fetched.ok) {
    return {
      target, fetched, feed: null,
      report: { findings: [{ id: 'fetch-failed', severity: 'danger', title: `Could not fetch the feed: ${fetched.error}`, detail: `Fetching ${target} failed: ${fetched.error}` }], dangerCount: 1, noticeCount: 0, itemCount: 0, ok: false },
    };
  }
  const feed = parseFeed(fetched.body);
  const report = classifyFeed(feed);
  return { target, fetched, feed, report };
}

function formatText({ target, report }) {
  const lines = [];
  lines.push(`Feed: ${target}`);
  lines.push('');
  if (report.findings.length === 0) {
    lines.push('None of the checked podcast-feed spec issues were found.');
  } else {
    for (const f of report.findings) {
      const mark = f.severity === 'danger' ? '!!' : '--';
      lines.push(`${mark} [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`     ${f.detail}`);
      lines.push('');
    }
  }
  lines.push(
    `${report.dangerCount} error(s), ${report.noticeCount} notice(s) across ${report.itemCount} episode(s). ` +
      'This is evidence against specific, documented rules, not a full validation guarantee -- see README.md.',
  );
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.target) {
    console.error('Usage: node check.mjs <feed-url> [--json] [--timeout <ms>]');
    process.exit(2);
  }
  try {
    // eslint-disable-next-line no-new
    new URL(args.target);
  } catch {
    console.error(`Not a valid URL: ${args.target}`);
    process.exit(2);
  }

  const result = await runCheck(args.target, { timeoutMs: args.timeoutMs });

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
