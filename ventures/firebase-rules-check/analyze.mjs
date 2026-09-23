// Classifies a set of probe results (real HTTP responses, collected by
// probe.mjs's live requests, or pasted in by hand) into a verdict about
// whether Firebase's Realtime Database or Firestore security rules allow an
// unauthenticated request to read real data.
//
// Pure function, no I/O, no network -- imported identically by the CLI
// (check.mjs, which fetches for real) and the browser page (index.html,
// which can fetch for real too, for the Realtime Database half -- see
// probe.mjs's header comment for the Firestore/CORS caveat).
//
// What each classification means, in Firebase's own terms:
//
//   exposed   The request returned real data to a plain, unauthenticated
//             GET: for the Realtime Database, at least one child key at the
//             probed path; for Firestore, at least one document in the
//             collection. This is the "default-open" / left-in-test-mode
//             shape documented since Appthority's 2018 "Firebase
//             mismanagement" report and recurring in security research
//             since -- security rules that read `allow read, write: if
//             true;` (or Realtime Database's equivalent `".read": true`),
//             either left over from test mode or hand-written that way.
//   blocked   HTTP 401/403 (Realtime Database) or 403 PERMISSION_DENIED
//             (Firestore) -- rules rejected the unauthenticated request
//             outright. This is the healthy outcome.
//   unconfirmed  HTTP 200 with no data: the Realtime Database path is
//             `null`, or the Firestore collection returned zero documents.
//             Genuinely ambiguous -- the same response whether the rules
//             are correctly blocking every read or the path/collection is
//             simply empty. Reported as its own category rather than
//             folded into either "exposed" or "blocked", because claiming
//             either from this response alone would be a guess.
//   error     The request itself did not complete cleanly (network error,
//             timeout, malformed response, a status this tool does not
//             classify). Never read as either finding.

function classifyRealtimeDatabase(result) {
  if (!result) return null;
  if (result.ok === false && result.status == null) {
    return { source: 'realtime-database', path: result.path, category: 'error', status: null, keyCount: 0, keys: [], error: result.error ?? 'request failed' };
  }
  const status = result.status ?? null;
  if (status === 401 || status === 403) {
    return { source: 'realtime-database', path: result.path, category: 'blocked', status, keyCount: 0, keys: [], error: null };
  }
  if (status != null && status >= 200 && status < 300) {
    const keys = result.keys ?? [];
    if (result.isNull || keys.length === 0) {
      return { source: 'realtime-database', path: result.path, category: 'unconfirmed', status, keyCount: 0, keys: [], error: null };
    }
    return { source: 'realtime-database', path: result.path, category: 'exposed', status, keyCount: keys.length, keys, error: null };
  }
  return { source: 'realtime-database', path: result.path, category: 'error', status, keyCount: 0, keys: [], error: result.error ?? `unexpected HTTP ${status}` };
}

function classifyFirestoreCollection(result) {
  const collection = result?.collection ?? '(unknown collection)';
  if (!result || (result.ok === false && result.status == null)) {
    return { source: 'firestore', collection, category: 'error', status: null, documentCount: 0, fieldNames: [], error: result?.error ?? 'request failed' };
  }
  const status = result.status ?? null;
  if (status === 401 || status === 403) {
    return { source: 'firestore', collection, category: 'blocked', status, documentCount: 0, fieldNames: [], error: null };
  }
  if (status != null && status >= 200 && status < 300) {
    const documentCount = result.documentCount ?? 0;
    if (documentCount === 0) {
      return { source: 'firestore', collection, category: 'unconfirmed', status, documentCount: 0, fieldNames: [], error: null };
    }
    return { source: 'firestore', collection, category: 'exposed', status, documentCount, fieldNames: result.fieldNames ?? [], error: null };
  }
  return { source: 'firestore', collection, category: 'error', status, documentCount: 0, fieldNames: [], error: result.error ?? `unexpected HTTP ${status}` };
}

/**
 * @param {object} probeResult - the object returned by probe.mjs's
 *   `runProbes` (or the CLI's pasted-in equivalent):
 *   `{ projectId, databaseUrl, realtimeDatabase, firestore, truncated }`
 */
export function buildReport(probeResult) {
  const { projectId = null, databaseUrl = null, realtimeDatabase = null, firestore = [], truncated = false } = probeResult ?? {};

  const rtdbClassified = classifyRealtimeDatabase(realtimeDatabase);
  const firestoreClassified = (Array.isArray(firestore) ? firestore : []).map(classifyFirestoreCollection);
  const classified = [rtdbClassified, ...firestoreClassified].filter(Boolean);

  const findings = classified
    .filter((c) => c.category === 'exposed')
    .map((c) =>
      c.source === 'realtime-database'
        ? {
            id: 'realtime-database-path-readable',
            severity: 'danger',
            location: `Realtime Database path "${c.path}"`,
            title: `Realtime Database path "${c.path}" is readable by anyone, with no login`,
            detail:
              `${c.keyCount} child key(s) returned to an unauthenticated request with no session, no ID token, ` +
              `and no server of ours involved -- the same request any visitor's browser (or curl) can send. ` +
              `Key names visible: ${c.keys.join(', ')}.`,
            evidenceStatus: `HTTP ${c.status}, shallow=true`,
          }
        : {
            id: 'firestore-collection-readable',
            severity: 'danger',
            location: `Firestore collection "${c.collection}"`,
            title: `Firestore collection "${c.collection}" is readable by anyone, with no login`,
            detail:
              `${c.documentCount} document(s) returned to an unauthenticated request with no session, no ID token, ` +
              `and no server of ours involved. ` +
              (c.fieldNames.length > 0 ? `Field names visible on the first document: ${c.fieldNames.join(', ')}.` : ''),
            evidenceStatus: `HTTP ${c.status}, pageSize=1`,
          },
    );

  const unconfirmed = classified.filter((c) => c.category === 'unconfirmed');
  const blocked = classified.filter((c) => c.category === 'blocked');
  const errors = classified.filter((c) => c.category === 'error');

  return {
    projectId,
    databaseUrl,
    checked: classified.length,
    truncated: Boolean(truncated),
    classified,
    findings,
    unconfirmed,
    blocked,
    errors,
    dangerCount: findings.length,
    ok: findings.length === 0 && classified.length > 0,
    incomplete: errors.length > 0 || classified.length === 0,
  };
}
