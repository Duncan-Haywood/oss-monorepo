import test from "node:test";
import assert from "node:assert/strict";
import {
  redact,
  checkResourceChange,
  checkOutputChange,
  checkPlan,
  parsePlan,
  SECRET_PATTERNS,
} from "./engine.mjs";

test("redact keeps only the first and last four characters", () => {
  assert.equal(redact("AKIAABCDEFGHIJKLMNOP"), "AKIA************MNOP");
});

test("redact fully masks short values", () => {
  assert.equal(redact("short"), "*****");
});

test("flags an AWS access key id not marked sensitive", () => {
  const findings = checkResourceChange({
    address: "aws_ssm_parameter.example",
    change: {
      after: { value: "AKIAABCDEFGHIJKLMNOP" },
      after_sensitive: {},
    },
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "aws-access-key-id");
  assert.equal(findings[0].path, "value");
  assert.equal(findings[0].side, "after");
  assert.equal(findings[0].redacted.includes("AKIAABCDEFGHIJKLMNOP"), false);
});

test("does not flag an attribute terraform already marked sensitive", () => {
  const findings = checkResourceChange({
    address: "aws_ssm_parameter.example",
    change: {
      after: { value: "AKIAABCDEFGHIJKLMNOP" },
      after_sensitive: { value: true },
    },
  });
  assert.equal(findings.length, 0);
});

test("a whole-object sensitive flag (bare true) suppresses every nested leak", () => {
  const findings = checkResourceChange({
    address: "aws_secretsmanager_secret_version.example",
    change: {
      after: { secret_string: "AKIAABCDEFGHIJKLMNOP" },
      after_sensitive: true,
    },
  });
  assert.equal(findings.length, 0);
});

test("finds a leak nested under an unmarked sibling of a sensitive field", () => {
  const findings = checkResourceChange({
    address: "example_widget.nested",
    change: {
      after: {
        config: {
          public_note: "endpoint is https://user:hunter2@db.example.com/main",
          token: "unrelated",
        },
      },
      after_sensitive: { config: { token: true } },
    },
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "url-embedded-credentials");
  assert.equal(findings[0].path, "config.public_note");
});

test("walks arrays and reports the index in the path", () => {
  const findings = checkResourceChange({
    address: "example_widget.list",
    change: {
      after: { rules: ["fine", "AKIAABCDEFGHIJKLMNOP"] },
      after_sensitive: {},
    },
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].path, "rules[1]");
});

test("detects a PEM private key header", () => {
  const findings = checkResourceChange({
    address: "tls_private_key.example",
    change: {
      after: { private_key_pem: "-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJ...\n-----END RSA PRIVATE KEY-----" },
      after_sensitive: {},
    },
  });
  assert.equal(findings.some((f) => f.code === "private-key-pem"), true);
});

test("detects a three-part JWT", () => {
  const jwt =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const findings = checkResourceChange({
    address: "example_widget.auth",
    change: { after: { bearer_token: jwt }, after_sensitive: {} },
  });
  assert.equal(findings.some((f) => f.code === "jwt"), true);
});

test("checks both before and after, independently", () => {
  const findings = checkResourceChange({
    address: "example_widget.rotated",
    change: {
      before: { key: "AKIAOLDOLDOLDOLDOLD1" },
      before_sensitive: {},
      after: { key: "AKIANEWNEWNEWNEWNEW1" },
      after_sensitive: {},
    },
  });
  assert.equal(findings.length, 2);
  assert.deepEqual(findings.map((f) => f.side).sort(), ["after", "before"]);
});

test("checkOutputChange skips an output already marked sensitive", () => {
  const findings = checkOutputChange("db_password", { after: "AKIAABCDEFGHIJKLMNOP", sensitive: true });
  assert.equal(findings.length, 0);
});

test("checkOutputChange flags an unmarked output", () => {
  const findings = checkOutputChange("connection_url", {
    after: "postgres://app:hunter2@db.internal:5432/main",
    sensitive: false,
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "url-embedded-credentials");
  assert.equal(findings[0].resourceAddress, "output.connection_url");
});

test("parsePlan rejects non-JSON with a pointer to the right command", () => {
  assert.throws(() => parsePlan("Terraform will perform the following actions:"), /terraform show -json/);
});

test("parsePlan rejects JSON missing resource_changes", () => {
  assert.throws(() => parsePlan('{"format_version": "1.2"}'), /resource_changes/);
});

test("checkPlan aggregates resource and output findings", () => {
  const plan = parsePlan(
    JSON.stringify({
      format_version: "1.2",
      resource_changes: [
        {
          address: "aws_ssm_parameter.example",
          change: { after: { value: "AKIAABCDEFGHIJKLMNOP" }, after_sensitive: {} },
        },
      ],
      output_changes: {
        db_url: { after: "postgres://app:hunter2@db.internal/main", sensitive: false },
      },
    }),
  );
  const result = checkPlan(plan);
  assert.equal(result.resourcesChecked, 1);
  assert.equal(result.outputsChecked, 1);
  assert.equal(result.findings.length, 2);
});

test("checkPlan reports zero findings on a clean plan", () => {
  const plan = parsePlan(
    JSON.stringify({
      format_version: "1.2",
      resource_changes: [
        {
          address: "aws_instance.web",
          change: { after: { instance_type: "t3.micro", ami: "ami-0abcd1234" }, after_sensitive: {} },
        },
      ],
      output_changes: {},
    }),
  );
  assert.equal(checkPlan(plan).findings.length, 0);
});

test("SECRET_PATTERNS each carry a code and label", () => {
  for (const p of SECRET_PATTERNS) {
    assert.equal(typeof p.code, "string");
    assert.equal(typeof p.label, "string");
    assert.equal(p.re instanceof RegExp, true);
  }
});
