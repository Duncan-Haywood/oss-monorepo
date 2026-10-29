// Where a share link puts the visitor's numbers.
//
// Every calculator here offers to copy a link that reopens the tool with the
// sender's figures in it. There are two places that payload can ride, and they
// are not equivalent:
//
//   ?price=75&businessName=Riverside   sent to the server in the request line
//                                      of every load, and attached to the
//                                      `Referer` header of any outbound click
//                                      from the opened page
//
//   #price=75&businessName=Riverside   resolved entirely in the browser; sent
//                                      in neither
//
// The portfolio's central promise, the one `platform/privacy/` exists to hold,
// is that the visitor's figures never leave the device. A query-string share
// link breaks it twice over — once into whatever access log fronts the site,
// and once into any third party the visitor clicks through to — and it does so
// silently, because the link works perfectly either way. Nothing in the UI, the
// diff, or a browser test looks different.
//
// ## Why this guard exists at all
//
// `browser-signals.mjs` and `inline-signals.mjs` between them prove that every
// usage counter obeys Do Not Track and Global Privacy Control. That is the
// promise about *data the tool records*. Nothing was checking the promise about
// *data the tool transmits*, and on 2026-09-06 six ventures were found writing
// the payload to the query string:
//
//   booth-rent-vs-commission        painting-bid-calculator
//   no-show-fee-calculator          str-host-payout-calculator
//   tiktok-shop-fee-calculator      where-to-sell-calculator
//
// against 137 pages using the fragment. So the convention was real and widely
// followed, and it was drifting anyway — which is the case for an exit code
// rather than a paragraph. Two of the six are worth naming, because they show
// the drift was not carelessness:
//
//   - `painting-bid-calculator` put the proposal *terms* in the fragment, with
//     a comment giving exactly the reasoning above, and left the costs and
//     margin behind in the query string. The rule was understood and applied
//     to half the payload.
//   - `no-show-fee-calculator`'s own test was named "buildShareUrl encodes
//     supported inputs **without server state**" — while writing the business's
//     name into the one part of the URL every server sees.
//
// A convention that is understood, tested, and still drifts is one that needs
// enforcing rather than restating.
//
// ## What it reads, and why structure rather than behaviour
//
// These links are built inside page `<script>` blocks closed over the DOM, so
// driving them would mean standing up a document per venture — the same
// argument `inline-signals.mjs` makes for reading structure instead. The
// difference here is that structure is not weaker evidence: *which member of
// the URL is assigned* is the whole of the defect. There is no way to write a
// payload to the query string without naming `search`, `searchParams`, or a
// literal `?` in the link, and no way to name one of those innocently while
// building a share link.
//
// Verified against the defect it was written for, which is the only evidence
// that a new guard is worth its line count: run over the six ventures as they
// stood on `main` before the fix, it reports all seven leak sites at their
// exact lines — `booth-rent-vs-commission:267`, `no-show-fee-calculator/
// calc.mjs:795`, `painting-bid-calculator:561` and `:570`,
// `str-host-payout-calculator:385`, `tiktok-shop-fee-calculator:363`,
// `where-to-sell-calculator:969` — and reports the fleet clean afterwards.
//
// Reads are deliberately not flagged. Every venture fixed on 2026-09-06 still
// reads `location.search`, because links copied before the fix are already in
// people's inboxes and have to keep opening. Forbidding the read would either
// break those links or push the fix toward silently dropping them — so the rule
// is about the write side only, which is what actually leaks.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/** Files that could build a share link: pages and their modules, never tests. */
const SOURCE_EXTENSIONS = new Set([".html", ".mjs", ".js"]);

/**
 * Assignments and calls that put something *into* the query string.
 *
 * Each entry names the shape and says what a legitimate use looks like, so a
 * future widening is a decision rather than a guess.
 */
// A line only counts as building a *URL* if it names one. This is what keeps
// the `?` rule off JavaScript's other `?`s — the ternary operator above all,
// which appears inside template literals all over this fleet
// (`${kind === 'in' ? '+' : '-'}`) and is indistinguishable from a query
// payload by shape alone.
const URL_CONTEXT = /location\.|\bhref\b|new URL\(|\bURL\(|pathname|origin|replaceState|pushState|\burl\b|\bUrl\b|\bURL\b|\blink\b|\bLink\b|\.hash\b/i;

const WRITE_PATTERNS = [
  {
    id: "searchParams.set",
    // `url.searchParams.set('price', ...)` — the most direct spelling. Needs no
    // context test: `searchParams` names the query string and nothing else.
    test: (line) => /\.searchParams\s*\.\s*(?:set|append)\s*\(/.test(line),
    why: "writes a parameter into the query string, which the server sees",
  },
  {
    id: "search-assignment",
    // `url.search = '?c=' + payload`.
    //
    // Assigning the empty string is the documented way to *clear* a query
    // string while moving the payload to the fragment, so it is allowed. That
    // exemption is applied by inspecting the right-hand side rather than by a
    // negative lookahead: a lookahead after `\s*` can be stepped around by
    // backtracking the whitespace, which is exactly the bug the first draft of
    // this module shipped — it passed `url.search = "";` through as a *finding*
    // while believing it had exempted it.
    test: (line) => {
      const match = /\.search\s*=\s*(.*)$/.exec(line);
      if (!match) return false;
      const rhs = match[1].trim().replace(/;$/, "").trim();
      return !/^(""|''|``)$/.test(rhs);
    },
    why: "assigns a non-empty query string, which the server sees",
  },
  {
    id: "question-mark-template",
    // A link or history entry built as `...?${params}` or `... + "?" + params`.
    //
    // Both halves are required: an interpolation or concatenation immediately
    // after the `?`, *and* something on the line that names a URL. Either test
    // alone is wrong in a way that was measured — `?${` alone flags every
    // ternary inside a template literal, and a URL mention alone flags every
    // line that merely reads `location.search`.
    test: (line) => {
      if (!URL_CONTEXT.test(line)) return false;
      // `?` followed by an interpolation, immediately preceded by the end of a
      // path segment: a closing interpolation, a quote, or a `]` from
      // `split("?")[0]`. A bare ` ? ` with spaces is a ternary.
      if (/[}\]'"`]\?\$\{/.test(line)) return true;
      // `"?" +` / `'?' +` string concatenation.
      if (/(["'`])\?\1\s*\+/.test(line)) return true;
      return false;
    },
    why: "builds a URL whose query string carries an interpolated payload",
  },
];

/** Lines that name a write pattern but cannot be building a share link. */
function isExempt(line) {
  const trimmed = line.trim();
  // A comment explaining the rule is not a violation of it. This module and
  // the ventures fixed alongside it all discuss `?` and `searchParams` at
  // length in exactly the place the checker looks.
  if (/^(\/\/|\*|<!--|#)/.test(trimmed)) return true;
  // Stripe's `client_reference_id` is a query parameter by Stripe's own
  // contract (a Payment Link has no fragment form). It carries an opaque
  // attribution code to Stripe on the visitor's own click on a Stripe link,
  // not a share payload to this site's server or an outbound Referer.
  if (/\bclient_reference_id\b/.test(trimmed)) return true;
  return false;
}

/**
 * Directories that hold generated output rather than source someone wrote.
 *
 * `node_modules` and `dist` were here from the start. The rest were added
 * 2026-09-16 after a real false positive: building `ventures/vendor-watch`
 * (`npm run build`, the step its own CI runs) leaves a `.next/` tree, and one
 * minified Next.js server chunk in it assigns to `.search` — so this checker
 * reported a query-string share leak in a venture that has no share link at
 * all, naming a file no author wrote and git does not track.
 *
 * That red costs more than it looks. Every one of these directories is already
 * in `.gitignore`, so nothing here can be a source file this repository ships;
 * and a checker that goes red because you built the project is one a session
 * learns to wave through, which is the failure mode CLAUDE.md records against
 * starved CI, `UNRUN` steps and skipped guards alike. Scanning generated
 * bundles was never the point: a leak lands in the *source*, which is what
 * the fleet is fixed in.
 */
const GENERATED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  ".next",
  "out",
  "build",
  ".turbo",
  "coverage",
  // Server-side Node code a person deploys themselves (an OAuth authorization
  // URL to a provider needs its query string). It is not a page, so it cannot
  // build a share link for a visitor.
  "self-host",
]);

/**
 * Every source file under `root` that could build a share link.
 *
 * Test files are skipped: they legitimately construct query-string URLs as
 * fixtures, including the ones asserting a legacy `?` link still opens.
 */
export async function findShareSources(root) {
  /** @type {string[]} */
  const found = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (GENERATED_DIRECTORIES.has(entry.name)) continue;
        await walk(full);
        continue;
      }
      if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
      if (/\.test\.(mjs|js)$/.test(entry.name)) continue;
      if (entry.name === "test.mjs" || entry.name === "test.js") continue;
      if (full.split(path.sep).includes("test")) continue;
      found.push(full);
    }
  }
  await walk(root);
  return found.sort();
}

/**
 * Query-string writes in one file's source.
 *
 * Returns one finding per offending line: `{ line, id, why, source }`.
 */
export function checkSource(text) {
  /** @type {{line: number, id: string, why: string, source: string}[]} */
  const findings = [];
  const lines = String(text ?? "").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (isExempt(line)) return;
    for (const { id, test: matches, why } of WRITE_PATTERNS) {
      if (matches(line)) {
        findings.push({ line: index + 1, id, why, source: line.trim() });
        break;
      }
    }
  });
  return findings;
}

/** Check one file on disk. */
export async function checkFile(file) {
  return checkSource(await readFile(file, "utf8"));
}

/**
 * Check every venture source under `root`.
 *
 * Resolves to `{ checked, findings }` where `findings` carries the file path
 * alongside each offending line.
 */
export async function checkVentures(root) {
  const files = await findShareSources(root);
  /** @type {{file: string, line: number, id: string, why: string, source: string}[]} */
  const findings = [];
  for (const file of files) {
    for (const finding of await checkFile(file)) {
      findings.push({ file, ...finding });
    }
  }
  return { checked: files.length, findings };
}
