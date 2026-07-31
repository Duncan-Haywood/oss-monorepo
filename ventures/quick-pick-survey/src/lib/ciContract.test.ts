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

  it.skipIf(!PAIRWISE_CI)("promotes immutable digests through Git and leaves reconciliation to Argo CD", () => {
    expect(PAIRWISE_CI).toContain("platform/ci/promote-pairwise-gitops.sh");
    expect(PAIRWISE_CI).toContain("PAIRWISE_GITOPS_TOKEN");
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

  it("keeps the CI runner stable without retaining a CI cluster deployer", () => {
    expect(GITEA_RUNNER).toContain("fs.inotify.max_user_instances=1024");
    expect(GITEA_RUNNER).toContain("fs.inotify.max_user_watches=524288");
    expect(PAIRWISE_KUSTOMIZATION).not.toContain("ci-deployer-rbac.yaml");
  });

  it.skipIf(!MONOREPO_CI)("publishes Pairwise images by immutable commit, never a mutable latest tag", () => {
    expect(MONOREPO_CI).not.toMatch(/pairwise:latest/);
  });
});
