// #4738-#4741 fixed a dead `../LICENSE` footer link (one level too high) on
// five sub-tools, but the sweep checked only for that specific dead-link
// shape and missed rc-time-calculator, whose footer said "MIT licensed"
// with no link at all -- a different defect (absent, not dead) that the same
// grep for `../LICENSE` could not see. Each sub-tool ships its own LICENSE
// file one level below its own index.html; this asserts every one of them
// is actually linked from that page's footer, so neither shape regresses.
//
// That fix, and this test, checked only each sub-tool's `index.html`. Four
// comparison pages living in the same directories (added after, or missed by,
// #4738-#4741) still carried the dead `../LICENSE` link -- same defect, same
// directory, just a second HTML file the sweep never looked at. Iterating
// every *.html in each sub-tool directory, not just index.html, is what
// closes that gap rather than moving it to the next new page.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
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
  const dir = join(toolsDir, slug);
  const pages = readdirSync(dir).filter((name) => name.endsWith(".html"));

  test(`${slug}: LICENSE file exists`, () => {
    assert.ok(existsSync(join(dir, "LICENSE")), `${slug}/LICENSE must exist`);
  });

  for (const page of pages) {
    test(`${slug}/${page}: footer links its own LICENSE file`, () => {
      const html = readFileSync(join(dir, page), "utf8");
      assert.match(
        html,
        /href="LICENSE"/,
        `${slug}/${page} footer must link href="LICENSE" (same directory, not ../LICENSE)`,
      );
      assert.doesNotMatch(
        html,
        /href="\.\.\/LICENSE"/,
        `${slug}/${page} must not link ../LICENSE -- that resolves above the tool's own directory`,
      );
    });
  }
}
