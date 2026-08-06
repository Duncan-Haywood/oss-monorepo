import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPT = join(REPO, "platform/ci/promote-pairwise-gitops.sh");
const MANIFEST_DIR = "platform/k8s/apps/quick-pick-survey";
const DIGEST = `sha256:${"a".repeat(64)}`;
const ZERO_DIGEST = `sha256:${"0".repeat(64)}`;
const ZERO_REVISION = "0".repeat(40);
const FABRICATED_REVISION = "5fa8a33c10e137bcbb3298ecadcb404c0ec54bb7";

const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

function scratchRepo() {
  const root = mkdtempSync(join(tmpdir(), "promote-provenance-"));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...GIT_ENV },
    });
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  mkdirSync(join(root, MANIFEST_DIR), { recursive: true });
  writeFileSync(join(root, MANIFEST_DIR, "kustomization.yaml"), `images:\n  digest: ${ZERO_DIGEST}\n`);
  writeFileSync(
    join(root, MANIFEST_DIR, "deployment.yaml"),
    `metadata:\n  annotations:\n    pairwise.marisstella.dev/revision: "${ZERO_REVISION}"\nspec:\n  template:\n    metadata:\n      annotations:\n        pairwise.marisstella.dev/revision: "${ZERO_REVISION}"\n`,
  );
  git("add", ".");
  git("commit", "--quiet", "-m", "seed");
  return { root, headSha: git("rev-parse", "HEAD").trim() };
}

function promote(root, revision, options = {}) {
  const bin = join(root, "test-bin");
  mkdirSync(bin, { recursive: true });
  const docker = join(bin, "docker");
  const dockerBody = options.dockerBody ?? `printf '{"Descriptor":{"digest":"%s"}}\\n' "${options.registryDigest ?? DIGEST}"`;
  writeFileSync(docker, `#!/usr/bin/env bash\n${dockerBody}\n`);
  chmodSync(docker, 0o755);
  const imageReference =
    options.imageReference ?? `git.marisstella.dev/giteaadmin/pairwise-app:${revision}`;
  return spawnSync("bash", [SCRIPT], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      ...GIT_ENV,
      IMAGE_DIGEST: DIGEST,
      IMAGE_REFERENCE: imageReference,
      PATH: `${bin}:${process.env.PATH}`,
      RELEASE_REVISION: revision,
    },
  });
}

function manifests(root) {
  return {
    deployment: readFileSync(join(root, MANIFEST_DIR, "deployment.yaml"), "utf8"),
    kustomization: readFileSync(join(root, MANIFEST_DIR, "kustomization.yaml"), "utf8"),
  };
}

function unchanged(root) {
  assert.match(manifests(root).deployment, new RegExp(ZERO_REVISION, "g"));
  assert.match(manifests(root).kustomization, new RegExp(ZERO_DIGEST));
}

test("a well-formed revision that names no commit is refused before writing", () => {
  const { root } = scratchRepo();
  try {
    const run = promote(root, FABRICATED_REVISION);
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /does not name a commit/);
    unchanged(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a real commit and its exact immutable digest are recorded", () => {
  const { root, headSha } = scratchRepo();
  try {
    const run = promote(root, headSha);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(manifests(root).deployment.match(new RegExp(headSha, "g"))?.length, 2);
    assert.match(manifests(root).kustomization, new RegExp(DIGEST));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an object that is not a commit is refused", () => {
  const { root } = scratchRepo();
  try {
    const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], {
      cwd: root,
      input: "not a commit",
      encoding: "utf8",
      env: { ...process.env, ...GIT_ENV },
    }).trim();
    const run = promote(root, blob);
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /does not name a commit/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the guard consults the object database, not only the string", () => {
  const source = readFileSync(SCRIPT, "utf8");
  assert.match(
    source,
    /git cat-file -e "\$\{RELEASE_REVISION\}\^\{commit\}"/,
    "promote-pairwise-gitops.sh no longer asks git whether the revision exists",
  );
});

test("a digest mismatch is refused before writing", () => {
  const { root, headSha } = scratchRepo();
  try {
    const run = promote(root, headSha, { registryDigest: `sha256:${"b".repeat(64)}` });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /Image provenance mismatch/);
    unchanged(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an untrusted repository is refused before registry access", () => {
  const { root, headSha } = scratchRepo();
  try {
    const run = promote(root, headSha, {
      imageReference: `evil.example/anything:${headSha}`,
      dockerBody: "exit 99",
    });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /not the trusted immutable release tag/);
    unchanged(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const [name, dockerBody] of [
  ["registry command failure", "exit 7"],
  ["malformed registry response", "printf 'not-json\\n'"],
  ["empty registry response", "exit 0"],
]) {
  test(`${name} fails closed before writing`, () => {
    const { root, headSha } = scratchRepo();
    try {
      const run = promote(root, headSha, { dockerBody });
      assert.notEqual(run.status, 0);
      assert.match(run.stderr, /Could not resolve immutable image reference/);
      unchanged(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("the promote step supplies registry credentials and the exact SHA tag", () => {
  const workflow = readFileSync(join(REPO, ".gitea/workflows/pairwise-ci.yml"), "utf8");
  const start = workflow.indexOf("- name: Commit the verified digest to the production branch");
  const end = workflow.indexOf("\n  verify-production:", start);
  const promoteStep = workflow.slice(start, end);
  assert.ok(start >= 0 && end > start, "could not isolate the promote step");
  assert.match(promoteStep, /IMAGE_REFERENCE: git\.marisstella\.dev\/giteaadmin\/pairwise-app:\$\{\{ github\.sha \}\}/);
  assert.match(promoteStep, /REGISTRY_TOKEN: \$\{\{ secrets\.PAIRWISE_REGISTRY_TOKEN \}\}/);
  assert.match(promoteStep, /docker login git\.marisstella\.dev/);
  assert.match(promoteStep, /platform\/ci\/promote-pairwise-gitops\.sh/);
});
