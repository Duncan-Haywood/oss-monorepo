// The whole product logic. `check.py` is a line-for-line port of this file,
// and `classify.test.mjs` shells out to it on the same fixtures to prove the
// two never drift -- same arrangement as `required-checks-drift-check`, for
// the same reason: a browser tool whose verdict disagrees with the CLI a team
// wired into their own pipeline is worse than either one alone.
//
// It parses GitHub Actions workflow YAML with a small indentation scan rather
// than a YAML library, on purpose. Two reasons, and the second is the one that
// matters: a library would drag a dependency into a page that promises to add
// no script, font or network call; and the CLI port has to agree with this
// file exactly, which is far easier to hold true for a scan both sides
// implement identically than for two different YAML parsers' edge cases.
//
// What it deliberately does NOT do is decide whether a workflow is *correct*.
// It reports the five ways a deploying workflow is permitted to apply an older
// revision over a newer one, names the line each is on, and prints the fix.
// Whether a given repository cares is the reader's call.

export const RISK_HIGH = "high";
export const RISK_MEDIUM = "medium";

// Finding ids. Stable strings: `check.py --json` emits these, so anything a
// team wires into their own CI keys off them.
export const NO_CONCURRENCY = "no-concurrency";
export const PER_RUN_GROUP = "per-run-concurrency-group";
export const CANCEL_IN_PROGRESS = "cancel-in-progress-on-deploy";
export const SPLIT_GROUP = "split-concurrency-group";
export const MUTABLE_REF = "mutable-ref-checkout";

// An expression that changes from run to run puts every run in a group of its
// own, so the `concurrency:` block serializes nothing at all. These are the
// contexts that do that. `github.ref` and `github.workflow` are absent on
// purpose -- those are exactly the stable keys a correct group is built from.
const PER_RUN_CONTEXTS = [
  "github.sha",
  "github.run_id",
  "github.run_number",
  "github.run_attempt",
  "github.event.head_commit.id",
  "github.event.after",
  "github.event.pull_request.head.sha",
];

// Job id or name matching any of these is treated as deploying when no
// `environment:` says so outright. Deliberately narrow: a false positive here
// costs a reader their trust in every other finding.
const DEPLOY_WORD_RE = /(^|[-_ ])(deploy|publish|release|promote|rollout|ship)([-_ ]|$)/i;

// `uses:` values that deploy by themselves, whatever the job is called.
const DEPLOY_ACTION_PREFIXES = [
  "actions/deploy-pages",
  "peaceiris/actions-gh-pages",
  "JamesIves/github-pages-deploy-action",
  "aws-actions/amazon-ecs-deploy-task-definition",
  "google-github-actions/deploy-cloudrun",
  "Azure/webapps-deploy",
  "superfly/flyctl-actions",
];

const JOB_KEY_RE = /^(\s*)([A-Za-z0-9_.-]+):\s*(?:#.*)?$/;
const KEYVAL_RE = /^\s*([A-Za-z0-9_.-]+):\s*(.*?)\s*$/;
const USES_RE = /^\s*(?:-\s*)?uses:\s*(\S+)/;
const A_SHA_RE = /^[0-9a-f]{7,40}$/i;

function stripComment(value) {
  // Only strip a `#` that starts a comment -- one inside quotes is data.
  let quote = null;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === "#" && (i === 0 || /\s/.test(value[i - 1]))) {
      return value.slice(0, i);
    }
  }
  return value;
}

function stripQuotes(value) {
  const v = value.trim();
  if (v.length >= 2 && v[0] === v[v.length - 1] && (v[0] === '"' || v[0] === "'")) {
    return v.slice(1, -1);
  }
  return v;
}

function clean(value) {
  return stripQuotes(stripComment(value).trim());
}

function indentOf(line) {
  return line.length - line.replace(/^ +/, "").length;
}

function isContent(line) {
  const t = line.trim();
  return t.length > 0 && !t.startsWith("#");
}

/**
 * The lines of the block introduced at `startIndex` (the header's own index),
 * i.e. every following line indented deeper than the header, stopping at the
 * first content line that is not. Returned with 1-based line numbers so a
 * finding can point the reader at the file.
 */
function blockOf(lines, startIndex) {
  const base = indentOf(lines[startIndex]);
  const out = [];
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (!isContent(lines[i])) {
      out.push({ line: i + 1, text: lines[i] });
      continue;
    }
    if (indentOf(lines[i]) <= base) break;
    out.push({ line: i + 1, text: lines[i] });
  }
  return out;
}

/**
 * Read a `concurrency:` block (or inline scalar) starting at `index`.
 * Returns { group, groupLine, cancel, cancelLine, line } or null.
 */
function readConcurrency(lines, index) {
  const raw = stripComment(lines[index]);
  const inline = raw.replace(/^\s*concurrency:\s*/, "").trim();
  const at = { line: index + 1 };
  if (inline && !inline.startsWith("#")) {
    // `concurrency: my-group` -- the shorthand for a group with no cancel.
    return { group: stripQuotes(inline), groupLine: index + 1, cancel: null, cancelLine: null, ...at };
  }
  let group = null;
  let groupLine = null;
  let cancel = null;
  let cancelLine = null;
  for (const { line, text } of blockOf(lines, index)) {
    if (!isContent(text)) continue;
    const m = KEYVAL_RE.exec(stripComment(text));
    if (!m) continue;
    if (m[1] === "group") {
      group = stripQuotes(m[2]);
      groupLine = line;
    } else if (m[1] === "cancel-in-progress") {
      cancel = clean(m[2]).toLowerCase();
      cancelLine = line;
    }
  }
  return { group, groupLine, cancel, cancelLine, ...at };
}

/**
 * Split a workflow into its jobs. Each carries the id, the declared `name:`,
 * the `environment:` it deploys to (if any), its own `concurrency:`, the
 * `uses:` values in its steps, and any `actions/checkout` `ref:`.
 */
function readJobs(lines) {
  let jobsHeader = null;
  for (let i = 0; i < lines.length; i++) {
    if (isContent(lines[i]) && indentOf(lines[i]) === 0 && /^jobs:\s*(?:#.*)?$/.test(stripComment(lines[i]))) {
      jobsHeader = i;
      break;
    }
  }
  if (jobsHeader === null) return [];

  const body = blockOf(lines, jobsHeader).filter((l) => isContent(l.text));
  if (body.length === 0) return [];
  const jobIndent = Math.min(...body.map((l) => indentOf(l.text)));

  const jobs = [];
  for (const { line, text } of body) {
    if (indentOf(text) !== jobIndent) continue;
    const m = JOB_KEY_RE.exec(stripComment(text));
    if (!m) continue;
    jobs.push({ id: m[2], headerLine: line, headerIndex: line - 1 });
  }

  return jobs.map((job) => {
    const inner = blockOf(lines, job.headerIndex);
    let name = null;
    let environment = null;
    let environmentLine = null;
    let concurrency = null;
    const uses = [];
    const checkoutRefs = [];

    for (let k = 0; k < inner.length; k++) {
      const { line, text } = inner[k];
      if (!isContent(text)) continue;
      const stripped = stripComment(text);
      const kv = KEYVAL_RE.exec(stripped);
      const depth = indentOf(text);
      const jobBodyIndent = Math.min(...inner.filter((l) => isContent(l.text)).map((l) => indentOf(l.text)));

      if (kv && depth === jobBodyIndent) {
        if (kv[1] === "name") name = clean(kv[2]);
        if (kv[1] === "concurrency") concurrency = readConcurrency(lines, line - 1);
        if (kv[1] === "environment") {
          const v = clean(kv[2]);
          environmentLine = line;
          if (v) {
            environment = v;
          } else {
            // `environment:` as a block -- the name is on its own `name:` line.
            for (const sub of blockOf(lines, line - 1)) {
              const sm = KEYVAL_RE.exec(stripComment(sub.text));
              if (sm && sm[1] === "name") {
                environment = clean(sm[2]);
                break;
              }
            }
          }
        }
      }

      const um = USES_RE.exec(stripped);
      if (um) {
        const value = stripQuotes(um[1]);
        uses.push({ line, value });
        if (/^actions\/checkout(@|$)/.test(value)) {
          // The `ref:` belongs to this step's `with:`, which is indented
          // deeper and appears before the next step at the same depth.
          const stepIndent = indentOf(text);
          for (let j = k + 1; j < inner.length; j++) {
            const next = inner[j];
            if (!isContent(next.text)) continue;
            if (indentOf(next.text) <= stepIndent && /^\s*-\s/.test(next.text)) break;
            if (indentOf(next.text) < stepIndent) break;
            const rm = KEYVAL_RE.exec(stripComment(next.text));
            if (rm && rm[1] === "ref") {
              checkoutRefs.push({ line: next.line, value: clean(rm[2]) });
              break;
            }
          }
        }
      }
    }

    return { ...job, name, environment, environmentLine, concurrency, uses, checkoutRefs };
  });
}

function readWorkflowConcurrency(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (!isContent(lines[i])) continue;
    if (indentOf(lines[i]) !== 0) continue;
    if (/^concurrency:/.test(stripComment(lines[i]))) return readConcurrency(lines, i);
  }
  return null;
}

function readWorkflowName(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (!isContent(lines[i]) || indentOf(lines[i]) !== 0) continue;
    const m = KEYVAL_RE.exec(stripComment(lines[i]));
    if (m && m[1] === "name") return clean(m[2]);
  }
  return null;
}

/** Why this job is treated as deploying -- always reported, never implied. */
function deploySignal(job) {
  if (job.environment) return `declares \`environment: ${job.environment}\``;
  for (const u of job.uses) {
    for (const prefix of DEPLOY_ACTION_PREFIXES) {
      if (u.value.toLowerCase().startsWith(prefix.toLowerCase())) {
        return `runs \`${u.value}\``;
      }
    }
  }
  if (DEPLOY_WORD_RE.test(job.id)) return "is named as a deployment by its job id";
  if (job.name && DEPLOY_WORD_RE.test(job.name))
    return `is named as a deployment by its job name ("${job.name}")`;
  return null;
}

function perRunContextsIn(expression) {
  if (!expression) return [];
  const lowered = expression.toLowerCase();
  return PER_RUN_CONTEXTS.filter((ctx) => lowered.includes(ctx.toLowerCase()));
}

/**
 * Scan one workflow file.
 *
 * @param {string} text  the file's contents
 * @param {string} file  a label for the findings (a path, usually)
 * @returns {{file: string, workflow: string|null, deployJobs: Array, findings: Array}}
 */
export function classifyWorkflow(text, file = "workflow.yml") {
  const lines = String(text).split(/\r?\n/);
  const workflow = readWorkflowName(lines);
  const workflowConcurrency = readWorkflowConcurrency(lines);
  const jobs = readJobs(lines);

  const deployJobs = [];
  for (const job of jobs) {
    const signal = deploySignal(job);
    if (signal) deployJobs.push({ ...job, signal });
  }

  const findings = [];
  const add = (f) => findings.push({ file, workflow, ...f });

  for (const job of deployJobs) {
    const effective = job.concurrency || workflowConcurrency;
    const scope = job.concurrency ? "job" : workflowConcurrency ? "workflow" : null;

    if (!effective) {
      add({
        id: NO_CONCURRENCY,
        risk: RISK_HIGH,
        job: job.id,
        line: job.headerLine,
        title: "Deploying job with no concurrency group",
        detail:
          `\`${job.id}\` ${job.signal}, and neither it nor the workflow declares ` +
          `\`concurrency:\`. Two pushes in quick succession run at the same time, and ` +
          `the deployment that lands is whichever finishes last -- not necessarily the ` +
          `newer commit. A slow run started at an older commit can overwrite a newer ` +
          `deployment minutes after it went live.`,
        fix:
          "Add a concurrency group keyed on the deployment target, and queue rather " +
          "than cancel:\n\nconcurrency:\n  group: deploy-" +
          (job.environment || "production") +
          "\n  cancel-in-progress: false",
      });
    } else {
      const perRun = perRunContextsIn(effective.group);
      if (effective.group && perRun.length > 0) {
        add({
          id: PER_RUN_GROUP,
          risk: RISK_HIGH,
          job: job.id,
          line: effective.groupLine || effective.line,
          title: "Concurrency group changes every run, so it serializes nothing",
          detail:
            `The ${scope}-level group is \`${effective.group}\`, which contains ` +
            `\`${perRun.join("`, `")}\`. That value is different on every run, so every ` +
            `run gets a group of its own and no run ever waits for another. This is the ` +
            `same race as having no \`concurrency:\` block at all, except that the block ` +
            `is there and reads as protection -- which is why it survives review.`,
          fix:
            "Key the group on what is being deployed to, not on which run is doing it:" +
            "\n\nconcurrency:\n  group: deploy-" +
            (job.environment || "production") +
            "\n  cancel-in-progress: false",
        });
      }

      if (effective.cancel === "true") {
        add({
          id: CANCEL_IN_PROGRESS,
          risk: RISK_MEDIUM,
          job: job.id,
          line: effective.cancelLine || effective.line,
          title: "cancel-in-progress on a deploying job",
          detail:
            `\`${job.id}\` ${job.signal} and its ${scope}-level concurrency sets ` +
            `\`cancel-in-progress: true\`. That is the right setting for a test run, ` +
            `where the only cost of cancelling is time. A deploy cancelled halfway ` +
            `through has already written part of its change -- half a copied artifact, ` +
            `some of a batch of uploaded files, a migration that ran without the code ` +
            `that expects it -- and nothing re-runs to finish the job.`,
          fix:
            "For a deploy, queue instead of cancelling:\n\n  cancel-in-progress: false" +
            "\n\nThe newer run then waits and applies last, which is the order you want.",
        });
      }
    }

    for (const ref of job.checkoutRefs) {
      if (!ref.value) continue;
      if (A_SHA_RE.test(ref.value)) continue;
      // An expression is not statically decidable -- `${{ github.sha }}` is
      // exactly right and `${{ inputs.branch }}` may not be, and this tool
      // does not guess. Only a literal branch name is reported.
      if (ref.value.includes("${{")) continue;
      add({
        id: MUTABLE_REF,
        risk: RISK_MEDIUM,
        job: job.id,
        line: ref.line,
        title: "Deploying job checks out a moving branch, not the commit that triggered it",
        detail:
          `\`${job.id}\` ${job.signal} and checks out \`ref: ${ref.value}\`. A branch name ` +
          `resolves when the step runs, not when the run was queued, so a job that waits ` +
          `in a queue -- or is re-run later -- deploys whatever that branch points at by ` +
          `then. The commit that was reviewed and the commit that ships are then two ` +
          `different trees, and nothing in the run's own logs says so.`,
        fix:
          "Check out the triggering commit so a queued or re-run job ships what it was " +
          "queued for:\n\n  with:\n    ref: ${{ github.sha }}",
      });
    }
  }

  // Two deploying jobs aimed at the same environment must share a group, or
  // they do not serialize against each other at all.
  const byEnvironment = new Map();
  for (const job of deployJobs) {
    if (!job.environment) continue;
    if (!byEnvironment.has(job.environment)) byEnvironment.set(job.environment, []);
    byEnvironment.get(job.environment).push(job);
  }
  for (const [environment, group] of byEnvironment) {
    if (group.length < 2) continue;
    const expressions = new Set(
      group.map((job) => {
        const effective = job.concurrency || workflowConcurrency;
        return effective && effective.group ? effective.group : "(none)";
      }),
    );
    if (expressions.size > 1) {
      add({
        id: SPLIT_GROUP,
        risk: RISK_HIGH,
        job: group.map((j) => j.id).join(", "),
        line: group[0].headerLine,
        title: `Jobs deploying to \`${environment}\` are in different concurrency groups`,
        detail:
          `\`${group.map((j) => j.id).join("`, `")}\` all deploy to \`${environment}\`, ` +
          `but they resolve to ${expressions.size} different concurrency groups ` +
          `(${[...expressions].map((e) => `\`${e}\``).join(", ")}). A group only ` +
          `serializes runs that share it, so these jobs can reach the same target at the ` +
          `same time and the last writer wins.`,
        fix:
          `Give every job that writes to \`${environment}\` the same group:\n\n` +
          `concurrency:\n  group: deploy-${environment}\n  cancel-in-progress: false`,
      });
    }
  }

  findings.sort((a, b) => (a.line || 0) - (b.line || 0) || a.id.localeCompare(b.id));
  return {
    file,
    workflow,
    deployJobs: deployJobs.map((j) => ({
      id: j.id,
      name: j.name,
      environment: j.environment,
      line: j.headerLine,
      signal: j.signal,
    })),
    findings,
  };
}

/**
 * Scan several workflows and add the cross-file finding a single-file scan
 * cannot see: two workflows deploying the same environment under different
 * groups. This is the case a repository most often gets wrong, because each
 * file is individually correct.
 */
export function classifyAll(files) {
  const reports = files.map(({ name, text }) => classifyWorkflow(text, name));

  const byEnvironment = new Map();
  for (const report of reports) {
    for (const job of report.deployJobs) {
      if (!job.environment) continue;
      if (!byEnvironment.has(job.environment)) byEnvironment.set(job.environment, []);
      byEnvironment.get(job.environment).push({ report, job });
    }
  }

  for (const [environment, entries] of byEnvironment) {
    const fileNames = [...new Set(entries.map((e) => e.report.file))];
    if (fileNames.length < 2) continue;
    // Only report once, on the first file, so a reader is not told the same
    // thing N times.
    const groups = new Map();
    for (const { report, job } of entries) {
      const lines = files.find((f) => f.name === report.file).text.split(/\r?\n/);
      const wf = readWorkflowConcurrency(lines);
      const jobs = readJobs(lines);
      const own = jobs.find((j) => j.id === job.id);
      const effective = (own && own.concurrency) || wf;
      groups.set(report.file, effective && effective.group ? effective.group : "(none)");
    }
    if (new Set(groups.values()).size > 1) {
      // Attach it to the first file that actually deploys to this
      // environment. Hanging a cross-file finding off reports[0] put it under
      // an unrelated workflow, which is how a true finding gets read as noise.
      const host = reports.find((r) => r.file === fileNames[0]) || reports[0];
      host.findings.push({
        file: fileNames.join(", "),
        workflow: null,
        id: SPLIT_GROUP,
        risk: RISK_HIGH,
        job: entries.map((e) => e.job.id).join(", "),
        line: null,
        title: `Two workflows deploy to \`${environment}\` under different concurrency groups`,
        detail:
          `${fileNames.map((f) => `\`${f}\``).join(" and ")} both deploy to ` +
          `\`${environment}\`, resolving to ` +
          `${[...new Set(groups.values())].map((g) => `\`${g}\``).join(" and ")}. Each ` +
          `file is internally consistent, which is why this survives review of either ` +
          `one on its own -- but a group only serializes runs that share it, so a manual ` +
          `deploy and a push-triggered deploy can apply to the same target at once.`,
        fix:
          `Use one group name for the target in every workflow that writes to it:\n\n` +
          `concurrency:\n  group: deploy-${environment}\n  cancel-in-progress: false`,
      });
    }
  }

  return reports;
}

/** Highest risk present, or null. Used by the CLI's exit code. */
export function worstRisk(findings) {
  if (findings.some((f) => f.risk === RISK_HIGH)) return RISK_HIGH;
  if (findings.some((f) => f.risk === RISK_MEDIUM)) return RISK_MEDIUM;
  return null;
}
