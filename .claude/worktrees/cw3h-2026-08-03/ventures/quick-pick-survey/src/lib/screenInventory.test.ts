import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * Keeps `docs/SCREENS.md` honest, the same way `routeInventory.test.ts` keeps
 * `docs/ROUTES.md` honest.
 *
 * That table's whole value is that a screen with no recovery from a dropped
 * request shows up as a gap in a column. A table that has fallen behind the
 * code is worse than no table: it is read as complete, and the screen missing
 * from it is exactly the one nobody has looked at.
 *
 * What this can check: that the set of components and the set of rows agree,
 * and that a screen the table says is tested has a test file. What it cannot:
 * whether "retry in place" is true of the component it is written next to.
 */

const COMPONENTS = join(process.cwd(), "src/components");
const DOC = join(process.cwd(), "docs/SCREENS.md");

/** Component modules, excluding their test files. */
function componentsOnDisk(): string[] {
  return readdirSync(COMPONENTS)
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
    .map((f) => f.replace(/\.tsx$/, ""))
    .sort();
}

/** Table rows as component name → cells. */
function rowsInDoc(): Map<string, string[]> {
  const rows = new Map<string, string[]>();
  for (const line of readFileSync(DOC, "utf8").split("\n")) {
    const match = line.match(/^\|\s*`([A-Za-z]+)`\s*\|(.*)\|\s*$/);
    if (match) rows.set(match[1], match[2].split("|").map((c) => c.trim()));
  }
  return rows;
}

describe("docs/SCREENS.md", () => {
  it("lists every component that exists, and no component that does not", () => {
    const onDisk = componentsOnDisk();
    const inDoc = [...rowsInDoc().keys()].sort();

    // Named individually so a failure says which screen was added or removed
    // rather than printing two lists to diff by eye.
    const missing = onDisk.filter((c) => !inDoc.includes(c));
    const stale = inDoc.filter((c) => !onDisk.includes(c));
    expect(missing, "components with no row in docs/SCREENS.md").toEqual([]);
    expect(stale, "rows in docs/SCREENS.md for components that no longer exist").toEqual([]);
  });

  it("has a test file for every screen the table says is tested", () => {
    const files = new Set(readdirSync(COMPONENTS));
    for (const [name, cells] of rowsInDoc()) {
      // The last cell is the Tested column. "no" and "via the runner" are
      // honest answers; "yes" is a claim about a file existing.
      if (cells[cells.length - 1] !== "yes") continue;
      expect(files.has(`${name}.test.tsx`), `${name} is listed as tested`).toBe(true);
    }
  });

  it("gives every row an answer in every column", () => {
    for (const [name, cells] of rowsInDoc()) {
      // Six columns: Page, Calls, On failure, On 401, Tested — plus the
      // screen name, which the row match already consumed.
      expect(cells.length, `${name} has the wrong number of columns`).toBe(5);
      for (const [i, cell] of cells.entries()) {
        // An empty cell is ambiguous between "nothing to say" and "nobody
        // checked". The table uses "—" for the first, so blank means the
        // second and should not survive review.
        expect(cell.length, `${name}, column ${i + 1}, is blank`).toBeGreaterThan(0);
      }
    }
  });
});
