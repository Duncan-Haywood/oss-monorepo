// Unit tests for scripts/email-sending.mjs. Run from apps/grants:
//   node --test scripts/email-sending.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { plan, validateConfig } from "./email-sending.mjs";

describe("validateConfig", () => {
  it("accepts the committed config", () => {
    const cfg = JSON.parse(readFileSync(new URL("../email-sending.json", import.meta.url), "utf8"));
    assert.deepEqual(validateConfig(cfg), []);
  });

  it("rejects domains outside the zone and non-boolean settings", () => {
    const errs = validateConfig({
      zone: "marisstella.app",
      domains: [
        { name: "evil.test" },
        { name: "mail.marisstella.app", drop_suppressed_recipients: "yes" },
      ],
    });
    assert.equal(errs.length, 2);
    assert.match(errs[0], /not in zone/);
    assert.match(errs[1], /must be true or false/);
    assert.deepEqual(validateConfig({ zone: "x.org", domains: [] }), [
      "domains must be a non-empty list",
    ]);
  });
});

describe("plan", () => {
  const want = [
    { name: "Marisstella.app", drop_suppressed_recipients: true, preview_enabled: false },
  ];

  it("creates a missing domain with its settings", () => {
    assert.deepEqual(plan(want, []), [
      {
        action: "create",
        name: "marisstella.app",
        settings: { drop_suppressed_recipients: true, preview_enabled: false },
      },
    ]);
  });

  it("is a no-op when everything matches, and updates only what differs", () => {
    const have = {
      name: "marisstella.app",
      tag: "t1",
      enabled: true,
      drop_suppressed_recipients: true,
      preview_enabled: false,
    };
    assert.deepEqual(plan(want, [have]), [{ action: "ok", name: "marisstella.app", tag: "t1" }]);
    assert.deepEqual(plan(want, [{ ...have, drop_suppressed_recipients: false }]), [
      {
        action: "update",
        name: "marisstella.app",
        tag: "t1",
        settings: { drop_suppressed_recipients: true },
      },
    ]);
  });

  it("re-enables a domain whose sending was turned off", () => {
    const [step] = plan(want, [{ name: "marisstella.app", tag: "t1", enabled: false }]);
    assert.equal(step.action, "create");
    assert.equal(step.reenable, true);
    assert.equal(step.tag, "t1");
  });
});
