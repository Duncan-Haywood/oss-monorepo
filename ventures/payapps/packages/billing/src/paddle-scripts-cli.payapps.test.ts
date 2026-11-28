// payapps-only: scripts/paddle-webhook.ts ships in this copy of the billing package alone (the
// other products' copies have no webhook script), so its CLI cases live here, not in the shared
// paddle-scripts-cli.test.ts.
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import { run, SCRIPTS, SDBX, stub } from "../test/cli-harness.ts";

describe("paddle-webhook CLI", () => {
  const WEBHOOK = join(SCRIPTS, "paddle-webhook.ts");
  const url = "https://payapps.example.test";

  it("paddle-webhook exits 2 with the usage line unless --active is exactly true or false", () => {
    for (const active of [[], ["--active", "yes"], ["--active"]]) {
      const r = run(["--app", "payapps", "--app-url", url, ...active], {}, undefined, WEBHOOK);
      assert.equal(r.code, 2, r.err);
      assert.match(r.err, /^usage: paddle-webhook\.ts/m);
    }
    const ok = run(
      ["--active", "false", "--app-url", url, "--app", "payapps"],
      {},
      undefined,
      WEBHOOK,
    );
    assert.equal(ok.code, 2, ok.err);
    assert.match(ok.err, /BILLING_API_KEY cannot be used/);
  });

  it("paddle-webhook stops at exit 2 on a key Paddle answers 401, and never prints the key", () => {
    const r = run(
      ["--app", "payapps", "--app-url", url, "--active", "false"],
      { BILLING_API_KEY: SDBX },
      stub(401, 500),
      WEBHOOK,
    );
    assert.equal(r.code, 2, r.err);
    assert.ok(!r.out.includes(SDBX) && !r.err.includes(SDBX));
  });
});
