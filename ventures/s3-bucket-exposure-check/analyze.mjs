// Classifies a bucket's raw listing + ACL responses (real HTTP responses,
// collected by probe.mjs's live requests) into a verdict about whether an
// S3 bucket is publicly exposed, and how.
//
// Pure function, no I/O, no network -- imported identically by the CLI
// (check.mjs) and the browser page (index.html).
//
// What this tool reads and does not read: S3's listing and ACL documents
// are XML describing the BUCKET (which keys exist, which grantees have
// which permission) -- never the bytes of a stored object. `extractKeys`
// below returns object KEY NAMES ONLY, capped to the first 10 the bucket's
// own response already capped itself to (`?max-keys=10`) -- never an
// object's content, size beyond what S3 reports, or any fetched file. A
// bucket that lists its own contents to an anonymous request is already
// evidence enough of the misconfiguration without this tool reading a
// single byte of what any of those files actually contain.
//
// Findings this tool names:
//
//   public-list             An unsigned GET to the bucket's own listing
//                            endpoint returned a real `ListBucketResult` --
//                            anyone who knows or guesses the bucket name can
//                            enumerate its object keys with no credentials.
//   public-write-acl        The bucket's ACL grants WRITE, WRITE_ACP, or
//                            FULL_CONTROL to the `AllUsers` group -- the
//                            most severe finding: anyone can upload,
//                            overwrite, or delete objects in this bucket.
//   public-read-acl         The bucket's ACL grants READ, READ_ACP, or
//                            FULL_CONTROL to the `AllUsers` group.
//   authenticated-users-grant  The ACL grants any permission to the
//                            `AuthenticatedUsers` group -- a commonly
//                            misunderstood setting: it does not mean "my
//                            own users", it means any AWS account holder
//                            anywhere, signed in with any AWS credentials
//                            at all.
//   blocked                 Both requests returned a clean AccessDenied
//                            (403) -- a healthy outcome; this tool cannot
//                            tell "correctly private" apart from "denied for
//                            some other reason", only that anonymous access
//                            was refused.
//   not-found                The bucket name does not exist
//                            (`NoSuchBucket`) -- most likely a typo; a
//                            negative result, not evidence either way about
//                            a real bucket.
//   error                    A request failed without a clean HTTP status
//                            (network error, timeout, a browser's
//                            CORS-blocked "failed to fetch"). Never read as
//                            either exposed or safe.

// S3's fixed well-known group URIs. Only these two are ever meaningful to a
// security check -- LogDelivery and others exist but grant nothing an
// anonymous internet visitor benefits from.
const ALL_USERS_URI = 'http://acs.amazonaws.com/groups/global/AllUsers';
const AUTHENTICATED_USERS_URI = 'http://acs.amazonaws.com/groups/global/AuthenticatedUsers';

const WRITE_PERMISSIONS = new Set(['WRITE', 'WRITE_ACP', 'FULL_CONTROL']);
const READ_PERMISSIONS = new Set(['READ', 'READ_ACP', 'FULL_CONTROL']);

function tag(xml, name) {
  const m = new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml);
  return m ? m[1] : null;
}

function allTags(xml, name) {
  const re = new RegExp(`<${name}>([^<]*)</${name}>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

/** Object key NAMES only, in the order S3's own response lists them --
 * already capped by this tool's own `?max-keys=10` request, so there is
 * nothing further to truncate here. See this file's header comment for why
 * object CONTENT is never read at all. */
export function extractKeys(xml) {
  if (typeof xml !== 'string') return [];
  return allTags(xml, 'Key');
}

/** Parses an `AccessControlPolicy` document into per-grantee-group
 * permission sets. Only the two group URIs a security finding can be built
 * from are extracted; canonical-user (individual AWS account) grants are
 * ignored -- they are not an anonymous-internet exposure. */
export function extractGroupGrants(xml) {
  if (typeof xml !== 'string') return { allUsers: [], authenticatedUsers: [] };
  const allUsers = new Set();
  const authenticatedUsers = new Set();
  const grantRe = /<Grant>([\s\S]*?)<\/Grant>/g;
  let m;
  while ((m = grantRe.exec(xml)) !== null) {
    const block = m[1];
    const uri = tag(block, 'URI');
    const permission = tag(block, 'Permission');
    if (!uri || !permission) continue;
    if (uri === ALL_USERS_URI) allUsers.add(permission);
    else if (uri === AUTHENTICATED_USERS_URI) authenticatedUsers.add(permission);
  }
  return { allUsers: [...allUsers], authenticatedUsers: [...authenticatedUsers] };
}

function classifyListing(listing) {
  if (!listing) return { state: 'error', error: 'no listing result' };
  if (!listing.ok) {
    const code = listing.text ? tag(listing.text, 'Code') : null;
    if (code === 'NoSuchBucket' || listing.status === 404 && !listing.text) {
      return { state: 'not-found' };
    }
    if (listing.status === 403 || code === 'AccessDenied') {
      return { state: 'blocked' };
    }
    return { state: 'error', error: listing.error ?? `HTTP ${listing.status ?? 'unknown'}` };
  }
  if (!/<ListBucketResult/.test(listing.text ?? '')) {
    // A 200 that is not a real listing document -- do not guess.
    return { state: 'error', error: 'unexpected response shape' };
  }
  const keys = extractKeys(listing.text);
  return { state: 'public-list', keys, keyCount: keys.length };
}

function classifyAcl(acl) {
  if (!acl) return { state: 'error', error: 'no ACL result' };
  if (!acl.ok) {
    const code = acl.text ? tag(acl.text, 'Code') : null;
    if (code === 'NoSuchBucket') return { state: 'not-found' };
    if (acl.status === 403 || code === 'AccessDenied') return { state: 'blocked' };
    return { state: 'error', error: acl.error ?? `HTTP ${acl.status ?? 'unknown'}` };
  }
  if (!/<AccessControlPolicy/.test(acl.text ?? '')) {
    return { state: 'error', error: 'unexpected response shape' };
  }
  const grants = extractGroupGrants(acl.text);
  return { state: 'readable', ...grants };
}

/**
 * @param {string} bucket - the bucket name checked, for display only
 * @param {{listing: object, acl: object}} raw - probe.mjs's raw per-request results
 */
export function buildReport(bucket, raw) {
  const listing = classifyListing(raw?.listing);
  const acl = classifyAcl(raw?.acl);
  const findings = [];

  if (listing.state === 'public-list') {
    findings.push({
      id: 'public-list',
      severity: 'critical',
      title: 'Anonymous listing is enabled -- anyone can enumerate this bucket\'s object keys',
      detail:
        `An unsigned GET request listed ${listing.keyCount} object key(s) with no credentials at all. ` +
        `Object CONTENTS are never fetched by this report -- only the key (file) names S3's own listing ` +
        `response already returned.`,
      sampleKeys: listing.keys,
    });
  }

  if (acl.state === 'readable') {
    const write = acl.allUsers.filter((p) => WRITE_PERMISSIONS.has(p));
    const read = acl.allUsers.filter((p) => READ_PERMISSIONS.has(p));
    if (write.length > 0) {
      findings.push({
        id: 'public-write-acl',
        severity: 'critical',
        title: 'The bucket ACL grants write access to anyone on the internet',
        detail:
          `The "AllUsers" group (anonymous, no AWS account required) holds ${write.join(', ')} on this ` +
          `bucket's ACL -- anyone can upload, overwrite, or delete objects, not just read them.`,
        permissions: write,
      });
    }
    if (read.length > 0) {
      findings.push({
        id: 'public-read-acl',
        severity: 'critical',
        title: 'The bucket ACL grants read access to anyone on the internet',
        detail:
          `The "AllUsers" group (anonymous, no AWS account required) holds ${read.join(', ')} on this ` +
          `bucket's ACL.`,
        permissions: read,
      });
    }
    if (acl.authenticatedUsers.length > 0) {
      findings.push({
        id: 'authenticated-users-grant',
        severity: 'danger',
        title: '"AuthenticatedUsers" holds a grant -- this means ANY AWS account, not your own users',
        detail:
          `The ACL grants ${acl.authenticatedUsers.join(', ')} to the "AuthenticatedUsers" group. This is ` +
          `a commonly misunderstood S3 setting: it does not scope to your organisation's users -- it means ` +
          `anyone who has ever created any AWS account, signed in with their own credentials.`,
        permissions: acl.authenticatedUsers,
      });
    }
  }

  const notFound = listing.state === 'not-found' || acl.state === 'not-found';
  const errors = [listing, acl].filter((c) => c.state === 'error');
  const blocked = [listing, acl].filter((c) => c.state === 'blocked');

  return {
    bucket,
    listing,
    acl,
    findings,
    criticalCount: findings.filter((f) => f.severity === 'critical').length,
    dangerCount: findings.filter((f) => f.severity === 'danger').length,
    notFound,
    blockedCount: blocked.length,
    errors: errors.map((e) => e.error),
    incomplete: errors.length > 0,
    ok: findings.length === 0,
  };
}
