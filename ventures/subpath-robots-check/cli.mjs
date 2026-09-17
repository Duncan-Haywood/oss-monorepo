#!/usr/bin/env node
// subpath-robots-check -- does the site at this URL govern its own robots.txt?
//
// Zero dependencies, and no network access unless you pass `--fetch`. The
// default is offline on purpose: every conclusion this tool draws about the
// *structure* of the problem follows from the URL alone, and a checker that
// silently phones home is a worse neighbour than one that asks.

import { readFile } from "node:fs/promises";
import { assess } from "./analyze.mjs";

const USAGE = `subpath-robots-check -- can this site's robots.txt actually govern it?

Usage:
  node cli.mjs check <url> [options]
  node cli.mjs explain
  node cli.mjs --help

Options:
  --published <file>   robots.txt the site itself publishes, read from a file
  --governing <file>   robots.txt from the ORIGIN ROOT, read from a file
  --fetch              fetch the origin-root robots.txt over the network
                       (the only thing in this tool that makes a request)
  --json               machine-readable output
  --fail-on-critical   exit 1 when a critical finding is present, for CI

Examples:
  node cli.mjs check https://acme.github.io/widget/
  node cli.mjs check https://acme.github.io/widget/ --published robots.txt
  node cli.mjs check https://acme.github.io/widget/ --fetch --fail-on-critical

Nothing is uploaded. Without --fetch this process opens no sockets at all.
Not a security audit and not an SEO guarantee -- it checks one specific,
well-documented thing. See the README for what it cannot tell you.
`;

const EXPLAIN = `Why a subpath site cannot govern its own robots.txt

RFC 9309 section 2.3 puts robots.txt at a fixed location: a crawler requests
<scheme>://<host>:<port>/robots.txt and nothing else. The file is scoped to
the ORIGIN, not to a path prefix.

So a site published under a prefix -- user.github.io/repo/, group.gitlab.io/
project/, a CDN subdirectory -- publishes a robots.txt that no crawler ever
requests. The rules in it are inert in both directions:

  * A Disallow: you wrote to keep a draft out of search is not honoured.
  * A Sitemap: line you published is never read.

The second one is what costs traffic. Sitemap auto-discovery works by reading
the Sitemap: line out of the governing robots.txt, so a sitemap advertised
only from a subpath is never fetched, and the pages listed in it are never
enumerated.

What still works: link-following. Crawlers reach any page that is linked from
a page they already know. That is exactly why this failure is silent --
nothing 404s, nothing errors, some pages do get indexed, and every tool that
checks the origin root reports a healthy file that belongs to somebody else.
`;

function parseArgs(argv) {
  const options = { fetch: false, json: false, failOnCritical: false };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return { help: true };
    else if (arg === "--fetch") options.fetch = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--fail-on-critical") options.failOnCritical = true;
    else if (arg === "--published") options.published = argv[++i];
    else if (arg === "--governing") options.governing = argv[++i];
    else if (arg.startsWith("--")) return { error: `Unknown option: ${arg}` };
    else positional.push(arg);
  }
  return { options, positional };
}

async function readIfGiven(path, label) {
  if (!path) return "";
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`Could not read the ${label} robots.txt at ${path}: ${error.message}`);
  }
}

/**
 * Fetch the origin-root robots.txt. Only ever called with --fetch.
 *
 * A 404 is a real answer here, not an error: it means no file exists, which
 * crawlers treat as "no restrictions". Reporting it as a failure would send
 * the user looking for a network problem they do not have.
 */
async function fetchGoverning(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { accept: "text/plain" },
  });
  if (response.status === 404) return { text: "", missing: true };
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return { text: await response.text(), missing: false };
}

const SEVERITY_LABEL = {
  critical: "CRITICAL",
  warning: "WARNING ",
  info: "INFO    ",
  pass: "OK      ",
};

function render(report, { fetchedMissing } = {}) {
  const lines = [];
  const { site } = report;

  lines.push("");
  lines.push(`  Site              ${site.origin}${site.pathname}`);
  lines.push(`  Governing file    ${site.governingRobotsUrl}   <- the only one crawlers read`);
  if (site.isSubpath) {
    lines.push(`  Published file    ${site.publishedRobotsUrl}   <- fetched by nothing`);
  }
  lines.push("");

  const headline = report.governs
    ? "This site governs its own robots.txt."
    : "This site does NOT govern its own robots.txt.";
  lines.push(`  ${headline}`);
  lines.push("");

  if (fetchedMissing) {
    lines.push("  The origin-root robots.txt returned 404 -- no file exists there.");
    lines.push("  Crawlers read that as no restrictions, so nothing blocks these pages;");
    lines.push("  but there is also no file anywhere that could carry a Sitemap: line.");
    lines.push("");
  }

  for (const finding of report.findings) {
    lines.push(`  ${SEVERITY_LABEL[finding.severity]}  ${finding.title}`);
    lines.push(wrap(finding.detail, 12));
    if (finding.remedy) lines.push(wrap(`Fix: ${finding.remedy}`, 12));
    lines.push("");
  }

  if (report.remedies.length) {
    lines.push("  What to do, most complete first:");
    lines.push("");
    for (const remedy of report.remedies) {
      lines.push(`    ${remedy.title}  [${remedy.effect}]`);
      lines.push(wrap(remedy.detail, 6));
      lines.push(wrap(`Cost: ${remedy.cost}`, 6));
      lines.push("");
    }
  }

  lines.push(
    `  ${report.counts.critical} critical, ${report.counts.warnings} warning(s).`,
  );
  lines.push(
    "  Not a security audit and not an SEO guarantee -- this checks one specific thing.",
  );
  lines.push("");
  return lines.join("\n");
}

/** Wrap prose to a readable width, stripping the markdown backticks. */
function wrap(text, indent) {
  const pad = " ".repeat(indent);
  const words = String(text).replace(/`/g, "").split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line && line.length + word.length + 1 > 76 - indent) {
      lines.push(pad + line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(pad + line);
  return lines.join("\n");
}

export async function main(argv, io = {}) {
  // Output goes through injected sinks rather than `process.stdout` directly
  // so the tests can capture it without monkeypatching the global streams --
  // which also swallows the test runner's own TAP output and corrupts the run.
  const out = io.stdout || ((s) => process.stdout.write(s));
  const err = io.stderr || ((s) => process.stderr.write(s));
  const parsed = parseArgs(argv);
  if (parsed.help) {
    out(USAGE);
    return 0;
  }
  if (parsed.error) {
    err(`${parsed.error}\n\n${USAGE}`);
    return 2;
  }

  const [command, ...rest] = parsed.positional;
  if (!command) {
    out(USAGE);
    return 0;
  }
  if (command === "explain") {
    out(EXPLAIN);
    return 0;
  }
  if (command !== "check") {
    err(`Unknown command: ${command}\n\n${USAGE}`);
    return 2;
  }

  const [url] = rest;
  if (!url) {
    err(`check needs a URL.\n\n${USAGE}`);
    return 2;
  }

  const { options } = parsed;
  let published;
  let governing;
  try {
    published = await readIfGiven(options.published, "published");
    governing = await readIfGiven(options.governing, "governing");
  } catch (error) {
    err(`${error.message}\n`);
    return 2;
  }

  let fetchedMissing = false;
  if (options.fetch) {
    const target = assess({ siteUrl: url });
    if (!target.ok) {
      err(`${target.error}\n`);
      return 2;
    }
    try {
      const fetched = await fetchGoverning(target.site.governingRobotsUrl);
      fetchedMissing = fetched.missing;
      // An explicit --governing file wins: the user went and got it, and a
      // fetch silently overwriting it would be the tool disagreeing with the
      // person who has more information than it does.
      if (!governing) governing = fetched.text;
    } catch (error) {
      err(
        `Could not fetch ${target.site.governingRobotsUrl}: ${error.message}\n` +
          `Re-run without --fetch to get the structural report anyway.\n`,
      );
      return 2;
    }
  }

  const report = assess({ siteUrl: url, publishedRobots: published, governingRobots: governing });
  if (!report.ok) {
    err(`${report.error}\n`);
    return 2;
  }

  if (options.json) {
    out(`${JSON.stringify({ ...report, fetchedMissing }, null, 2)}\n`);
  } else {
    out(render(report, { fetchedMissing }));
  }

  if (options.failOnCritical && report.counts.critical > 0) return 1;
  return 0;
}

// Only run when invoked directly, so the tests can import `main` freely.
const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
      process.exitCode = 2;
    },
  );
}
