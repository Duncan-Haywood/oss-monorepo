import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "../..");
const pairwiseCiPathGitea = join(ROOT, ".gitea/workflows/pairwise-ci.yml");
const pairwiseCiPathGithub = join(ROOT, ".github/workflows/pairwise-ci.yml");
const pairwiseCiPath = existsSync(pairwiseCiPathGitea) ? pairwiseCiPathGitea : pairwiseCiPathGithub;

const monorepoCiPathGitea = join(ROOT, ".gitea/workflows/ci-cd.yml");
const monorepoCiPathGithub = join(ROOT, ".github/workflows/ci-cd.yml");
const monorepoCiPath = existsSync(monorepoCiPathGitea) ? monorepoCiPathGitea : monorepoCiPathGithub;

const PAIRWISE_CI = existsSync(pairwiseCiPath) ? readFileSync(pairwiseCiPath, "utf8") : "";
const MONOREPO_CI = existsSync(monorepoCiPath) ? readFileSync(monorepoCiPath, "utf8") : "";
const PAIRWISE_PROMOTE = readFileSync(join(ROOT, "platform/ci/promote-pairwise-gitops.sh"), "utf8");
const PAIRWISE_WAIT = readFileSync(join(ROOT, "platform/ci/wait-for-pairwise-release.sh"), "utf8");
const PAIRWISE_REPAIR = readFileSync(
  join(ROOT, "platform/ci/report-pairwise-release-failure.sh"),
  "utf8",
);
const GITEA_RUNNER = readFileSync(join(ROOT, "platform/terraform/gitea_runner.tf"), "utf8");
const PAIRWISE_ARGO_APP = readFileSync(
  join(ROOT, "platform/k8s/argocd-apps/quick-pick-survey.yaml"),
  "utf8",
);
const PAIRWISE_KUSTOMIZATION = readFileSync(
  join(ROOT, "platform/k8s/apps/quick-pick-survey/kustomization.yaml"),
  "utf8",
);
const PAIRWISE_HOOKS = readFileSync(
  join(ROOT, "platform/k8s/apps/quick-pick-survey/release-hooks.yaml"),
  "utf8",
);

describe("Pairwise CI contract", () => {
  // Every other assertion in this file is `skipIf(!CI_FILE)`, so renaming or
  // deleting a workflow would not fail this suite — it would empty it, and an
  // empty suite reports success. This test is the one that cannot skip, so the
  // rename shows up as a failure instead of as silence.
  it("has the workflow files the rest of these assertions depend on", () => {
    expect(PAIRWISE_CI, `missing ${pairwiseCiPath}`).not.toBe("");
    expect(MONOREPO_CI, `missing ${monorepoCiPath}`).not.toBe("");
  });

  it("is a repository-root workflow scoped to Pairwise changes", () => {
    if (!PAIRWISE_CI) return;
    expect(PAIRWISE_CI).toContain('"ventures/quick-pick-survey/**"');
    expect(PAIRWISE_CI).toMatch(/workflows\/pairwise-ci\.yml/);
    expect(PAIRWISE_CI).toContain("cancel-in-progress: false");
    expect(PAIRWISE_CI).toContain('"platform/terraform/helm/web-service/**"');
    expect(PAIRWISE_CI).toContain('"platform/terraform/services.tf"');
    expect(PAIRWISE_CI).toContain('"platform/terraform/autoscaling.tf"');
    expect(PAIRWISE_CI).toContain('"platform/terraform/gitea_runner.tf"');
    expect(PAIRWISE_CI).toMatch(/timeout-minutes:\s*20/);
  });

  it("cannot pass by swallowing a required gate", () => {
    if (!PAIRWISE_CI) return;
    for (const source of [PAIRWISE_CI, MONOREPO_CI].filter(Boolean)) {
      expect(source).not.toContain("|| true");
      expect(source).not.toMatch(/continue-on-error:\s*true/);
    }
    for (const command of [
      "npm run typecheck",
      "npm run lint",
      "npm test",
      "npm run build",
      "npm run test:integration",
      "prisma migrate diff",
    ]) {
      expect(PAIRWISE_CI).toContain(command);
    }
  });

  it("checks the database and the deployable artifact", () => {
    if (!PAIRWISE_CI) return;
    expect(PAIRWISE_CI).toContain("image: postgres:16");
    expect(PAIRWISE_CI).toContain("prisma migrate deploy");
    expect(PAIRWISE_CI).toContain("docker build");
    expect(PAIRWISE_CI).toContain("pairwise-container-smoke");
    expect(PAIRWISE_CI).toContain("docker push");
    expect(PAIRWISE_CI).toContain("git.marisstella.dev/giteaadmin/pairwise-app:${{ github.sha }}");

    // Which gates a deployable image is allowed to be built behind, asserted as
    // a set rather than as the literal `needs: [app, database]` this used to
    // match. That literal went red the moment the gate was made *stricter* — a
    // browser-journey job was added and the list grew — which is the failure
    // direction that reads like a regression and gets "fixed" by weakening the
    // gate. Name the gates, not the punctuation.
    const containerNeeds = PAIRWISE_CI.match(/^ {2}container:\n(?:.*\n)*? {4}needs: \[([^\]]+)\]/m)?.[1];
    expect(containerNeeds, "the container job must declare what it waits for").toBeTruthy();
    const gates = (containerNeeds ?? "").split(",").map((name) => name.trim());
    for (const gate of ["app", "database", "journeys"]) {
      expect(gates).toContain(gate);
    }
  });

  it("runs the critical browser journeys before anything deployable is built", () => {
    if (!PAIRWISE_CI) return;
    // docs/ENGINEERING-ROADMAP.md's first "Now" item. A journey suite that no
    // workflow invokes is the repository's recurring failure — declared,
    // reachable, and never executed — so the contract is that the job exists,
    // installs a browser, and runs the suite against a real build.
    expect(PAIRWISE_CI).toContain("  journeys:");
    expect(PAIRWISE_CI).toContain("playwright install");
    expect(PAIRWISE_CI).toContain("npm run test:e2e");
    // Against `next start`, not `next dev`: the same specs have to be able to
    // run on the release candidate.
    const journeysJob = PAIRWISE_CI.match(/^ {2}journeys:\n((?:.*\n)*?)(?=^ {2}[a-z-]+:\n)/m)?.[1] ?? "";
    expect(journeysJob).toContain("npm run build");
    expect(journeysJob).not.toContain("next dev");
    // Failure evidence is part of the gate, not a nicety: a red journey with no
    // trace is a re-run, and a re-run is how a real failure becomes a flake.
    expect(journeysJob).toContain("upload-artifact");
  });

  it("promotes immutable digests through Git and leaves reconciliation to Argo CD", () => {
    if (!PAIRWISE_CI) return;
    expect(PAIRWISE_CI).toContain("platform/ci/promote-pairwise-gitops.sh");
    expect(PAIRWISE_CI).toContain("contents: write");
    expect(PAIRWISE_CI).toContain("persist-credentials: true");
    expect(PAIRWISE_CI).not.toContain("PAIRWISE_GITOPS_TOKEN");
    expect(PAIRWISE_CI).toContain("PAIRWISE_REGISTRY_TOKEN");
    expect(PAIRWISE_CI).toContain("cancel-in-progress: false");
    expect(PAIRWISE_CI).toContain("gitops-production");
    expect(PAIRWISE_CI).not.toContain("HETZNER_KUBECONFIG");
    expect(PAIRWISE_CI).not.toContain("kubectl set image");
    expect(PAIRWISE_PROMOTE).toContain("IMAGE_DIGEST");
    expect(PAIRWISE_PROMOTE).toContain("RELEASE_REVISION");
    expect(PAIRWISE_ARGO_APP).toContain("targetRevision: gitops-production");
    expect(PAIRWISE_ARGO_APP).toContain("selfHeal: true");
    expect(PAIRWISE_ARGO_APP).toContain("RespectIgnoreDifferences=true");
    expect(PAIRWISE_KUSTOMIZATION).toMatch(/digest: sha256:[0-9a-f]{64}/);
    expect(PAIRWISE_KUSTOMIZATION).not.toContain("newTag: latest");
  });

  it("runs migrations before sync and smoke checks after sync on the promoted digest", () => {
    expect(PAIRWISE_HOOKS).toContain("argocd.argoproj.io/hook: PreSync");
    expect(PAIRWISE_HOOKS).toContain("argocd.argoproj.io/hook: PostSync");
    expect(PAIRWISE_HOOKS).toContain("prisma migrate deploy && prisma db seed");
    expect(PAIRWISE_HOOKS).toContain('memory: 512Mi');
    expect(PAIRWISE_HOOKS).toContain('memory: 1Gi');
    expect(PAIRWISE_HOOKS).toContain("/api/health/ready");
    expect(PAIRWISE_HOOKS).toContain("/api/surveys/combined");
    expect(PAIRWISE_HOOKS).toContain("/couple");
  });

  it("verifies the exact live revision and queues bounded repair work", () => {
    if (!PAIRWISE_CI) return;
    expect(PAIRWISE_CI).toContain("verify-production:");
    expect(PAIRWISE_CI).toContain('../../platform/ci/wait-for-pairwise-release.sh "${{ github.sha }}"');
    expect(PAIRWISE_CI).toContain("../../platform/ci/smoke-test-pairwise.sh");
    expect(PAIRWISE_CI).toContain("../../platform/ci/report-pairwise-release-failure.sh");
    expect(PAIRWISE_CI).toContain("if: failure()");
    expect(PAIRWISE_WAIT).toContain('.revision == $revision');
    expect(PAIRWISE_REPAIR).toContain("Repair budget: at most 3 distinct fixes");
    expect(PAIRWISE_REPAIR).toContain("agent pairwise production-smoke");
    expect(PAIRWISE_REPAIR).toContain("Do not weaken a gate");
  });

  it("keeps the CI runner stable without retaining a CI cluster deployer", () => {
    expect(GITEA_RUNNER).toContain("fs.inotify.max_user_instances=1024");
    expect(GITEA_RUNNER).toContain("fs.inotify.max_user_watches=524288");
    expect(PAIRWISE_KUSTOMIZATION).not.toContain("ci-deployer-rbac.yaml");
  });

  it("publishes Pairwise images by immutable commit, never a mutable latest tag", () => {
    if (!MONOREPO_CI) return;
    expect(MONOREPO_CI).not.toMatch(/pairwise:latest/);
  });
});
