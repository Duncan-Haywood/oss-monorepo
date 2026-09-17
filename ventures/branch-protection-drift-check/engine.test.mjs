import test from "node:test";
import assert from "node:assert/strict";
import {
  compare,
  hasDrift,
  isUnprotected,
  summaryLine,
  parsePolicyText,
  parseActualText,
  DRIFT,
  OK,
  STRONGER,
  NOT_POLICED,
} from "./engine.mjs";

const FULLY_PROTECTED = {
  required_pull_request_reviews: {
    required_approving_review_count: 2,
    require_code_owner_reviews: true,
    require_last_push_approval: true,
  },
  enforce_admins: { enabled: true },
  allow_force_pushes: { enabled: false },
  allow_deletions: { enabled: false },
  required_conversation_resolution: { enabled: true },
  required_linear_history: { enabled: true },
  required_signatures: { enabled: true },
  required_status_checks: { strict: true, contexts: ["build", "lint", "test"] },
};

const STRICT_POLICY = {
  required_approving_review_count: 2,
  require_code_owner_reviews: true,
  require_last_push_approval: true,
  enforce_admins: true,
  allow_force_pushes: false,
  allow_deletions: false,
  required_conversation_resolution: true,
  required_linear_history: true,
  required_signatures: true,
  strict_status_checks: true,
  required_status_check_contexts: ["build", "lint"],
};

test("a repo that fully matches its policy reports no drift", () => {
  const rows = compare(FULLY_PROTECTED, STRICT_POLICY);
  assert.equal(hasDrift(rows), false);
  assert.ok(rows.every((r) => r.status === OK || r.status === STRONGER));
  assert.match(summaryLine(rows, FULLY_PROTECTED), /No drift/);
});

test("a rule the policy never mentions is not-policed, not silently passed or failed", () => {
  const rows = compare(FULLY_PROTECTED, {});
  assert.ok(rows.every((r) => r.status === NOT_POLICED));
  assert.equal(hasDrift(rows), false);
});

test("disabling admin enforcement after the policy demanded it is drift", () => {
  const weakened = { ...FULLY_PROTECTED, enforce_admins: { enabled: false } };
  const rows = compare(weakened, STRICT_POLICY);
  const row = rows.find((r) => r.key === "enforce_admins");
  assert.equal(row.status, DRIFT);
  assert.equal(hasDrift(rows), true);
});

test("fewer required reviews than policy demands is drift; more is stronger, not drift", () => {
  const fewer = compare(
    { ...FULLY_PROTECTED, required_pull_request_reviews: { ...FULLY_PROTECTED.required_pull_request_reviews, required_approving_review_count: 1 } },
    STRICT_POLICY,
  );
  assert.equal(fewer.find((r) => r.key === "required_approving_review_count").status, DRIFT);

  const more = compare(
    { ...FULLY_PROTECTED, required_pull_request_reviews: { ...FULLY_PROTECTED.required_pull_request_reviews, required_approving_review_count: 3 } },
    STRICT_POLICY,
  );
  assert.equal(more.find((r) => r.key === "required_approving_review_count").status, STRONGER);
  assert.equal(hasDrift(more), false);
});

test("force pushes turned on when the policy forbids them is drift; turning them off when policy allows them is stronger", () => {
  const forcePushesOn = compare({ ...FULLY_PROTECTED, allow_force_pushes: { enabled: true } }, STRICT_POLICY);
  assert.equal(forcePushesOn.find((r) => r.key === "allow_force_pushes").status, DRIFT);

  const stricterThanAllowed = compare(FULLY_PROTECTED, { ...STRICT_POLICY, allow_force_pushes: true });
  assert.equal(stricterThanAllowed.find((r) => r.key === "allow_force_pushes").status, STRONGER);
});

test("a missing required status check context is named individually", () => {
  const missingLint = {
    ...FULLY_PROTECTED,
    required_status_checks: { strict: true, contexts: ["build"] },
  };
  const rows = compare(missingLint, STRICT_POLICY);
  const row = rows.find((r) => r.key === "required_status_check_contexts");
  assert.equal(row.status, DRIFT);
  assert.deepEqual(row.missing, ["lint"]);
});

test("an extra actual status check not in the policy is stronger, not drift", () => {
  const rows = compare(FULLY_PROTECTED, STRICT_POLICY);
  const row = rows.find((r) => r.key === "required_status_check_contexts");
  assert.equal(row.status, STRONGER);
  assert.deepEqual(row.extra, ["test"]);
});

test("an unprotected branch (empty object) reads every policed rule as drift", () => {
  const rows = compare({}, STRICT_POLICY);
  assert.ok(hasDrift(rows));
  assert.equal(isUnprotected({}), true);
  assert.match(summaryLine(rows, {}), /no protection configured/);
});

test("GitHub's own 'not protected' 404 payload is treated the same as an empty object", () => {
  assert.equal(isUnprotected({ message: "Branch not protected", documentation_url: "x" }), true);
});

test("parsePolicyText accepts JSON", () => {
  const parsed = parsePolicyText('{"enforce_admins": true, "required_approving_review_count": 2}');
  assert.equal(parsed.enforce_admins, true);
  assert.equal(parsed.required_approving_review_count, 2);
});

test("parsePolicyText falls back to plain key: value lines, including comma lists", () => {
  const parsed = parsePolicyText(`
    # required policy
    enforce_admins: true
    allow_force_pushes: false
    required_approving_review_count: 2
    required_status_check_contexts: build, lint
  `);
  assert.equal(parsed.enforce_admins, true);
  assert.equal(parsed.allow_force_pushes, false);
  assert.equal(parsed.required_approving_review_count, 2);
  assert.deepEqual(parsed.required_status_check_contexts, ["build", "lint"]);
});

test("parsePolicyText raises a clear error for text that is neither JSON nor key: value", () => {
  assert.throws(() => parsePolicyText("this is just a sentence"), /not "key: value"/);
});

test("empty policy or actual text parses to an empty object rather than throwing", () => {
  assert.deepEqual(parsePolicyText(""), {});
  assert.deepEqual(parseActualText("  "), {});
});

test("parseActualText raises on invalid JSON rather than silently reading no protection", () => {
  assert.throws(() => parseActualText("{not json"));
});
