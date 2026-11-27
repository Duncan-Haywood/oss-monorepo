// The shipped profiles must stay true to the repository: every cited path exists, and every
// subprocessor appears in docs/trust/subprocessors.md.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { profileSources, validateProfile } from "./guard.ts";
import { PROFILES } from "./index.ts";

const ROOT = new URL("../../../", import.meta.url);

for (const [app, profile] of Object.entries(PROFILES)) {
  describe(`profile: ${app}`, () => {
    it("validates", () => {
      validateProfile(profile);
    });
    it("refers to an app that exists", () => {
      assert.ok(existsSync(new URL(`apps/${app}/`, ROOT)), `apps/${app} missing`);
    });
    it("cites only repository paths that exist", () => {
      for (const src of profileSources(profile)) {
        if (src.startsWith("https://")) continue;
        const path = src.split("#")[0] ?? "";
        assert.ok(existsSync(new URL(path, ROOT)), `${app}: cited path ${path} does not exist`);
      }
    });
    it("lists each subprocessor in docs/trust/subprocessors.md", () => {
      const doc = readFileSync(new URL("docs/trust/subprocessors.md", ROOT), "utf8");
      for (const p of profile.subprocessors) {
        assert.ok(doc.includes(`\`${p.id}\``), `${p.id} missing from docs/trust/subprocessors.md`);
      }
    });
    it("lists each owner-to-confirm item in docs/trust/OWNER-CONFIRM.md", () => {
      const doc = readFileSync(new URL("docs/trust/OWNER-CONFIRM.md", ROOT), "utf8");
      assert.ok(doc.includes(`\`${app}\``), `${app} has no section in OWNER-CONFIRM.md`);
    });
  });
}
