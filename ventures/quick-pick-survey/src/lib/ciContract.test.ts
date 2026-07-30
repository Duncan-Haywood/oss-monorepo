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
const PAIRWISE_DEPLOY = readFileSync(join(ROOT, "platform/ci/deploy-pairwise.sh"), "utf8");
const PAIRWISE_SMOKE = readFileSync(join(ROOT, "platform/ci/smoke-test-pairwise.sh"), "utf8");
const GITEA_RUNNER = readFileSync(join(ROOT, "platform/terraform/gitea_runner.tf"), "utf8");
const PAIRWISE_DEPLOYER_RBAC = readFileSync(
  join(ROOT, "platform/k8s/apps/quick-pick-survey/ci-deployer-rbac.yaml"),
  "utf8",
);

describe("Pairwise CI contract", () => {
  it.skipIf(!PAIRWISE_CI)("is a repository-root workflow scoped to Pairwise changes", () => {
    expect(PAIRWISE_CI).toContain('"ventures/quick-pick-survey/**"');
    expect(PAIRWISE_CI).toMatch(/workflows\/pairwise-ci\.yml/);
    expect(PAIRWISE_CI).toContain("cancel-in-progress: false");
    expect(PAIRWISE_CI).toContain('"platform/terraform/helm/web-service/**"');
    expect(PAIRWISE_CI).toContain('"platform/terraform/services.tf"');
    expect(PAIRWISE_CI).toContain('"platform/terraform/autoscaling.tf"');
    expect(PAIRWISE_CI).toContain('"platform/terraform/gitea_runner.tf"');
    expect(PAIRWISE_CI).toMatch(/timeout-minutes:\s*20/);
  });

  it.skipIf(!PAIRWISE_CI)("cannot pass by swallowing a required gate", () => {
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

  it.skipIf(!PAIRWISE_CI)("checks the database and the deployable artifact", () => {
    expect(PAIRWISE_CI).toContain("image: postgres:16");
    expect(PAIRWISE_CI).toContain("prisma migrate deploy");
    expect(PAIRWISE_CI).toContain("docker build");
    expect(PAIRWISE_CI).toContain("pairwise-container-smoke");
    expect(PAIRWISE_CI).toContain("docker push");
    expect(PAIRWISE_CI).toContain("git.marisstella.dev/giteaadmin/pairwise-app:${{ github.sha }}");
    expect(PAIRWISE_CI).toContain("needs: [app, database]");
  });

  it.skipIf(!PAIRWISE_CI)("deploys immutable main images without taking ready replicas offline", () => {
    expect(PAIRWISE_CI).toContain("platform/ci/deploy-pairwise.sh");
    expect(PAIRWISE_CI).toContain("HETZNER_KUBECONFIG");
    expect(PAIRWISE_CI).toContain("PAIRWISE_REGISTRY_TOKEN");
    expect(PAIRWISE_CI).toContain("cancel-in-progress: false");
    expect(PAIRWISE_DEPLOY).toContain("create poddisruptionbudget");
    expect(PAIRWISE_DEPLOY).toContain("maxUnavailable");
    expect(PAIRWISE_DEPLOY).toContain("--type=strategic");
    expect(PAIRWISE_DEPLOY).toContain(".metadata.deletionTimestamp == null");
    expect(PAIRWISE_DEPLOY).toContain("smoke-test-pairwise.sh");
    expect(PAIRWISE_SMOKE).toContain("/api/health/ready");
    expect(PAIRWISE_SMOKE).toContain("/api/surveys/combined");
    expect(PAIRWISE_SMOKE).toContain("/couple");
  });

  it("gives migrations and the idempotent seed enough memory to complete", () => {
    expect(PAIRWISE_DEPLOY).toContain('memory: "512Mi"');
    expect(PAIRWISE_DEPLOY).toContain('memory: "1Gi"');
  });

  it("keeps the CI runner stable and authorizes the zero-downtime rollout contract", () => {
    expect(GITEA_RUNNER).toContain("fs.inotify.max_user_instances=1024");
    expect(GITEA_RUNNER).toContain("fs.inotify.max_user_watches=524288");
    expect(PAIRWISE_DEPLOYER_RBAC).toContain('apiGroups: ["policy"]');
    expect(PAIRWISE_DEPLOYER_RBAC).toContain('resources: ["poddisruptionbudgets"]');
  });

  it.skipIf(!MONOREPO_CI)("publishes Pairwise images by immutable commit, never a mutable latest tag", () => {
    expect(MONOREPO_CI).not.toMatch(/pairwise:latest/);
  });
});
