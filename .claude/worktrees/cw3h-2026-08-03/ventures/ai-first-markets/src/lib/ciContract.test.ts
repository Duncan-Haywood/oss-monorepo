import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, it } from "node:test";
import assert from "node:assert";

const ROOT = join(process.cwd(), "../..");
const ciPathGitea = join(ROOT, ".gitea/workflows/ai-first-markets-ci.yml");
const ciPathGithub = join(ROOT, ".github/workflows/ai-first-markets-ci.yml");
const ciPath = existsSync(ciPathGitea) ? ciPathGitea : ciPathGithub;

const deployPathGitea = join(ROOT, ".gitea/workflows/ai-first-markets-deploy.yml");
const deployPathGithub = join(ROOT, ".github/workflows/ai-first-markets-deploy.yml");
const deployPath = existsSync(deployPathGitea) ? deployPathGitea : deployPathGithub;

const AI_MARKETS_CI = existsSync(ciPath) ? readFileSync(ciPath, "utf8") : "";
const AI_MARKETS_DEPLOY = existsSync(deployPath) ? readFileSync(deployPath, "utf8") : "";

describe("AI-First Markets CI & Deploy Contract", () => {
  it("triggers CI verification on pull requests and main pushes scoped to AI-First Markets paths", () => {
    assert.ok(AI_MARKETS_CI.includes('"ventures/ai-first-markets/**"'));
    assert.ok(AI_MARKETS_CI.includes("pull_request:"));
    assert.ok(AI_MARKETS_CI.includes("branches: [main]"));
    assert.ok(AI_MARKETS_CI.includes("verify-component.sh ai-first-markets"));
  });

  it("triggers automated production deployment on main pushes when service changes", () => {
    assert.ok(AI_MARKETS_DEPLOY.includes('"ventures/ai-first-markets/**"'));
    assert.ok(AI_MARKETS_DEPLOY.includes("branches: [main]"));
    assert.ok(AI_MARKETS_DEPLOY.includes("workflow_dispatch:"));
    assert.ok(AI_MARKETS_DEPLOY.includes("cancel-in-progress: false"));
  });

  it("requires verification gates before running Cloudflare deployment", () => {
    assert.ok(AI_MARKETS_DEPLOY.includes("npm run typecheck"));
    assert.ok(AI_MARKETS_DEPLOY.includes("npm run lint"));
    assert.ok(AI_MARKETS_DEPLOY.includes("npm run build"));
    assert.ok(AI_MARKETS_DEPLOY.includes("npm run cf:build"));
    assert.ok(AI_MARKETS_DEPLOY.includes("npm run deploy"));
  });

  it("passes required Cloudflare and Auth secrets to the deploy step", () => {
    assert.ok(AI_MARKETS_DEPLOY.includes("CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}"));
    assert.ok(AI_MARKETS_DEPLOY.includes("CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}"));
    assert.ok(AI_MARKETS_DEPLOY.includes("AUTH_SECRET: ${{ secrets.AUTH_SECRET }}"));
  });
});
