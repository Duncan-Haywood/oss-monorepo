// The branch classifier, in the browser.
//
// This is a deliberate line-by-line port of `scan()` and its output writers in
// `src/branch_hygiene.py`. The CLI and this page must never disagree about what
// a branch is, because the whole product promise is that a `merged` row is a
// delete *candidate* and a `shared`/`moved-tip`/`uncertain` row is not. Two
// implementations that drift produce a report a reviewer trusts and a page that
// contradicts it, which is worse than having only one of them.
//
// `scan.test.mjs` pins the port against the same fixtures the Python tests use.
// If you change a classification rule, change it in both files in one commit.
//
// Nothing here touches the network, and nothing reads a repository. The input
// is a snapshot the customer produced themselves, on their own machine, with
// their own credentials.

/** Review instructions. Never an executable Git operation — see the CLI's `review_action`. */
export const REVIEW_ACTIONS = {
  merged: 'review-delete-candidate',
  'moved-tip': 'preserve-and-review',
  active: 'preserve-active-work',
  protected: 'do-not-delete',
  shared: 'preserve-shared-ref',
  uncertain: 'investigate-missing-pr-record',
};

/** Classifications that mean a human must look before any cleanup runs (CLI exit 2). */
export const RISK_CLASSIFICATIONS = new Set(['shared', 'moved-tip', 'uncertain']);

/** Shared with the CLI's `CSV_COLUMNS` so the file and this page are the same table. */
export const CSV_COLUMNS = ['branch', 'tip', 'classification', 'review_action', 'reason', 'commit_count'];

/**
 * Parse pasted text into a snapshot object.
 *
 * Kept separate from `scan` so the page can tell "that is not JSON" apart from
 * "that is JSON but not a snapshot" — the two need different advice, and a
 * single "invalid input" message sends people to re-copy a file that was fine.
 */
export function parseSnapshot(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) throw new Error('Nothing to scan. Paste a snapshot, or load the worked example.');
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`That is not valid JSON (${error.message}). Paste the whole file, including the outermost { }.`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('A snapshot is a JSON object with "branches" and "pull_requests" arrays.');
  }
  return parsed;
}

/**
 * Classify every branch in a snapshot.
 *
 * Mirrors `scan()` in `src/branch_hygiene.py`, including the order the rules are
 * tested in. That order is load-bearing: `protected` is checked before `shared`
 * so a protected branch someone also pointed a second ref at still reports
 * `do-not-delete` rather than the weaker `preserve-shared-ref`.
 */
export function scan(snapshot) {
  const branches = snapshot?.branches;
  const pullRequests = snapshot?.pull_requests;
  if (!Array.isArray(branches) || !Array.isArray(pullRequests)) {
    throw new Error('snapshot requires branches and pull_requests arrays');
  }
  const protectedNames = new Set(
    Array.isArray(snapshot.protected_branches) ? snapshot.protected_branches : [],
  );

  const byHead = new Map();
  for (const pr of pullRequests) {
    if (pr && typeof pr === 'object' && typeof pr.head === 'string') {
      if (!byHead.has(pr.head)) byHead.set(pr.head, []);
      byHead.get(pr.head).push(pr);
    }
  }

  const tips = new Map();
  for (const branch of branches) {
    if (!branch || typeof branch !== 'object' || typeof branch.name !== 'string' || typeof branch.tip !== 'string') {
      throw new Error('each branch requires string name and tip');
    }
    const commits = branch.commits ?? [];
    if (!Array.isArray(commits) || !commits.every((commit) => typeof commit === 'string')) {
      throw new Error(`invalid commits for ${branch.name}`);
    }
    if (!tips.has(branch.tip)) tips.set(branch.tip, []);
    tips.get(branch.tip).push(branch.name);
  }

  return branches.map((branch) => {
    const { name, tip } = branch;
    const commits = branch.commits ?? [];
    const records = byHead.get(name) ?? [];
    // A reused branch name can carry more than one PR record (an old closed or
    // merged PR plus a new open one). An open record always wins, so active work
    // never inherits a stale closed record and lands as a delete candidate.
    const related = records.find((record) => record.state === 'open')
      ?? (records.length ? records[records.length - 1] : null);

    let classification;
    let reason;
    if (protectedNames.has(name)) {
      classification = 'protected';
      reason = 'branch is explicitly protected';
    } else if (tips.get(tip).length > 1) {
      classification = 'shared';
      reason = 'tip is referenced by multiple branches';
    } else if (related && related.state === 'closed' && related.merged) {
      const baseCommits = Array.isArray(related.base_commits) ? related.base_commits : [];
      if (baseCommits.includes(tip)) {
        classification = 'merged';
        reason = 'closed pull request was merged and tip is in its base history';
      } else {
        classification = 'moved-tip';
        reason = 'merged pull request branch tip is outside the recorded base history';
      }
    } else if (related && related.state === 'closed') {
      classification = 'moved-tip';
      reason = 'closed pull request is not merged; preserve until reviewed';
    } else if (related && related.state === 'open') {
      classification = 'active';
      reason = 'pull request is still open';
    } else {
      classification = 'uncertain';
      reason = 'no pull request record was supplied';
    }

    return { branch: name, tip, classification, reason, commits, review_action: REVIEW_ACTIONS[classification] };
  });
}

/** Whether this snapshot needs human review before any cleanup — the CLI's exit-2 condition. */
export function hasUnresolvedRisk(findings) {
  return findings.some((finding) => RISK_CLASSIFICATIONS.has(finding.classification));
}

/** Counts per classification, in the sorted order the CLI's report header uses. */
export function classificationCounts(findings) {
  const counts = {};
  for (const finding of findings) {
    counts[finding.classification] = (counts[finding.classification] ?? 0) + 1;
  }
  return counts;
}

/** Byte-for-byte the CLI's `--report` text, so a pasted snapshot and a local run agree. */
export function reportText(findings) {
  const counts = classificationCounts(findings);
  const lines = [
    'Repository branch hygiene report',
    '',
    'Approval queue: review every finding before any Git operation.',
    '',
    'Counts: ' + Object.keys(counts).sort().map((key) => `${key}=${counts[key]}`).join(', '),
  ];
  for (const finding of findings) {
    lines.push(`- [${finding.classification}] ${finding.branch} (${finding.tip}): ${finding.reason}; action=${finding.review_action}`);
  }
  return lines.join('\n') + '\n';
}

/** The CLI's `--manifest` document. `format: 2` matches `write_outputs`. */
export function recoveryManifest(findings) {
  return {
    format: 2,
    read_only: true,
    approval_required: true,
    findings: findings.map((finding) => ({
      branch: finding.branch,
      tip: finding.tip,
      classification: finding.classification,
      reason: finding.reason,
      commits: finding.commits,
      review_action: finding.review_action,
    })),
  };
}

/**
 * The CLI's `--csv` approval queue.
 *
 * A branch name may legally contain a comma, so fields are quoted the way
 * Python's `csv.writer` quotes them: only when they must be, doubling any
 * embedded quote. An unquoted comma here would silently shift every later
 * column in a reviewer's spreadsheet.
 */
export function csvText(findings) {
  const cell = (value) => {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rows = [CSV_COLUMNS.join(',')];
  for (const finding of findings) {
    rows.push([
      finding.branch,
      finding.tip,
      finding.classification,
      finding.review_action,
      finding.reason,
      finding.commits.length,
    ].map(cell).join(','));
  }
  return rows.join('\n') + '\n';
}

/** One-line headline for the page, phrased so it can never read as clearance to delete. */
export function summaryLine(findings) {
  if (!findings.length) return 'No branches in that snapshot';
  const counts = classificationCounts(findings);
  const candidates = counts.merged ?? 0;
  if (hasUnresolvedRisk(findings)) {
    const needing = findings.filter((finding) => RISK_CLASSIFICATIONS.has(finding.classification)).length;
    return `${needing} of ${findings.length} branches need a human look first`;
  }
  return `No unresolved ambiguity — ${candidates} delete candidate${candidates === 1 ? '' : 's'} to review`;
}
