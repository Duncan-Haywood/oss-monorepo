// The gap this venture exists to check: a top-level `uses:` reference
// pinned to a commit SHA proves nothing about what THAT reference itself
// loads. A reusable workflow or composite action can reference a third
// action by a mutable tag internally, and the caller's own SHA pin never
// sees it — GitHub's own 2026 Actions security roadmap names exactly this
// gap ("a workflow lockfile... like go.sum but for workflows") as unsolved.
//
// This module is the orchestration: for every top-level PINNED remote
// reference, fetch what it points to and classify ITS `uses:` lines the
// same way. `fetchRef` is injected so tests never touch the network — see
// analyze.test.mjs — and the real network call lives only in check.mjs.

import { scanText, classifyUses, parseRemoteRef, PINNED, MUTABLE } from "./classify.mjs";

export const DEFAULT_MAX_FETCHES = 30;

/**
 * @param {string} text - workflow YAML text
 * @param {object} opts
 * @param {string} [opts.filename]
 * @param {(target: {owner:string, repo:string, ref:string, path:string}) => Promise<string|null>} [opts.fetchRef]
 *   Returns the raw file text, or null if it could not be fetched (404, or
 *   any other failure — this function must never throw for a routine
 *   "not found", only for something the caller should treat as an error).
 * @param {number} [opts.maxFetches] - safety cap on network calls per run.
 */
export async function analyzeWorkflow(text, opts = {}) {
  const { filename = "<workflow>", fetchRef = null, maxFetches = DEFAULT_MAX_FETCHES } = opts;

  const findings = scanText(text, filename);
  const nested = [];

  if (!fetchRef) {
    return { file: filename, findings, nested, checkedTransitive: false, transitiveRiskCount: 0, unresolvedCount: 0 };
  }

  let fetchCount = 0;
  for (const f of findings) {
    // Only a pinned top-level reference can hide an unpinned one underneath
    // it undetected — a mutable top-level reference is already a finding
    // the sibling pinned-actions-check reports, and re-flagging it here
    // would just be a second copy of that tool's own result.
    if (f.classification !== PINNED) continue;

    const parsed = parseRemoteRef(f.action);
    if (!parsed) continue;

    if (fetchCount >= maxFetches) {
      nested.push({ parent: f, kind: parsed.kind, status: "skipped-limit" });
      continue;
    }

    let content = null;
    let triedPath = parsed.candidatePaths[0];
    for (const path of parsed.candidatePaths) {
      if (fetchCount >= maxFetches) break;
      fetchCount += 1;
      triedPath = path;
      try {
        // eslint-disable-next-line no-await-in-loop -- each candidate path
        // depends on whether the previous one resolved; there is nothing
        // to parallelize per reference.
        content = await fetchRef({ owner: parsed.owner, repo: parsed.repo, ref: f.ref, path });
      } catch {
        content = null;
      }
      if (content) break;
    }

    if (content == null) {
      // A JS or Docker action legitimately has no action.yml with `uses:`
      // lines, so "not found" here is not itself a finding — but it is
      // never silently read as "checked and clean" either. See summary().
      nested.push({ parent: f, kind: parsed.kind, status: "unresolved", path: triedPath });
      continue;
    }

    const childFindings = scanText(content, `${f.action}@${f.ref} :: ${triedPath}`);
    const transitivelyUnpinned = childFindings.filter((c) => c.classification === MUTABLE);
    nested.push({
      parent: f,
      kind: parsed.kind,
      status: "resolved",
      path: triedPath,
      findings: childFindings,
      transitivelyUnpinned,
    });
  }

  const transitiveRiskCount = nested.reduce((n, entry) => n + (entry.transitivelyUnpinned?.length || 0), 0);
  const unresolvedCount = nested.filter((e) => e.status === "unresolved" || e.status === "skipped-limit").length;

  return { file: filename, findings, nested, checkedTransitive: true, transitiveRiskCount, unresolvedCount };
}

/** Analyze several files (as check.mjs and the browser page both need to)
 * and roll the per-file reports into one summary. */
export async function analyzeWorkflows(files, opts = {}) {
  const reports = [];
  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop -- fetches are already
    // capped per-file by maxFetches; running files concurrently would only
    // make that cap harder to reason about.
    reports.push(await analyzeWorkflow(file.text, { ...opts, filename: file.name }));
  }
  const transitiveRiskCount = reports.reduce((n, r) => n + r.transitiveRiskCount, 0);
  const unresolvedCount = reports.reduce((n, r) => n + r.unresolvedCount, 0);
  const anyTransitiveChecked = reports.some((r) => r.checkedTransitive);
  return { reports, transitiveRiskCount, unresolvedCount, checkedTransitive: anyTransitiveChecked };
}

/** One-line headline, honest about the difference between "clean" and
 * "could not be checked" — a clean scan is not a security claim (see the
 * disclaimer in README.md and index.html). */
export function summaryLine({ transitiveRiskCount, unresolvedCount, checkedTransitive }) {
  if (!checkedTransitive) {
    return "Transitive check not run (no fetch available) — only the top-level `uses:` lines were classified.";
  }
  const parts = [];
  if (transitiveRiskCount > 0) {
    parts.push(`${transitiveRiskCount} reference${transitiveRiskCount === 1 ? "" : "s"} pinned at the top level but loading an unpinned reference underneath`);
  } else {
    parts.push("no pinned reference was found loading an unpinned reference underneath");
  }
  if (unresolvedCount > 0) {
    parts.push(`${unresolvedCount} could not be fetched, so those are unconfirmed, not clean`);
  }
  return parts.join("; ") + ".";
}
