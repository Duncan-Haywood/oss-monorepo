import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  auditConvexApiMap,
  DELIBERATE_CONVEX_API_ORPHANS,
  listPublicConvexExports,
  listRegisteredConvexApiPaths,
} from "./convex-api-map-audit";

const REPO_ROOT = path.resolve(__dirname, "../../..");

function loadConvexPublicExports(): string[] {
  const convexDir = path.join(REPO_ROOT, "convex");
  const keys: string[] = [];
  for (const file of readdirSync(convexDir)) {
    if (!file.endsWith(".ts") || file === "schema.ts") continue;
    const moduleName = file.replace(/\.ts$/, "");
    const source = readFileSync(path.join(convexDir, file), "utf8");
    keys.push(...listPublicConvexExports(moduleName, source));
  }
  return keys;
}

describe("listPublicConvexExports", () => {
  it("extracts public query/mutation exports and ignores internals", () => {
    const source = `
export const list = query({
  args: {},
  handler: async () => [],
});
export const create = mutation({
  args: {},
  handler: async () => null,
});
export const internalOnly = internalMutation({
  args: {},
  handler: async () => null,
});
`;
    expect(listPublicConvexExports("orders", source)).toEqual([
      "orders:list",
      "orders:create",
    ]);
  });
});

describe("listRegisteredConvexApiPaths", () => {
  it("parses the static api map block", () => {
    const source = `
const api: any = {
  leads: {
    list: "leads:list",
    getBySlug: "leads:getBySlug",
  },
  orders: {
    list: "orders:list",
  },
};
`;
    expect(listRegisteredConvexApiPaths(source)).toEqual([
      "leads:list",
      "leads:getBySlug",
      "orders:list",
    ]);
  });

  it("throws when the map block is missing", () => {
    expect(() => listRegisteredConvexApiPaths("export const x = 1;")).toThrow(
      /Could not locate static Convex API map/,
    );
  });
});

describe("auditConvexApiMap", () => {
  it("flags missing registrations that are not deliberate orphans", () => {
    const result = auditConvexApiMap({
      defined: ["leads:list", "orders:createOrder", "orders:mystery"],
      registered: ["leads:list"],
      deliberateOrphans: ["orders:createOrder"],
    });
    expect(result.missingFromMap).toEqual(["orders:mystery"]);
    expect(result.deliberateOrphansPresent).toEqual(["orders:createOrder"]);
  });

  it("flags map entries with no matching convex export", () => {
    const result = auditConvexApiMap({
      defined: ["leads:list"],
      registered: ["leads:list", "leads:ghost"],
    });
    expect(result.registeredButUndefined).toEqual(["leads:ghost"]);
  });

  it("flags stale deliberate-orphan allowlist entries", () => {
    const result = auditConvexApiMap({
      defined: ["leads:list"],
      registered: ["leads:list"],
      deliberateOrphans: ["orders:createOrder"],
    });
    expect(result.staleDeliberateOrphans).toEqual(["orders:createOrder"]);
  });
});

describe("static Convex API map (repo)", () => {
  it("registers every public convex export except deliberate orphans", () => {
    const defined = loadConvexPublicExports();
    const dbSource = readFileSync(path.join(REPO_ROOT, "src/lib/db.ts"), "utf8");
    const registered = listRegisteredConvexApiPaths(dbSource);
    const result = auditConvexApiMap({
      defined,
      registered,
      deliberateOrphans: DELIBERATE_CONVEX_API_ORPHANS,
    });

    expect(result.missingFromMap).toEqual([]);
    expect(result.registeredButUndefined).toEqual([]);
    expect(result.staleDeliberateOrphans).toEqual([]);
    // Lock the known-dead pair so removing either without updating the
    // allowlist fails this suite (rather than silently re-registering).
    expect(result.deliberateOrphansPresent).toEqual([
      ...DELIBERATE_CONVEX_API_ORPHANS,
    ]);
    expect(result.registered.length).toBeGreaterThan(40);
  });
});
