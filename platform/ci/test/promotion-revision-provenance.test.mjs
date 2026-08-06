// A promotion that records a commit which has never existed.
//
// `platform/ci/promote-pairwise-gitops.sh` writes the annotation that is the
// only record of what serves `pairwise.marisstella.dev`. It validated
// `RELEASE_REVISION` with `[[ "$RELEASE_REVISION" =~ ^[0-9a-f]{40}$ ]]` — a
// check on the shape of the string and nothing else.
//
// Measured 2026-08-05. `origin/gitops-production` recorded
// `pairwise.marisstella.dev/revision: "5fa8a33c10e137bcbb3298ecadcb404c0ec54bb7"`.
// That is forty lowercase hex characters, so it passes the regex exactly. It
// shares its first eight with `5fa8a33c10e109520b32ca735f171691c93376e6`, which
// was `main` when it was written, so it survives a human skim of a diff too. It
// names no object in this repository, and none on the remote: `git fetch origin
// 5fa8a33c10e137bcbb3298ecadcb404c0ec54bb7` answers `upload-pack: not our ref`.
//
// The consequences were exactly the ones the annotation exists to prevent.
// Nothing in the repository could say what was deployed. `deployment_lag.py`
// raised `revision-unresolvable` for the service — and its headline figure read
// `Furthest behind: 0 commits`, because `worst_commits_behind` reduces over
// services whose `commits_behind` was measured, and an unresolvable revision is
// never measured. A fabricated revision therefore produces the *best* possible
// lag number while destroying the record it is made of.
//
// A hash is the one input where a well-formed fabrication cannot be told from
// the real thing by looking. This repository has met that twice already and
// reached the same conclusion both times: `image_tags.py` refuses to accept a
// digest's shape as evidence it pins anything, and
// `fulfillment-order-inputs.ts` refuses `"https://"` for a print file because
// `startsWith` cannot tell a URL from a prefix. The object database is the
// authority for a commit id, so the script must ask it.
//
// What is asserted here is the behaviour, by running the script: a revision
// that does not resolve must be refused, and a revision that does must be
// recorded. The second case matters as much as the first — a check that refuses
// everything would pass a test that only tries the bad input, and this
// repository has shipped that shape of "fix" before.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPT = join(REPO, "platform/ci/promote-pairwise-gitops.sh");

const MANIFEST_DIR = "platform/k8s/apps/quick-pick-survey";
const DIGEST = `sha256:${"a".repeat(64)}`;

/** Forty lowercase hex characters that name no object. The defect's exact shape. */
const FABRICATED_REVISION = "5fa8a33c10e137bcbb3298ecadcb404c0ec54bb7";

/**
 * A throwaway repository carrying the two files the script rewrites.
 *
 * The script resolves its targets through `git rev-parse --show-toplevel`, so it
 * edits whatever repository it is run inside. That is what makes it testable
 * without touching the real manifests.
 */
function scratchRepo() {
  const root = mkdtempSync(join(tmpdir(), "promote-provenance-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });

  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");

  mkdirSync(join(root, MANIFEST_DIR), { recursive: true });
  writeFileSync(
    join(root, MANIFEST_DIR, "kustomization.yaml"),
    `images:\n  digest: sha256:${"0".repeat(64)}\n`,
  );
  writeFileSync(
    join(root, MANIFEST_DIR, "deployment.yaml"),
    [
      "apiVersion: apps/v1",
      "kind: Deployment",
      "metadata:",
      `  annotations:`,
      `    pairwise.marisstella.dev/revision: "${"0".repeat(40)}"`,
      "spec:",
      "  template:",
      "    metadata:",
      "      annotations:",
      `        pairwise.marisstella.dev/revision: "${"0".repeat(40)}"`,
      "",
    ].join("\n"),
  );

  git("add", ".");
  git("commit", "--quiet", "-m", "seed");
  return { root, headSha: git("rev-parse", "HEAD").trim() };
}

function promote(root, revision) {
  return spawnSync("bash", [SCRIPT], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, IMAGE_DIGEST: DIGEST, RELEASE_REVISION: revision },
  });
}

function recordedRevisions(root) {
  const text = readFileSync(join(root, MANIFEST_DIR, "deployment.yaml"), "utf8");
  return [...text.matchAll(/pairwise\.marisstella\.dev\/revision: "([0-9a-f]{40})"/g)].map(
    (m) => m[1],
  );
}

test("a well-formed revision that names no commit is refused", () => {
  const { root } = scratchRepo();
  try {
    const run = promote(root, FABRICATED_REVISION);

    assert.notEqual(
      run.status,
      0,
      `the script accepted ${FABRICATED_REVISION}, which names no object. ` +
        "That is how gitops-production came to record a commit that has never existed.",
    );
    assert.match(run.stderr, /does not name a commit/);

    // Refusing after writing would still leave the fabrication in the file for
    // the surrounding workflow to `git add`.
    assert.deepEqual(
      recordedRevisions(root),
      [`${"0".repeat(40)}`, `${"0".repeat(40)}`],
      "the manifest was modified before the revision was refused",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a revision that resolves to a commit is recorded in both annotations", () => {
  const { root, headSha } = scratchRepo();
  try {
    const run = promote(root, headSha);

    assert.equal(run.status, 0, `refused a real commit: ${run.stderr}`);
    assert.deepEqual(recordedRevisions(root), [headSha, headSha]);
    assert.match(
      readFileSync(join(root, MANIFEST_DIR, "kustomization.yaml"), "utf8"),
      new RegExp(`  digest: ${DIGEST}`),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an id that resolves to a non-commit object is refused", () => {
  const { root } = scratchRepo();
  try {
    // A blob id is also forty hex characters and `git cat-file -e` alone would
    // accept it. Only the `^{commit}` peel distinguishes them, so an id that
    // exists but is not a commit is the mutation that catches dropping it.
    const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], {
      cwd: root,
      input: "not a commit",
      encoding: "utf8",
    }).trim();

    const run = promote(root, blob);

    assert.notEqual(run.status, 0, `the script accepted blob ${blob} as a release revision`);
    assert.match(run.stderr, /does not name a commit/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the guard consults the object database, not only the string", () => {
  // The regex is necessary but was never sufficient, and a future edit that
  // deletes the existence check would leave a script that still looks validated.
  const source = readFileSync(SCRIPT, "utf8");
  assert.match(
    source,
    /git cat-file -e "\$\{RELEASE_REVISION\}\^\{commit\}"/,
    "promote-pairwise-gitops.sh no longer asks git whether the revision exists",
  );
});
