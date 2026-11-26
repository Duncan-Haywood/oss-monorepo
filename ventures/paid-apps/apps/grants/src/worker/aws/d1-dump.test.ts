import { describe, expect, it } from "vitest";
import { splitDumpStatements, toLoadScript, translateD1Dump, translateValues } from "./d1-dump";

describe("D1 export -> Postgres", () => {
  it("splits on semicolons outside quotes", () => {
    expect(splitDumpStatements("INSERT INTO t VALUES('a;b');\nINSERT INTO t VALUES(1)")).toEqual([
      "INSERT INTO t VALUES('a;b')",
      "INSERT INTO t VALUES(1)",
    ]);
  });

  it("rewrites char() and X'' blobs but not text that looks like them", () => {
    expect(translateValues("(replace('a\\nb','\\n',char(10)),X'00ff','char(9) X''1''')")).toBe(
      "(replace('a\\nb','\\n',chr(10)),'\\x00ff'::bytea,'char(9) X''1''')",
    );
  });

  it("keeps only rows of known tables and counts them", () => {
    const dump = [
      "PRAGMA defer_foreign_keys=TRUE;",
      "CREATE TABLE `x` (`id` text);",
      `INSERT INTO "d1_migrations" VALUES(1,'0000_init.sql','2026-11-01');`,
      `INSERT INTO "facts" ("id","statement") VALUES('f1','a; b');`,
      "INSERT INTO organization VALUES('o1','O',NULL);",
      "INSERT INTO `organization` VALUES('o2','P',NULL);",
      `INSERT INTO "sqlite_sequence" VALUES('d1_migrations',1);`,
      `INSERT INTO "_cf_KV" VALUES('k','v');`,
      "INSERT INTO mystery VALUES(1);",
    ].join("\n");
    const t = translateD1Dump(dump, ["facts", "organization"]);
    expect(t.statements).toEqual([
      `INSERT INTO "facts" ("id","statement") VALUES ('f1','a; b');`,
      `INSERT INTO "organization" VALUES ('o1','O',NULL);`,
      `INSERT INTO "organization" VALUES ('o2','P',NULL);`,
    ]);
    expect(t.counts).toEqual({ facts: 1, organization: 2 });
    expect(t.unknownTables).toEqual(["mystery"]);
    const script = toLoadScript(t);
    expect(script.startsWith("\\set ON_ERROR_STOP on\nBEGIN;\nSET CONSTRAINTS ALL DEFERRED;")).toBe(
      true,
    );
    expect(script).toContain(`IF (SELECT count(*) FROM "organization") <> 2 THEN RAISE EXCEPTION`);
    expect(script.trimEnd().endsWith("COMMIT;")).toBe(true);
  });
});

describe("cutover load invocation", () => {
  it("accepts only ops/cutover/*.sql keys and strips psql meta-commands", async () => {
    const { loadKeyOf, stripPsqlMeta } = await import("./cutover-load");
    expect(loadKeyOf("cron(17 13 * * ? *)")).toBeNull();
    expect(loadKeyOf("grants-load:ops/cutover/load.sql")).toBe("ops/cutover/load.sql");
    expect(() => loadKeyOf("grants-load:orgs/org_a/x.sql")).toThrow();
    expect(() => loadKeyOf("grants-load:ops/cutover/../x.sql")).toThrow();
    expect(stripPsqlMeta("\\set ON_ERROR_STOP on\nBEGIN;\nCOMMIT;")).toBe("BEGIN;\nCOMMIT;");
  });
});
