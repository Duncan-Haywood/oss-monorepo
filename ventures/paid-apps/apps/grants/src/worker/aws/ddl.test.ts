import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generatePgMigrations, sqliteMigrationToPg } from "./ddl";

const root = join(import.meta.dirname, "..", "..", "..");

describe("sqliteMigrationToPg", () => {
  const sqlite = [
    "CREATE TABLE `child` (",
    "\t`id` text PRIMARY KEY NOT NULL,",
    "\t`parent_id` text NOT NULL,",
    "\t`at` integer NOT NULL,",
    "\t`score` real DEFAULT 0.5 NOT NULL,",
    "\t`on` integer DEFAULT false NOT NULL,",
    "\tFOREIGN KEY (`parent_id`) REFERENCES `parent`(`id`) ON UPDATE no action ON DELETE cascade",
    ");",
    "--> statement-breakpoint",
    "CREATE INDEX `child_idx` ON `child` (`parent_id`);--> statement-breakpoint",
    "CREATE TABLE `parent` (",
    "\t`id` text PRIMARY KEY NOT NULL",
    ");",
  ].join("\n");

  it("maps types and boolean defaults, and moves FKs after every table (forward references)", () => {
    const { sql, tables } = sqliteMigrationToPg(sqlite);
    expect(tables).toEqual(["child", "parent"]);
    expect(sql).toContain('"at" bigint NOT NULL');
    expect(sql).toContain('"score" double precision DEFAULT 0.5 NOT NULL');
    expect(sql).toContain('"on" bigint DEFAULT 0 NOT NULL');
    expect(sql).not.toContain("`");
    expect(sql).toMatch(/"on" bigint DEFAULT 0 NOT NULL\n\);/); // trailing comma removed
    const fk = sql.indexOf('ALTER TABLE "child" ADD FOREIGN KEY');
    expect(fk).toBeGreaterThan(sql.indexOf('CREATE TABLE "parent"'));
    expect(sql).toContain("ON DELETE cascade DEFERRABLE INITIALLY IMMEDIATE;");
  });

  it("migrations-pg/ is up to date with migrations/ (run scripts/aws/gen-pg-migrations.ts)", () => {
    const files = readdirSync(join(root, "migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((name) => ({ name, sql: readFileSync(join(root, "migrations", name), "utf8") }));
    for (const f of generatePgMigrations(files)) {
      expect(readFileSync(join(root, "migrations-pg", f.name), "utf8"), f.name).toBe(f.sql);
    }
  });
});
