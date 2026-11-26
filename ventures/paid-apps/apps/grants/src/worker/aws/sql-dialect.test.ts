import { describe, expect, it } from "vitest";
import { splitSql, toPostgresSql } from "./sql-dialect";

describe("toPostgresSql", () => {
  it("numbers placeholders and keeps explicit ?NNN", () => {
    expect(toPostgresSql('select * from "t" where "a" = ? and "b" = ? limit ?')).toBe(
      'select * from "t" where "a" = $1 and "b" = $2 limit $3',
    );
    expect(toPostgresSql("select ?1, ?2, ?1")).toBe("select $1, $2, $1");
  });

  it("never rewrites inside literals, identifiers or comments", () => {
    const sql = `select 'what? like' as "q?like", x -- a ? like\nfrom t /* ? like */ where y like ?`;
    expect(toPostgresSql(sql)).toBe(
      `select 'what? like' as "q?like", x -- a ? like\nfrom t /* ? like */ where y ilike $1`,
    );
  });

  it("makes LIKE case-insensitive like SQLite, but leaves words that contain 'like'", () => {
    expect(toPostgresSql(`"t"."x" like ? escape '\\' or "t"."y" not LIKE ?`)).toBe(
      `"t"."x" ilike $1 escape '\\' or "t"."y" not ilike $2`,
    );
    expect(toPostgresSql("select likelihood, unlike from t")).toBe(
      "select likelihood, unlike from t",
    );
  });

  it("rewrites the json_extract(...) = 1 flag test", () => {
    expect(
      toPostgresSql(`json_extract("documents"."safety_flags", '$.injectionSuspected') = 1`),
    ).toBe(`(("documents"."safety_flags")::jsonb ->> 'injectionSuspected') in ('true', '1')`);
  });

  it("unqualifies ON CONFLICT targets", () => {
    expect(
      toPostgresSql(
        'insert into "b" ("p", "e") values (?, ?) on conflict ("b"."p", "b"."e") do nothing returning "id"',
      ),
    ).toBe(
      'insert into "b" ("p", "e") values ($1, $2) on conflict ("p", "e") do nothing returning "id"',
    );
    expect(toPostgresSql('on conflict ("s"."org_id") do update set "x" = excluded."x"')).toBe(
      'on conflict ("org_id") do update set "x" = excluded."x"',
    );
  });

  it("handles doubled quotes inside literals", () => {
    expect(splitSql("'it''s ?' ?").map((s) => s.code)).toEqual([false, true]);
    expect(toPostgresSql("'it''s ?' ?")).toBe("'it''s ?' $1");
  });
});
