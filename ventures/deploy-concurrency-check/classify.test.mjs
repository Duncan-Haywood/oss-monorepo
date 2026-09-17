// The tests that matter here are the ones proving this checker can stay
// QUIET. A scanner that flags every workflow reads as thorough and is worse
// than nothing: a reader who sees a finding on a correct file stops reading
// findings. So each "fires" test below is paired with a "does not fire" test
// on the closest correct workflow, and the parity test at the bottom pins
// check.py to this file on the same fixtures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyWorkflow,
  classifyAll,
  worstRisk,
  NO_CONCURRENCY,
  PER_RUN_GROUP,
  CANCEL_IN_PROGRESS,
  SPLIT_GROUP,
  MUTABLE_REF,
  RISK_HIGH,
  RISK_MEDIUM,
} from "./classify.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const ids = (report) => report.findings.map((f) => f.id).sort();

// ---------------------------------------------------------------- fixtures

const SAFE_DEPLOY = `name: Deploy
on:
  push:
    branches: [main]
concurrency:
  group: deploy-production
  cancel-in-progress: false
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - run: ./deploy.sh
`;

const NO_GROUP = `name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - run: ./deploy.sh
`;

const PER_RUN = `name: Deploy
on:
  push:
    branches: [main]
concurrency:
  group: deploy-\${{ github.sha }}
  cancel-in-progress: false
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - run: ./deploy.sh
`;

const CANCELS = `name: Deploy
on: push
concurrency:
  group: deploy-production
  cancel-in-progress: true
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - run: ./deploy.sh
`;

// A test workflow that cancels is correct, and must stay quiet.
const CI_CANCELS = `name: CI
on: pull_request
concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
`;

const SPLIT = `name: Deploy
on: push
jobs:
  deploy-web:
    runs-on: ubuntu-latest
    environment: production
    concurrency:
      group: deploy-web
      cancel-in-progress: false
    steps:
      - run: ./web.sh
  deploy-api:
    runs-on: ubuntu-latest
    environment: production
    concurrency:
      group: deploy-api
      cancel-in-progress: false
    steps:
      - run: ./api.sh
`;

const MUTABLE = `name: Deploy
on: workflow_dispatch
concurrency:
  group: deploy-production
  cancel-in-progress: false
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main
      - run: ./deploy.sh
`;

const PINNED_SHA = `name: Deploy
on: workflow_dispatch
concurrency:
  group: deploy-production
  cancel-in-progress: false
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ github.sha }}
      - run: ./deploy.sh
`;

// ------------------------------------------------- the checker stays quiet

test("a correctly serialized deploy produces no findings at all", () => {
  const report = classifyWorkflow(SAFE_DEPLOY, "deploy.yml");
  assert.deepEqual(report.findings, []);
  assert.equal(worstRisk(report.findings), null);
});

test("a test workflow that cancels in progress is not a deploy and stays quiet", () => {
  // The single most important negative: `cancel-in-progress: true` is the
  // RIGHT setting here, and a tool that flags it would be flagging correct
  // GitHub Actions practice on most repositories it is pointed at.
  const report = classifyWorkflow(CI_CANCELS, "ci.yml");
  assert.deepEqual(report.deployJobs, []);
  assert.deepEqual(report.findings, []);
});

test("a build job in a deploying workflow is not itself reported", () => {
  const twoJobs = `name: Release
on: push
concurrency:
  group: deploy-production
  cancel-in-progress: false
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: npm run build
  deploy:
    runs-on: ubuntu-latest
    needs: build
    environment: production
    steps:
      - run: ./deploy.sh
`;
  const report = classifyWorkflow(twoJobs, "release.yml");
  assert.deepEqual(
    report.deployJobs.map((j) => j.id),
    ["deploy"],
  );
  assert.deepEqual(report.findings, []);
});

test("a checkout pinned to the triggering sha is not reported", () => {
  const report = classifyWorkflow(PINNED_SHA, "deploy.yml");
  assert.deepEqual(ids(report), []);
});

// ------------------------------------------------------ each finding fires

test("a deploying job with no concurrency anywhere is reported as high risk", () => {
  const report = classifyWorkflow(NO_GROUP, "deploy.yml");
  assert.deepEqual(ids(report), [NO_CONCURRENCY]);
  const [finding] = report.findings;
  assert.equal(finding.risk, RISK_HIGH);
  assert.equal(finding.job, "deploy");
  assert.match(finding.fix, /cancel-in-progress: false/);
  // The finding must point at a real line, or the reader cannot act on it.
  assert.equal(report.findings[0].line, 6);
});

test("a per-run concurrency group is reported, and says why it reads as protection", () => {
  const report = classifyWorkflow(PER_RUN, "deploy.yml");
  assert.deepEqual(ids(report), [PER_RUN_GROUP]);
  const [finding] = report.findings;
  assert.equal(finding.risk, RISK_HIGH);
  assert.match(finding.detail, /github\.sha/);
  assert.match(finding.detail, /reads as protection/);
});

test("every per-run context is detected, not only github.sha", () => {
  for (const ctx of [
    "github.run_id",
    "github.run_number",
    "github.run_attempt",
    "github.event.head_commit.id",
    "github.event.after",
    "github.event.pull_request.head.sha",
  ]) {
    const text = PER_RUN.replace("github.sha", ctx);
    const report = classifyWorkflow(text, "deploy.yml");
    assert.deepEqual(ids(report), [PER_RUN_GROUP], `${ctx} was not detected`);
  }
});

test("github.ref and github.workflow are NOT treated as per-run", () => {
  // These are exactly the stable keys a correct group is built from. Reading
  // them as per-run would make the tool fire on the recommended pattern.
  for (const ctx of ["github.ref", "github.workflow", "github.ref_name"]) {
    const text = PER_RUN.replace("github.sha", ctx);
    const report = classifyWorkflow(text, "deploy.yml");
    assert.deepEqual(ids(report), [], `${ctx} was wrongly reported`);
  }
});

test("cancel-in-progress on a deploy is reported as medium risk", () => {
  const report = classifyWorkflow(CANCELS, "deploy.yml");
  assert.deepEqual(ids(report), [CANCEL_IN_PROGRESS]);
  assert.equal(report.findings[0].risk, RISK_MEDIUM);
  assert.match(report.findings[0].detail, /halfway/);
});

test("two jobs deploying one environment under different groups are reported", () => {
  const report = classifyWorkflow(SPLIT, "deploy.yml");
  assert.ok(ids(report).includes(SPLIT_GROUP));
  const finding = report.findings.find((f) => f.id === SPLIT_GROUP);
  assert.equal(finding.risk, RISK_HIGH);
  assert.match(finding.detail, /deploy-web/);
  assert.match(finding.detail, /deploy-api/);
});

test("two jobs deploying one environment under the SAME group are not reported", () => {
  const shared = SPLIT.replace("group: deploy-api", "group: deploy-web");
  const report = classifyWorkflow(shared, "deploy.yml");
  assert.equal(
    report.findings.filter((f) => f.id === SPLIT_GROUP).length,
    0,
  );
});

test("a deploying job checking out a moving branch is reported", () => {
  const report = classifyWorkflow(MUTABLE, "deploy.yml");
  assert.deepEqual(ids(report), [MUTABLE_REF]);
  assert.equal(report.findings[0].risk, RISK_MEDIUM);
  assert.match(report.findings[0].fix, /github\.sha/);
});

// ------------------------------------------------ how a job counts as deploy

test("the deploy signal is always named, never implied", () => {
  // A reader who cannot tell WHY a job was treated as deploying cannot tell a
  // true finding from a false one, which is how a scanner loses its audience.
  const byEnvironment = classifyWorkflow(NO_GROUP, "d.yml").deployJobs[0];
  assert.match(byEnvironment.signal, /environment: production/);

  const byName = classifyWorkflow(
    `name: X
on: push
jobs:
  publish-docs:
    runs-on: ubuntu-latest
    steps:
      - run: ./x.sh
`,
    "d.yml",
  ).deployJobs[0];
  assert.match(byName.signal, /is named as a deployment by its job id/);

  const byAction = classifyWorkflow(
    `name: X
on: push
jobs:
  site:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/deploy-pages@v4
`,
    "d.yml",
  ).deployJobs[0];
  assert.match(byAction.signal, /actions\/deploy-pages@v4/);
});

test("an ordinary job name is not mistaken for a deployment", () => {
  // `undeploy-docs` and `redeployment-notes` both contain the substring
  // "deploy"; the word-boundary rule is what keeps them out, and without it
  // this tool would fire on jobs that deploy nothing.
  for (const id of ["build", "test", "lint", "redeployment-notes", "undeploy-docs"]) {
    const text = `name: X
on: push
jobs:
  ${id}:
    runs-on: ubuntu-latest
    steps:
      - run: ./x.sh
`;
    const report = classifyWorkflow(text, "d.yml");
    assert.deepEqual(
      report.deployJobs.map((j) => j.id),
      [],
      `${id} was wrongly treated as a deploy`,
    );
  }
});

test("an environment declared as a block, not a scalar, is still read", () => {
  const blockForm = `name: Deploy
on: push
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://example.com
    steps:
      - run: ./deploy.sh
`;
  const report = classifyWorkflow(blockForm, "deploy.yml");
  assert.equal(report.deployJobs[0].environment, "production");
  assert.deepEqual(ids(report), [NO_CONCURRENCY]);
});

test("the shorthand `concurrency: name` is read as a group", () => {
  const shorthand = NO_GROUP.replace("jobs:", "concurrency: deploy-production\njobs:");
  const report = classifyWorkflow(shorthand, "deploy.yml");
  assert.deepEqual(ids(report), []);
});

test("a job-level concurrency overrides the workflow-level one", () => {
  const overridden = `name: Deploy
on: push
concurrency:
  group: deploy-\${{ github.sha }}
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    concurrency:
      group: deploy-production
      cancel-in-progress: false
    steps:
      - run: ./deploy.sh
`;
  const report = classifyWorkflow(overridden, "deploy.yml");
  assert.deepEqual(ids(report), [], "the job's own correct group should win");
});

test("a comment containing a per-run context is not read as configuration", () => {
  const commented = `name: Deploy
on: push
concurrency:
  # do not key this on \${{ github.sha }} -- see the incident writeup
  group: deploy-production
  cancel-in-progress: false
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - run: ./deploy.sh
`;
  assert.deepEqual(ids(classifyWorkflow(commented, "deploy.yml")), []);
});

test("an empty or non-workflow input reports nothing rather than throwing", () => {
  for (const text of ["", "\n\n", "# just a comment\n", "not: a workflow\n"]) {
    const report = classifyWorkflow(text, "x.yml");
    assert.deepEqual(report.findings, []);
    assert.deepEqual(report.deployJobs, []);
  }
});

// -------------------------------------------------------- across two files

test("two workflows deploying one environment under different groups are reported", () => {
  // Each file is individually correct, which is exactly why this survives a
  // review of either one on its own.
  const push = `name: Deploy on push
on: push
concurrency:
  group: deploy-on-push
  cancel-in-progress: false
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - run: ./deploy.sh
`;
  const manual = `name: Deploy manually
on: workflow_dispatch
concurrency:
  group: manual-deploy
  cancel-in-progress: false
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - run: ./deploy.sh
`;
  const reports = classifyAll([
    { name: "push.yml", text: push },
    { name: "manual.yml", text: manual },
  ]);
  const all = reports.flatMap((r) => r.findings);
  const cross = all.find((f) => f.id === SPLIT_GROUP);
  assert.ok(cross, "the cross-file race was not reported");
  assert.match(cross.file, /push\.yml, manual\.yml/);
  assert.match(cross.detail, /deploy-on-push/);
  assert.match(cross.detail, /manual-deploy/);
});

test("two workflows sharing one group for one environment are not reported", () => {
  const body = (name) => `name: ${name}
on: push
concurrency:
  group: deploy-production
  cancel-in-progress: false
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - run: ./deploy.sh
`;
  const reports = classifyAll([
    { name: "a.yml", text: body("A") },
    { name: "b.yml", text: body("B") },
  ]);
  assert.deepEqual(
    reports.flatMap((r) => r.findings),
    [],
  );
});

// --------------------------------------------------------------- CLI parity

test("check.py agrees with this module on every fixture", () => {
  const fixtures = {
    "safe.yml": SAFE_DEPLOY,
    "no-group.yml": NO_GROUP,
    "per-run.yml": PER_RUN,
    "cancels.yml": CANCELS,
    "ci-cancels.yml": CI_CANCELS,
    "split.yml": SPLIT,
    "mutable.yml": MUTABLE,
    "pinned.yml": PINNED_SHA,
  };
  const dir = mkdtempSync(join(tmpdir(), "deploy-concurrency-"));
  try {
    for (const [name, text] of Object.entries(fixtures)) {
      const path = join(dir, name);
      writeFileSync(path, text);

      const mine = classifyWorkflow(text, name);
      const raw = execFileSync("python3", [join(HERE, "check.py"), path, "--json"], {
        encoding: "utf-8",
      });
      const theirs = JSON.parse(raw);

      assert.deepEqual(
        theirs.findings.map((f) => [f.id, f.risk, f.job, f.line]),
        mine.findings.map((f) => [f.id, f.risk, f.job, f.line]),
        `check.py disagrees with classify.mjs on ${name}`,
      );
      assert.deepEqual(
        theirs.deploy_jobs.map((j) => [j.id, j.environment, j.signal]),
        mine.deployJobs.map((j) => [j.id, j.environment, j.signal]),
        `check.py found different deploy jobs in ${name}`,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("check.py exits 1 on a high-risk finding and 0 on a clean file", () => {
  const dir = mkdtempSync(join(tmpdir(), "deploy-concurrency-exit-"));
  try {
    const clean = join(dir, "clean.yml");
    writeFileSync(clean, SAFE_DEPLOY);
    execFileSync("python3", [join(HERE, "check.py"), clean, "--fail-on-risk"], {
      encoding: "utf-8",
    });

    const racy = join(dir, "racy.yml");
    writeFileSync(racy, NO_GROUP);
    assert.throws(
      () =>
        execFileSync("python3", [join(HERE, "check.py"), racy, "--fail-on-risk"], {
          encoding: "utf-8",
          stdio: "pipe",
        }),
      /Command failed/,
      "a high-risk finding must fail the build when asked to",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
