// #4738-#4741 fixed a dead `../LICENSE` footer link (one level too high) on
// five sub-tools, but the sweep checked only for that specific dead-link
// shape and missed rc-time-calculator, whose footer said "MIT licensed"
// with no link at all -- a different defect (absent, not dead) that the same
// grep for `../LICENSE` could not see. Each sub-tool ships its own LICENSE
// file one level below its own index.html; this asserts every one of them
// is actually linked from that page's footer, so neither shape regresses.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const toolsDir = dirname(fileURLToPath(import.meta.url));
const subTools = [
  "555-timer-calculator",
  "led-resistor-calculator",
  "rc-filter-calculator",
  "rc-time-calculator",
  "resistor-calculator",
  "voltage-divider-calculator",
];

for (const slug of subTools) {
  test(`${slug}: footer links its own LICENSE file`, () => {
    const dir = join(toolsDir, slug);
    assert.ok(existsSync(join(dir, "LICENSE")), `${slug}/LICENSE must exist`);
    const html = readFileSync(join(dir, "index.html"), "utf8");
    assert.match(
      html,
      /href="LICENSE"/,
      `${slug}/index.html footer must link href="LICENSE" (same directory, not ../LICENSE)`,
    );
    assert.doesNotMatch(
      html,
      /href="\.\.\/LICENSE"/,
      `${slug}/index.html must not link ../LICENSE -- that resolves above the tool's own directory`,
    );
  });
}
