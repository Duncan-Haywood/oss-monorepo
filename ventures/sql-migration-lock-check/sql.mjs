// A statement splitter for PostgreSQL migration files, standard library only.
//
// Why this exists rather than a SQL parser dependency: every check in
// engine.mjs needs to know three things about each statement -- its text, its
// line number, and whether it sits inside an explicit transaction block. A
// full parse buys nothing extra and costs a dependency that would have to be
// audited before anyone could run this against a production migration, which
// is the one thing this tool promises is safe.
//
// What it does have to get right is which characters are *code*. A migration
// that mentions `CREATE INDEX` inside a comment, or a function body that
// contains a semicolon, must not be mis-split -- a false finding on a
// migration someone is about to run is worse than no tool, because they stop
// believing the next one. So the scanner tracks, in one pass:
//
//   'literal'     '...' with '' escaping
//   "identifier"  "..." with "" escaping
//   $tag$ ... $tag$   dollar-quoted bodies (the usual home of a semicolon
//                     that must not split a statement)
//   -- line comments
//   /* block */   comments, which NEST in PostgreSQL unlike C
//
// Everything outside those is code, and only a semicolon in code ends a
// statement.

/** Characters PostgreSQL accepts in a dollar-quote tag. */
const TAG = /[A-Za-z0-9_-￿]/;

/**
 * Strip comments and blank a copy of every string/dollar-quoted body, keeping
 * the exact character count so offsets still line up with the original.
 *
 * Returned as a *mask* rather than applied destructively because the callers
 * need both views: the checks match against the masked text (so a comment can
 * never produce a finding) while the report quotes the original (so the user
 * sees the statement they actually wrote).
 *
 * `isComment` is tracked separately from `inString` because the two are
 * wanted for opposite purposes: matching runs against text with *both*
 * removed, while the statement quoted back to the user needs comments gone
 * and string literals kept. Without that split, a statement preceded by a
 * comment -- which in a generated migration is most of them -- is quoted as
 * `-- CreateIndex CREATE UNIQUE INDEX ...` once whitespace is collapsed, and
 * reads as though the whole statement were commented out. A finding that
 * looks obviously wrong is worse than no finding, and this one was found by
 * running the tool against real Prisma migrations in this repository.
 *
 * @param {string} text
 * @returns {{ masked: string, inString: boolean[], isComment: boolean[] }}
 */
export function maskNonCode(text) {
  const out = new Array(text.length);
  const inString = new Array(text.length).fill(false);
  const isComment = new Array(text.length).fill(false);
  let i = 0;
  const n = text.length;

  const blank = (from, to, mark) => {
    for (let k = from; k < to && k < n; k += 1) {
      // Newlines are preserved so line numbers survive masking; everything
      // else becomes a space.
      out[k] = text[k] === '\n' ? '\n' : ' ';
      if (mark === 'string') inString[k] = true;
      if (mark === 'comment') isComment[k] = true;
    }
  };

  while (i < n) {
    const c = text[i];
    const next = text[i + 1];

    // -- line comment
    if (c === '-' && next === '-') {
      let j = i;
      while (j < n && text[j] !== '\n') j += 1;
      blank(i, j, 'comment');
      i = j;
      continue;
    }

    // /* block comment */ -- nesting, per PostgreSQL
    if (c === '/' && next === '*') {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (text[j] === '/' && text[j + 1] === '*') { depth += 1; j += 2; continue; }
        if (text[j] === '*' && text[j + 1] === '/') { depth -= 1; j += 2; continue; }
        j += 1;
      }
      blank(i, j, 'comment');
      i = j;
      continue;
    }

    // 'literal', with '' as the escape
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (text[j] === "'" && text[j + 1] === "'") { j += 2; continue; }
        if (text[j] === "'") { j += 1; break; }
        j += 1;
      }
      blank(i, j, 'string');
      i = j;
      continue;
    }

    // "identifier", with "" as the escape
    if (c === '"') {
      let j = i + 1;
      while (j < n) {
        if (text[j] === '"' && text[j + 1] === '"') { j += 2; continue; }
        if (text[j] === '"') { j += 1; break; }
        j += 1;
      }
      // Quoted identifiers are code -- `ALTER TABLE "users"` must still match
      // -- so the characters are kept rather than blanked. Only the quotes go,
      // so `"my table"` does not read as two tokens.
      out[i] = ' ';
      for (let k = i + 1; k < j - 1; k += 1) out[k] = text[k];
      if (j - 1 < n) out[j - 1] = ' ';
      i = j;
      continue;
    }

    // $tag$ ... $tag$ / $$ ... $$
    if (c === '$') {
      let j = i + 1;
      while (j < n && TAG.test(text[j])) j += 1;
      if (text[j] === '$') {
        const tag = text.slice(i, j + 1);
        const end = text.indexOf(tag, j + 1);
        const stop = end === -1 ? n : end + tag.length;
        blank(i, stop, 'string');
        i = stop;
        continue;
      }
      // Not a dollar quote ($1 placeholders land here).
      out[i] = c;
      i += 1;
      continue;
    }

    out[i] = c;
    i += 1;
  }

  return { masked: out.join(''), inString, isComment };
}

/** Line number (1-based) of `offset` in `text`. */
function lineAt(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

/**
 * Split a migration into statements.
 *
 * Each statement carries the original text (for quoting back to the user), the
 * masked text (for matching), its 1-based start line, and `inTransaction`:
 * whether an explicit `BEGIN`/`START TRANSACTION` is open at that point.
 *
 * `inTransaction` is the field several checks turn on, and it is deliberately
 * only about *explicit* transaction blocks written in the file. Whether a
 * migration runner wraps the file in one of its own is not knowable from the
 * text, so engine.mjs reports that as a separate, clearly-labelled
 * conditional finding rather than guessing here.
 *
 * @param {string} text
 * @returns {{ text: string, masked: string, line: number, index: number, inTransaction: boolean }[]}
 */
export function splitStatements(text) {
  const { masked, isComment } = maskNonCode(text);
  const statements = [];
  let start = 0;
  let depth = 0; // explicit BEGIN ... COMMIT nesting

  const push = (from, to) => {
    const raw = text.slice(from, to);
    const maskedSlice = masked.slice(from, to);
    if (!maskedSlice.trim()) return;
    const leading = maskedSlice.length - maskedSlice.trimStart().length;
    // `display` is the statement with its comments removed but its string
    // literals intact -- what to quote back to the user. See maskNonCode.
    let display = '';
    for (let k = from; k < to && k < text.length; k += 1) {
      if (!isComment[k]) display += text[k];
    }
    const stmt = {
      text: raw.trim(),
      display: normalize(display),
      masked: normalize(maskedSlice),
      line: lineAt(text, from + leading),
      index: statements.length,
      inTransaction: depth > 0,
    };
    statements.push(stmt);
    // A transaction opened by this statement applies to the *next* one, not
    // to itself -- `BEGIN;` is not inside a transaction block.
    if (/^\s*(BEGIN|START\s+TRANSACTION)\b/i.test(stmt.masked)) depth += 1;
    else if (/^\s*(COMMIT|END|ROLLBACK)\b/i.test(stmt.masked)) depth = Math.max(0, depth - 1);
  };

  for (let i = 0; i < masked.length; i += 1) {
    if (masked[i] === ';') {
      push(start, i);
      start = i + 1;
    }
  }
  // A trailing statement with no final semicolon is still a statement.
  push(start, text.length);
  return statements;
}

/** Collapse whitespace so multi-line statements match single-line patterns. */
export function normalize(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

/**
 * The first keyword-ish token, uppercased -- used only for grouping in the
 * report, never for a decision.
 */
export function leadingKeyword(masked) {
  const m = /^([A-Za-z]+)/.exec(masked.trim());
  return m ? m[1].toUpperCase() : '';
}
