import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePolicies, analyze, globMatch, toCsv, sampleText } from "./calc.mjs";

const run = (doc) => { const p = parsePolicies(JSON.stringify(doc)); assert.ok(!p.error, p.error); return analyze(p.policies, { chars: p.chars }); };
const stmt = (s) => run({ Version: "2012-10-17", Statement: s });
const rules = (r) => r.findings.map((f) => f.rule);

test("admin policy is critical and scores badly", () => {
  const r = stmt({ Effect: "Allow", Action: "*", Resource: "*" });
  assert.deepEqual(rules(r), ["admin"]);
  assert.equal(r.findings[0].severity, "critical");
  assert.equal(r.summary.score, 75);
});

test("a tight policy has no findings and grade A", () => {
  const r = stmt({ Effect: "Allow", Action: ["s3:GetObject"], Resource: "arn:aws:s3:::b/*" });
  assert.equal(r.findings.length, 0);
  assert.equal(r.summary.grade, "A");
});

test("service wildcards: iam:* is high, ec2:* is medium", () => {
  const r = stmt([{ Effect: "Allow", Action: "iam:*", Resource: "arn:aws:iam::1:role/x" }, { Effect: "Allow", Action: "ec2:*", Resource: "*" }]);
  const w = r.findings.filter((f) => f.rule === "service-wildcard");
  assert.deepEqual(w.map((f) => f.severity).sort(), ["high", "medium"]);
});

test("escalation actions on * are critical; PassRole alone is medium when scoped away from wildcard", () => {
  assert.equal(stmt({ Effect: "Allow", Action: "iam:AttachRolePolicy", Resource: "*" }).findings[0].severity, "critical");
  const scoped = stmt({ Effect: "Allow", Action: "iam:PassRole", Resource: "arn:aws:iam::1:role/app" });
  assert.equal(scoped.findings[0].severity, "medium");
  assert.equal(stmt({ Effect: "Allow", Action: "iam:PassRole", Resource: "*" }).findings[0].severity, "high");
});

test("wildcard actions are expanded against the escalation list", () => {
  const f = stmt({ Effect: "Allow", Action: "iam:Put*Policy", Resource: "*" }).findings.find((x) => x.rule === "escalation");
  assert.ok(f);
  assert.deepEqual(f.actions.sort(), ["iam:PutGroupPolicy", "iam:PutRolePolicy", "iam:PutUserPolicy"]);
});

test("NotAction with Allow is high; with Deny it is ignored", () => {
  assert.equal(stmt({ Effect: "Allow", NotAction: "iam:*", Resource: "*" }).findings[0].rule, "not-action");
  assert.equal(stmt({ Effect: "Deny", NotAction: "iam:*", Resource: "*" }).findings.length, 0);
});

test("secret reads on * are high; scoped to one secret are clean", () => {
  assert.equal(stmt({ Effect: "Allow", Action: "secretsmanager:GetSecretValue", Resource: "*" }).findings[0].rule, "sensitive-read");
  assert.equal(stmt({ Effect: "Allow", Action: "secretsmanager:GetSecretValue", Resource: "arn:aws:secretsmanager:us-east-1:1:secret:x-AbC" }).findings.length, 0);
});

test("read-only actions on * are not flagged, writes on * are medium", () => {
  assert.equal(stmt({ Effect: "Allow", Action: ["ec2:DescribeInstances", "sts:GetCallerIdentity"], Resource: "*" }).findings.length, 0);
  assert.equal(stmt({ Effect: "Allow", Action: ["ec2:StopInstances"], Resource: "*" }).findings[0].rule, "resource-star");
});

test("public principal: critical without Condition, medium with one; cross-account root flagged", () => {
  assert.equal(stmt({ Effect: "Allow", Principal: "*", Action: "s3:GetObject", Resource: "arn:aws:s3:::b/*" }).findings[0].severity, "critical");
  assert.equal(stmt({ Effect: "Allow", Principal: { AWS: "*" }, Action: "s3:GetObject", Resource: "arn:aws:s3:::b/*", Condition: { StringEquals: { "aws:PrincipalOrgID": "o-1" } } }).findings[0].rule, "public-principal-cond");
  const trust = stmt({ Effect: "Allow", Principal: { AWS: "arn:aws:iam::111122223333:root" }, Action: "sts:AssumeRole" });
  assert.deepEqual(rules(trust), ["cross-account"]);
  assert.equal(stmt({ Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" }).findings.length, 0);
});

test("parsePolicies handles CLI wrappers, arrays and rejects junk", () => {
  assert.equal(parsePolicies(JSON.stringify({ PolicyVersion: { Document: { Statement: [] } } })).policies.length, 1);
  assert.equal(parsePolicies(JSON.stringify([{ Statement: [] }, { Statement: [] }])).policies.length, 2);
  assert.match(parsePolicies("{nope").error, /Not valid JSON/);
  assert.match(parsePolicies("{}").error, /No "Statement"/);
});

test("missing Version and bad Effect are reported", () => {
  const r = run({ Statement: [{ Effect: "allow", Action: "s3:*", Resource: "*" }] });
  assert.ok(rules(r).includes("no-version") && rules(r).includes("bad-effect"));
});

test("globMatch is case-insensitive and anchored", () => {
  assert.ok(globMatch("iam:Create*", "iam:CreateAccessKey"));
  assert.ok(!globMatch("iam:Create", "iam:CreateAccessKey"));
});

test("sample reconciles: findings sorted by severity, counts add up, CSV has a row each", () => {
  const p = parsePolicies(sampleText());
  const r = analyze(p.policies);
  const order = ["critical", "high", "medium", "info"];
  assert.deepEqual(r.findings.map((f) => order.indexOf(f.severity)), [...r.findings.map((f) => order.indexOf(f.severity))].sort((a, b) => a - b));
  const b = r.summary.bySeverity;
  assert.equal(b.critical + b.high + b.medium + b.info, r.findings.length);
  assert.equal(r.summary.score, Math.max(0, 100 - r.summary.penalty));
  assert.equal(toCsv(r.findings).split("\n").length, r.findings.length + 1);
  assert.ok(b.critical >= 2);
});
