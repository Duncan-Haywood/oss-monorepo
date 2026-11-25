// A Cloudflare D1-shaped binding over Postgres, so Workers code that calls
// `env.DB.prepare(sql).bind(...).first()/all()/run()` and `env.DB.batch([...])` runs unchanged.
// `?` and `?NNN` placeholders become `$n`; quoted strings, identifiers and comments are left alone.
// SQLite-only SQL (INSERT OR REPLACE, datetime('now'), AUTOINCREMENT) still has to be ported:
// see README.md, "Moving a Workers product".

export function toPgPlaceholders(sql) {
  let out = "", n = 0, i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" || c === '"') {                     // quoted literal / identifier ('' escapes)
      let j = i + 1;
      while (j < sql.length) { if (sql[j] === c) { if (sql[j + 1] === c) { j += 2; continue; } break; } j++; }
      out += sql.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === "-" && sql[i + 1] === "-") { const j = sql.indexOf("\n", i); const end = j < 0 ? sql.length : j; out += sql.slice(i, end); i = end; continue; }
    if (c === "/" && sql[i + 1] === "*") { const j = sql.indexOf("*/", i + 2); const end = j < 0 ? sql.length : j + 2; out += sql.slice(i, end); i = end; continue; }
    if (c === "?") {
      let j = i + 1; while (j < sql.length && sql[j] >= "0" && sql[j] <= "9") j++;
      out += j > i + 1 ? `$${sql.slice(i + 1, j)}` : `$${++n}`; i = j; continue;
    }
    out += c; i++;
  }
  return out;
}

class Statement {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...params) { return new Statement(this.db, this.sql, params); }
  async _q(client) { return (client || this.db.pool).query(toPgPlaceholders(this.sql), this.params); }
  async first(column) {
    const r = await this._q(); const row = r.rows[0];
    if (!row) return null;
    return column === undefined ? row : row[column];
  }
  async all() { const r = await this._q(); return { success: true, results: r.rows, meta: { changes: r.rowCount ?? 0 } }; }
  async run() { const r = await this._q(); return { success: true, results: r.rows, meta: { changes: r.rowCount ?? 0 } }; }
  async raw() { const r = await this._q(); return r.rows.map((row) => Object.values(row)); }
}

export class D1Shim {
  constructor(pool) { this.pool = pool; }
  prepare(sql) { return new Statement(this, sql); }
  /** Runs the statements in one transaction, like D1's batch. */
  async batch(statements) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const out = [];
      for (const s of statements) { const r = await s._q(client); out.push({ success: true, results: r.rows, meta: { changes: r.rowCount ?? 0 } }); }
      await client.query("COMMIT");
      return out;
    } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
  }
  async exec(sql) { await this.pool.query(sql); return { count: 1 }; }
}
