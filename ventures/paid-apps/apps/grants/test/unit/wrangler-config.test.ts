// Guards against drift between the deploy config and the test config.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const parse = (f: string) =>
  JSON.parse(
    readFileSync(f, "utf8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/,(\s*[}\]])/g, "$1"),
  );

describe("wrangler configs", () => {
  const prod = parse("wrangler.jsonc");
  const test = parse("wrangler.test.jsonc");

  it("share bindings (except AI/Vectorize/assets, which Miniflare cannot run locally)", () => {
    expect(test.d1_databases.map((d: { binding: string }) => d.binding)).toEqual(
      prod.d1_databases.map((d: { binding: string }) => d.binding),
    );
    expect(test.r2_buckets).toEqual(prod.r2_buckets);
    expect(test.queues.producers).toEqual(prod.queues.producers);
    expect(test.workflows).toEqual(prod.workflows);
    expect(test.send_email).toEqual(prod.send_email);
    expect(Object.keys(test.vars).sort()).toEqual(Object.keys(prod.vars).sort());
    expect(test.compatibility_date).toBe(prod.compatibility_date);
  });
});
