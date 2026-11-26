import { describe, expect, it } from "vitest";
import { d1TypeParsers, PgD1Database, type PgQueryConfig } from "./pg-d1";

function fakePool(fail?: (text: string) => boolean) {
  const log: PgQueryConfig[] = [];
  let released = 0;
  const query = async (c: PgQueryConfig) => {
    log.push(c);
    if (fail?.(c.text)) throw new Error("boom");
    return { rows: c.rowMode === "array" ? [[1, "a"]] : [{ n: 1 }], rowCount: 1 };
  };
  return {
    log,
    released: () => released,
    pool: { query, connect: async () => ({ query, release: () => void released++ }) },
  };
}

describe("PgD1Database", () => {
  it("translates SQL, maps booleans and asks for array rows only in raw()", async () => {
    const f = fakePool();
    const db = new PgD1Database(f.pool);
    const s = db.prepare('select * from "t" where "a" = ? and "b" like ?').bind(true, "%x%");
    expect(await s.raw()).toEqual([[1, "a"]]);
    expect(await s.first("n")).toBe(1);
    expect((await s.all()).results).toEqual([{ n: 1 }]);
    expect(f.log[0]).toMatchObject({
      text: 'select * from "t" where "a" = $1 and "b" ilike $2',
      values: [1, "%x%"],
      rowMode: "array",
    });
    expect(f.log[1]?.rowMode).toBeUndefined();
  });

  it("runs a batch in one transaction and rolls back on failure", async () => {
    const ok = fakePool();
    await new PgD1Database(ok.pool).batch([
      new PgD1Database(ok.pool).prepare("insert 1"),
      new PgD1Database(ok.pool).prepare("insert 2"),
    ]);
    expect(ok.log.map((c) => c.text)).toEqual(["BEGIN", "insert 1", "insert 2", "COMMIT"]);
    const bad = fakePool((t) => t === "insert 2");
    const db = new PgD1Database(bad.pool);
    await expect(db.batch([db.prepare("insert 1"), db.prepare("insert 2")])).rejects.toThrow(
      "boom",
    );
    expect(bad.log.map((c) => c.text)).toEqual(["BEGIN", "insert 1", "insert 2", "ROLLBACK"]);
    expect(bad.released()).toBe(1);
  });

  it("parses numbers and booleans the way D1 returns them", () => {
    const p = (oid: number) => d1TypeParsers.getTypeParser(oid);
    expect(p(20)("1732492800000")).toBe(1732492800000);
    expect(p(1700)("12.5")).toBe(12.5);
    expect(p(16)("t")).toBe(1);
    expect(p(25)("text")).toBe("text");
  });
});

describe("cosine", () => {
  it("scores identical directions 1 and orthogonal 0", async () => {
    const { cosine } = await import("./pg-vector-store");
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});
