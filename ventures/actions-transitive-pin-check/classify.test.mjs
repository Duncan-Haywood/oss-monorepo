import test from "node:test";
import assert from "node:assert/strict";
import { classifyUses, scanText, parseRemoteRef, classificationCounts, PINNED, MUTABLE, LOCAL, DOCKER } from "./classify.mjs";

test("classifyUses: 40-char SHA is pinned", () => {
  const { classification } = classifyUses("actions/checkout@8f152de45cc393bb48ce5d89d36b731f54556e65");
  assert.equal(classification, PINNED);
});

test("classifyUses: a version tag is mutable", () => {
  const { classification } = classifyUses("actions/checkout@v4");
  assert.equal(classification, MUTABLE);
});

test("classifyUses: no ref at all is mutable", () => {
  const { classification } = classifyUses("actions/checkout");
  assert.equal(classification, MUTABLE);
});

test("classifyUses: local composite action is skipped as LOCAL", () => {
  const { classification } = classifyUses("./.github/actions/build");
  assert.equal(classification, LOCAL);
});

test("classifyUses: docker reference is skipped as DOCKER", () => {
  const { classification } = classifyUses("docker://alpine:3.19");
  assert.equal(classification, DOCKER);
});

test("classifyUses: quoted values are unwrapped", () => {
  const { classification, action } = classifyUses('"actions/checkout@v4"');
  assert.equal(classification, MUTABLE);
  assert.equal(action, "actions/checkout");
});

test("scanText: finds uses lines, skips comments", () => {
  const yaml = `
jobs:
  build:
    steps:
      # - uses: commented/out@v1
      - uses: actions/checkout@8f152de45cc393bb48ce5d89d36b731f54556e65
      - uses: some-org/deploy@main
`;
  const findings = scanText(yaml, "ci.yml");
  assert.equal(findings.length, 2);
  assert.equal(findings[0].classification, PINNED);
  assert.equal(findings[1].classification, MUTABLE);
  assert.equal(findings[1].line, 7);
});

test("classificationCounts tallies by classification", () => {
  const findings = [
    { classification: PINNED },
    { classification: PINNED },
    { classification: MUTABLE },
  ];
  assert.deepEqual(classificationCounts(findings), { [PINNED]: 2, [MUTABLE]: 1 });
});

test("parseRemoteRef: reusable workflow path is detected", () => {
  const parsed = parseRemoteRef("some-org/shared-workflows/.github/workflows/release.yml");
  assert.equal(parsed.kind, "reusable-workflow");
  assert.deepEqual(parsed.candidatePaths, [".github/workflows/release.yml"]);
  assert.equal(parsed.owner, "some-org");
  assert.equal(parsed.repo, "shared-workflows");
});

test("parseRemoteRef: bare action tries action.yml and action.yaml at the repo root", () => {
  const parsed = parseRemoteRef("actions/checkout");
  assert.equal(parsed.kind, "action");
  assert.deepEqual(parsed.candidatePaths, ["action.yml", "action.yaml"]);
});

test("parseRemoteRef: action with a subpath tries action.yml under that subpath", () => {
  const parsed = parseRemoteRef("some-org/toolkit/actions/build-cache");
  assert.equal(parsed.kind, "action");
  assert.deepEqual(parsed.candidatePaths, ["actions/build-cache/action.yml", "actions/build-cache/action.yaml"]);
});

test("parseRemoteRef: a lone segment (no repo) is not a valid remote ref", () => {
  assert.equal(parseRemoteRef("no-repo-here"), null);
});
