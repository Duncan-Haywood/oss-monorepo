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

describe("Pairwise CI contract", () => {
  it.skipIf(!PAIRWISE_CI)("is a repository-root workflow scoped to Pairwise changes", () => {
    expect(PAIRWISE_CI).toContain('"ventures/quick-pick-survey/**"');
    expect(PAIRWISE_CI).toMatch(/workflows\/pairwise-ci\.yml/);
    expect(PAIRWISE_CI).toContain("cancel-in-progress: true");
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
    expect(PAIRWISE_CI).toContain("docker/build-push-action");
    expect(PAIRWISE_CI).toContain("push: false");
    expect(PAIRWISE_CI).toContain("needs: [app, database]");
  });

  it.skipIf(!MONOREPO_CI)("publishes Pairwise images by immutable commit, never a mutable latest tag", () => {
    expect(MONOREPO_CI).not.toMatch(/pairwise:latest/);
  });
});
