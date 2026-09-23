// Classifies a set of per-table probe results (real HTTP responses,
// collected by probe.mjs's live requests, or pasted in by hand) into a
// verdict about whether the anon key can read real rows from a table with no
// Row Level Security in effect.
//
// Pure function, no I/O, no network -- imported identically by the CLI
// (check.mjs, which fetches for real) and the browser page (index.html,
// which can fetch for real too, since neither header PostgREST reads is
// forbidden the way CORS's Origin is -- see probe.mjs's header comment).
//
// What each classification means, in PostgREST/Supabase's own terms:
//
//   exposed   The anon key received at least one real row (or a nonzero
//             exact count) from this table. This is the CVE-2025-48757 /
//             "170+ Lovable apps" shape: RLS is off (or a policy exists but
//             is broader than intended), and the anon role's default schema
//             USAGE grant is enough on its own to read it.
//   blocked   HTTP 401/403 -- either RLS is enabled and its policies reject
//             this key outright, or the anon role has no grant on the table
//             at all. Either way, nothing was readable. This is the healthy
//             outcome.
//   unconfirmed  HTTP 200 with zero rows and an exact count of zero (or no
//             count header at all). This is genuinely ambiguous: it is the
//             same response whether RLS is correctly blocking every row *or*
//             the table simply has no rows yet. Reported as its own category
//             rather than folded into either "exposed" or "blocked", because
//             claiming either one from this response alone would be a
//             guess -- the report says exactly that and suggests the one
//             way to resolve it (insert one throwaway test row, or check
//             from the Supabase dashboard directly).
//   error     The request itself did not complete cleanly (network error,
//             timeout, malformed response) or returned a status this tool
//             does not classify (e.g. 5xx). Never read as either finding --
//             an error is not evidence of anything about RLS.

function classifyOne(result) {
  const table = result?.table ?? '(unknown table)';
  if (!result || result.ok === false && result.status == null) {
    return { table, category: 'error', status: null, rowsReturned: 0, totalCount: null, columns: [], error: result?.error ?? 'request failed' };
  }
  const status = result.status ?? null;
  const rowsReturned = result.rowsReturned ?? 0;
  const totalCount = result.totalCount ?? null;
  const columns = result.columns ?? [];

  if (status === 401 || status === 403) {
    return { table, category: 'blocked', status, rowsReturned, totalCount, columns, error: null };
  }
  if (status != null && status >= 200 && status < 300) {
    if (rowsReturned > 0 || (totalCount != null && totalCount > 0)) {
      return { table, category: 'exposed', status, rowsReturned, totalCount, columns, error: null };
    }
    return { table, category: 'unconfirmed', status, rowsReturned, totalCount, columns, error: null };
  }
  return { table, category: 'error', status, rowsReturned, totalCount, columns, error: result.error ?? `unexpected HTTP ${status}` };
}

/**
 * @param {string} baseUrl - the project's REST base URL, for display only
 * @param {object[]} results - probe.mjs's per-table results (or the CLI's
 *   pasted JSON), each `{table, ok, status, rowsReturned, totalCount, columns, error}`
 * @param {{schemaError?: string|null, truncated?: boolean}} [meta]
 */
export function buildReport(baseUrl, results, meta = {}) {
  const list = Array.isArray(results) ? results : [];
  const classified = list.map(classifyOne);

  const findings = classified
    .filter((c) => c.category === 'exposed')
    .map((c) => ({
      id: 'table-readable-without-rls',
      severity: 'danger',
      table: c.table,
      title: `"${c.table}" is readable by anyone holding this anon key`,
      detail:
        (c.totalCount != null
          ? `${c.totalCount} row(s) total, `
          : '') +
        `${c.rowsReturned} row(s) returned to an unauthenticated request with no session, no login, ` +
        `and no server of ours involved -- the same request any visitor's browser (or curl) can send. ` +
        (c.columns.length > 0 ? `Columns visible: ${c.columns.join(', ')}.` : ''),
      evidenceStatus: `HTTP ${c.status}`,
    }));

  const unconfirmed = classified.filter((c) => c.category === 'unconfirmed');
  const blocked = classified.filter((c) => c.category === 'blocked');
  const errors = classified.filter((c) => c.category === 'error');

  const schemaError = meta.schemaError ?? null;
  const incomplete = Boolean(schemaError) || errors.length > 0;

  return {
    baseUrl,
    tablesChecked: classified.length,
    truncated: Boolean(meta.truncated),
    schemaError,
    classified,
    findings,
    unconfirmed,
    blocked,
    errors,
    dangerCount: findings.length,
    ok: !schemaError && findings.length === 0,
    incomplete,
  };
}
