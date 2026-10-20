// Classifies the result of one introspection probe (a real HTTP response,
// collected by probe.mjs's live network request, or pasted in by hand from
// the CLI's `--json` output) into an introspection-exposure report.
//
// Pure function, no I/O, no network -- this is the module both the CLI
// (check.mjs, which sends the real request) and the browser page
// (index.html, which either sends the same request itself when the target's
// CORS policy allows it, or renders a report from JSON pasted in) import, so
// the classification logic exists exactly once. See probe.mjs for why a
// browser can sometimes run this check directly and why the CLI exists for
// when it can't.
//
// The one finding this exists to raise: GraphQL's introspection meta-fields
// (`__schema`, `__type`) let any caller enumerate a server's entire schema --
// every query, every mutation, every type and field name, whether or not a
// real client ever links to it. OWASP's API Security guidance and GraphQL's
// own production-hardening docs both name disabling introspection in
// production as standard practice, precisely because it hands an
// unauthenticated caller a map of the API's full write surface (mutations)
// before they have to guess a single field name. A name match against a
// list of sensitive-sounding words is a hint to review by hand, never proof
// of a missing authorization check -- GraphQL field-level auth is common and
// this check has no way to see it.

const BUILTIN_SCALAR_NAMES = new Set(['String', 'Int', 'Float', 'Boolean', 'ID']);

const SENSITIVE_WORDS = [
  'admin', 'delete', 'remove', 'destroy', 'reset', 'password', 'secret',
  'token', 'impersonate', 'grant', 'role', 'permission', 'billing',
  'refund', 'payout', 'internal', 'debug', 'superuser', 'root', 'privilege',
  'apikey', 'credential', 'ban', 'suspend',
];

function looksSensitive(fieldName) {
  const lower = String(fieldName).toLowerCase();
  return SENSITIVE_WORDS.some((word) => lower.includes(word));
}

function fieldNames(rootType) {
  if (!rootType || !Array.isArray(rootType.fields)) return [];
  return rootType.fields.map((f) => f?.name).filter((n) => typeof n === 'string');
}

/**
 * @param {string} target - the endpoint URL that was probed (for display only)
 * @param {{ok: boolean, status: number|null, body: unknown, error: string|null, parseError?: string|null}} probe
 * @returns {{
 *   target: string, introspectionEnabled: boolean|null, incomplete: boolean,
 *   error: string|null, queryFieldCount: number, mutationFieldCount: number,
 *   subscriptionFieldCount: number, customTypeCount: number,
 *   queryFields: string[], mutationFields: string[], subscriptionFields: string[],
 *   findings: object[], dangerCount: number, noticeCount: number, ok: boolean,
 * }}
 */
export function buildReport(target, probe) {
  const empty = {
    target,
    queryFieldCount: 0, mutationFieldCount: 0, subscriptionFieldCount: 0, customTypeCount: 0,
    queryFields: [], mutationFields: [], subscriptionFields: [],
    findings: [], dangerCount: 0, noticeCount: 0,
  };

  if (!probe || probe.ok === false) {
    return { ...empty, introspectionEnabled: null, incomplete: true, error: probe?.error ?? 'no probe result', ok: false };
  }

  const body = probe.body;
  const schema = body && typeof body === 'object' ? body?.data?.__schema : null;

  if (!schema) {
    const errors = Array.isArray(body?.errors) ? body.errors : [];
    const introspectionBlockedExplicitly = errors.some((e) => /introspection/i.test(String(e?.message ?? '')));
    const noRecognisableBody = errors.length === 0 && !(body && typeof body === 'object' && 'data' in body);
    return {
      ...empty,
      introspectionEnabled: false,
      incomplete: noRecognisableBody,
      error: errors.length > 0
        ? errors.map((e) => e?.message).filter(Boolean).join('; ')
        : (probe.parseError ?? (noRecognisableBody ? 'response did not look like a GraphQL result (no "data" or "errors" key)' : null)),
      introspectionBlockedExplicitly,
      ok: !noRecognisableBody,
    };
  }

  const queryFields = fieldNames(schema.queryType);
  const mutationFields = fieldNames(schema.mutationType);
  const subscriptionFields = fieldNames(schema.subscriptionType);
  const types = Array.isArray(schema.types) ? schema.types : [];
  const customTypeCount = types.filter(
    (t) => t && typeof t.name === 'string' && !t.name.startsWith('__') && !BUILTIN_SCALAR_NAMES.has(t.name),
  ).length;

  const sensitiveMutations = mutationFields.filter(looksSensitive);
  const sensitiveQueries = queryFields.filter(looksSensitive);

  const findings = [];
  findings.push({
    id: 'introspection-enabled',
    severity: mutationFields.length > 0 ? 'danger' : 'notice',
    title: 'Introspection is enabled',
    detail:
      `This endpoint answered an unauthenticated introspection query with its schema: ` +
      `${queryFields.length} query field(s), ${mutationFields.length} mutation field(s), ` +
      `${subscriptionFields.length} subscription field(s), and ${customTypeCount} named type(s) ` +
      `in total. Anyone can enumerate every field, mutation, and type name this API exposes -- ` +
      `including ones no client ever links to -- which is the reconnaissance step OWASP's API ` +
      `Security guidance names as the reason to disable introspection in production.` +
      (mutationFields.length > 0 ? ' The mutation surface (write operations) is included.' : ''),
    evidence: `queryType.name=${schema.queryType?.name ?? '(none)'}, mutationType.name=${schema.mutationType?.name ?? '(none)'}`,
  });

  if (sensitiveMutations.length > 0) {
    findings.push({
      id: 'sensitive-mutation-names',
      severity: 'danger',
      title: `${sensitiveMutations.length} mutation name(s) look sensitive`,
      detail:
        `Mutation field name(s) matching common sensitive-operation wording: ${sensitiveMutations.join(', ')}. ` +
        `A name match is a hint to review by hand, not proof of a missing authorization check -- ` +
        `GraphQL field-level auth is common and this check cannot see it. Worth confirming each ` +
        `one actually enforces the privilege its name implies.`,
      evidence: `mutationType.fields: ${sensitiveMutations.join(', ')}`,
    });
  }
  if (sensitiveQueries.length > 0) {
    findings.push({
      id: 'sensitive-query-names',
      severity: 'notice',
      title: `${sensitiveQueries.length} query name(s) look sensitive`,
      detail:
        `Query field name(s) matching common sensitive-data wording: ${sensitiveQueries.join(', ')}. ` +
        `Same caveat as above -- a name match, not a confirmed access-control gap.`,
      evidence: `queryType.fields: ${sensitiveQueries.join(', ')}`,
    });
  }

  const dangerCount = findings.filter((f) => f.severity === 'danger').length;
  const noticeCount = findings.filter((f) => f.severity === 'notice').length;

  return {
    target,
    introspectionEnabled: true,
    incomplete: false,
    error: null,
    queryFieldCount: queryFields.length,
    mutationFieldCount: mutationFields.length,
    subscriptionFieldCount: subscriptionFields.length,
    customTypeCount,
    queryFields, mutationFields, subscriptionFields,
    findings,
    dangerCount, noticeCount,
    ok: dangerCount === 0,
  };
}
