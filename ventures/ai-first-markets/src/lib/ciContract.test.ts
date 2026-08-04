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

const verifyPath = join(ROOT, "scripts/ci/verify-component.sh");

const AI_MARKETS_CI = existsSync(ciPath) ? readFileSync(ciPath, "utf8") : "";
const AI_MARKETS_DEPLOY = existsSync(deployPath) ? readFileSync(deployPath, "utf8") : "";
const VERIFY_COMPONENT = existsSync(verifyPath) ? readFileSync(verifyPath, "utf8") : "";

/**
 * The gate sequence `verify-component.sh` runs for one component.
 *
 * Sliced from the component's own `case` arm so that a gate present only in
 * another component's arm — every arm runs a `typecheck` — cannot vouch for
 * this one.
 */
function verifyGatesFor(component: string): string {
  const start = VERIFY_COMPONENT.indexOf(`\n  ${component})`);
  assert.ok(start !== -1, `scripts/ci/verify-component.sh has no ${component} case`);
  const end = VERIFY_COMPONENT.indexOf("\n    ;;", start);
  assert.ok(end !== -1, `the ${component} case in scripts/ci/verify-component.sh is not terminated`);
  return VERIFY_COMPONENT.slice(start, end);
}

describe("AI-First Markets CI & Deploy Contract", () => {
  it("triggers CI verification on pull requests and main pushes scoped to AI-First Markets paths", () => {
    assert.ok(AI_MARKETS_CI.includes('"ventures/ai-first-markets/**"'));
    assert.ok(AI_MARKETS_CI.includes("pull_request:"));
    assert.ok(AI_MARKETS_CI.includes("branches: [main]"));
    assert.ok(AI_MARKETS_CI.includes("verify-component.sh ai-first-markets"));
  });

  it("keeps production promotion manual, owner-approved and off the push path", () => {
    // This assertion used to require a `push: branches: [main]` trigger on the
    // deploy workflow. 2fdcf83 removed that trigger deliberately, and said so
    // in the file it removed it from: docs/QUALITY-ENGINEERING.md holds that a
    // production UI service without an automated candidate browser suite is
    // not eligible for automatic promotion, and this venture has no browser
    // suite. The same commit replaced the trigger with a `workflow_dispatch`
    // carrying four required exception inputs and a validation step that fails
    // the run if they are not a real, bounded, owner-approved exception.
    //
    // So the workflow was right and this contract was stale — it was written
    // on 2026-08-01 against the shape the workflow had then. Restoring the
    // push trigger to satisfy it would have re-armed exactly the automatic
    // promotion the policy forbids. What the contract should hold is the shape
    // the workflow deliberately has, and that is what it now holds: manual
    // only, and the absence of the push trigger is itself asserted so that
    // re-adding one fails here instead of shipping quietly.
    const triggers = AI_MARKETS_DEPLOY.slice(
      AI_MARKETS_DEPLOY.indexOf("\non:"),
      AI_MARKETS_DEPLOY.indexOf("\npermissions:"),
    );
    assert.ok(triggers.length > 0, "the deploy workflow has no trigger block to read");
    for (const automatic of ["push:", "pull_request:", "schedule:"]) {
      assert.ok(
        !triggers.includes(automatic),
        `the deploy workflow gained a ${automatic} trigger, so production promotion became automatic again; that requires a candidate browser suite first (docs/QUALITY-ENGINEERING.md)`,
      );
    }
    assert.ok(
      triggers.includes("workflow_dispatch:"),
      "the deploy workflow can no longer be started at all",
    );

    for (const input of [
      "quality_exception",
      "exception_issue",
      "exception_evidence",
      "exception_expires",
    ]) {
      assert.ok(
        triggers.includes(`${input}:`),
        `the manual deploy no longer asks for ${input}, so the exception it runs under is unrecorded`,
      );
    }

    // The inputs are only a form until something refuses the run when they are
    // not filled in honestly.
    assert.ok(
      AI_MARKETS_DEPLOY.includes("validate-release-exception.sh"),
      "nothing validates the release exception the manual deploy is granted under",
    );
    assert.ok(
      AI_MARKETS_DEPLOY.includes("inputs.quality_exception == 'APPROVED'"),
      "the deploy job no longer requires the owner's approval to run",
    );
    assert.ok(
      AI_MARKETS_DEPLOY.includes("github.ref == 'refs/heads/main'"),
      "the deploy job would run from a branch other than main",
    );
    assert.ok(AI_MARKETS_DEPLOY.includes("cancel-in-progress: false"));
  });

  it("still verifies this venture's paths automatically, on the CI workflow", () => {
    // The deploy workflow no longer watches the venture's paths, so the claim
    // "a change here is checked automatically" now rests entirely on the CI
    // workflow. If that scoping were ever dropped too, nothing automatic would
    // look at this venture at all.
    assert.ok(AI_MARKETS_CI.includes('"ventures/ai-first-markets/**"'));
    assert.ok(AI_MARKETS_CI.includes("push:"));
    assert.ok(AI_MARKETS_CI.includes("pull_request:"));
  });

  it("requires verification gates before running Cloudflare deployment", () => {
    // These gates were once inlined in this workflow, and while inlined the
    // sequence lost `npm test` without anyone noticing. They now live in one
    // script that this workflow, the CI workflow and the pre-push hook all
    // call. So this contract follows that indirection instead of grepping the
    // workflow for the commands: grepping reads "moved into the shared script"
    // as "deleted", which is how this test came to fail against a deploy path
    // that had just been made stricter.
    const verifyStep = AI_MARKETS_DEPLOY.indexOf("verify-component.sh ai-first-markets");
    const deployStep = AI_MARKETS_DEPLOY.indexOf("npm run deploy");
    assert.ok(verifyStep !== -1, "the deploy workflow no longer runs the shared verification gate");
    assert.ok(deployStep !== -1, "the deploy workflow no longer runs the Cloudflare deploy");
    assert.ok(
      verifyStep < deployStep,
      "the verification gate must run before the Cloudflare deploy, not after it",
    );

    // `npm test` is listed here deliberately: it is the gate the inlined
    // sequence lost, and the one this file exists to keep.
    const gates = verifyGatesFor("ai-first-markets");
    for (const gate of [
      "npm run typecheck",
      "npm run lint",
      "npm test",
      "npm run build",
      "npm run cf:build",
    ]) {
      assert.ok(
        gates.includes(gate),
        `verify-component.sh no longer runs ${gate} for ai-first-markets, so the deploy no longer depends on it`,
      );
    }
  });

  it("passes required Cloudflare and Auth secrets to the deploy step", () => {
    assert.ok(AI_MARKETS_DEPLOY.includes("CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}"));
    assert.ok(AI_MARKETS_DEPLOY.includes("CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}"));
    assert.ok(AI_MARKETS_DEPLOY.includes("AUTH_SECRET: ${{ secrets.AUTH_SECRET }}"));
  });
});
