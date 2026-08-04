import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * Keeps `docs/ROUTES.md` honest.
 *
 * That table exists so a property some routes have and others don't shows up
 * as a gap in a column — which only works if the table lists the routes that
 * actually exist. A table that silently falls behind the code is worse than no
 * table, because it is read as complete.
 *
 * What this can check: the set of routes, and the methods each one exports.
 * What it cannot: whether "per-IP" in the Limit column is true. Those columns
 * are facts a reader confirms by opening the file, and the doc says so.
 */

const API_ROOT = join(process.cwd(), "src/app/api");
const DOC = join(process.cwd(), "docs/ROUTES.md");

/** Every `route.ts` under src/app/api, named the way the doc names it. */
function routesOnDisk(dir = API_ROOT, prefix = ""): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const [name, methods] of routesOnDisk(path, prefix ? `${prefix}/${entry.name}` : entry.name)) {
        found.set(name, methods);
      }
    } else if (entry.name === "route.ts" || entry.name === "route.tsx") {
      const source = readFileSync(path, "utf8");
      const methods = [...source.matchAll(/export async function ([A-Z]+)/g)].map((m) => m[1]);
      found.set(prefix, methods.sort());
    }
  }
  return found;
}

/** The table rows, as route name → declared methods. */
function routesInDoc(): Map<string, string[]> {
  const rows = new Map<string, string[]>();
  for (const line of readFileSync(DOC, "utf8").split("\n")) {
    const match = line.match(/^\|\s*`([^`]+)`\s*\|\s*([A-Z, ]+?)\s*\|/);
    if (match) rows.set(match[1], match[2].split(",").map((m) => m.trim()).sort());
  }
  return rows;
}

describe("docs/ROUTES.md", () => {
  it("lists every route that exists, and no route that does not", () => {
    const onDisk = [...routesOnDisk().keys()].sort();
    const inDoc = [...routesInDoc().keys()].sort();

    // Named individually so a failure says which route was added or removed
    // rather than printing two long lists to diff by eye.
    const missing = onDisk.filter((r) => !inDoc.includes(r));
    const stale = inDoc.filter((r) => !onDisk.includes(r));
    expect(missing, "routes with no row in docs/ROUTES.md").toEqual([]);
    expect(stale, "rows in docs/ROUTES.md for routes that no longer exist").toEqual([]);
  });

  it("names the right methods for each route", () => {
    const onDisk = routesOnDisk();
    for (const [route, methods] of routesInDoc()) {
      expect(methods, `docs/ROUTES.md lists the wrong methods for ${route}`).toEqual(onDisk.get(route));
    }
  });

  it("finds the routes at all, so an empty pass cannot look like a green one", () => {
    // Without this, a change to the directory layout would make both checks
    // above pass over nothing.
    expect(routesOnDisk().size).toBeGreaterThan(15);
  });
});
