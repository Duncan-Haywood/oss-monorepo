// Pure logic for the cloud bucket exposure check: no network, no I/O. Two
// jobs live here, kept separate from the network layer (probe.mjs) the same
// way git-exposure-check and subdomain-takeover-check split theirs, so the
// CLI (which fetches for real) and the browser page (which can only ever
// analyse a payload someone already fetched) import exactly one
// classification engine each.
//
//   1. `resolveTarget` -- turn a bucket URL or a provider+bucket pair into
//      the one HTTP GET this tool ever sends: the bucket's own anonymous
//      LIST-contents endpoint, in each provider's own documented form.
//   2. `buildReport` -- classify the response into a verdict, reading the
//      response BODY (a provider's own listing-or-error XML), not just the
//      status code -- the same reason git-exposure-check reads a body
//      instead of trusting a bare 200/403/404.
//
// Three providers, one shared XML shape for two of them. AWS S3's classic
// listing API and Google Cloud Storage's XML API are both S3-compatible:
// a public bucket answers with a `<ListBucketResult>` root element holding
// one `<Contents><Key>...</Key></Contents>` per object; a private or
// missing bucket answers with an `<Error><Code>...</Code></Error>` naming
// AccessDenied or NoSuchBucket. Azure Blob Storage's container-listing API
// is its own schema (`<EnumerationResults>` / `<Blobs><Blob><Name>`), but
// the same three-way shape -- public listing, denied, not found -- applies.
//
// What this deliberately never does: fetch any individual object's content.
// The one request this tool sends is a LIST, never a GET on a listed key --
// finding out a bucket is publicly listable is the exposure; downloading
// what is inside it is a different, higher-liability action a real
// penetration test would take with authorisation, the same restraint
// git-exposure-check documents for not requesting `.git/index` or a packed
// object once HEAD/config already confirm exposure.

/** The three providers this tool understands. */
export const PROVIDERS = ['s3', 'gcs', 'azure'];

// A bucket/container name valid under AWS's and GCS's shared naming rules:
// 3-63 chars, lowercase letters, digits, dots and hyphens, must start and
// end with a letter or digit. Loose on purpose -- this only has to reject
// something that obviously is not a bucket name (a stray "/" or space),
// not fully validate one; an over-strict check would reject a real bucket
// this tool has never seen a name shape for.
const BUCKET_NAME_RE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/i;
// Azure storage account names: 3-24 chars, lowercase letters and digits only.
const AZURE_ACCOUNT_RE = /^[a-z0-9]{3,24}$/i;
// Azure containers follow the same rule as S3/GCS buckets minus dots.
const AZURE_CONTAINER_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/i;

/**
 * Build the one URL this tool ever requests -- a provider's anonymous
 * bucket-listing endpoint -- from an explicit provider + bucket (+ account
 * for Azure).
 *
 * @returns {{ok: true, provider: string, bucket: string, account: string|null,
 *   probeUrl: string} | {ok: false, error: string}}
 */
export function buildProbeUrl({ provider, bucket, account } = {}) {
  if (!PROVIDERS.includes(provider)) {
    return { ok: false, error: `unknown provider "${provider}" -- expected one of ${PROVIDERS.join(', ')}` };
  }
  if (typeof bucket !== 'string' || !bucket) {
    return { ok: false, error: 'a bucket (or container) name is required' };
  }

  if (provider === 's3') {
    if (!BUCKET_NAME_RE.test(bucket)) return { ok: false, error: `"${bucket}" is not a plausible S3 bucket name` };
    // Path-style, not virtual-hosted: works for every bucket name (a name
    // containing a dot breaks the virtual-hosted TLS certificate match) and
    // needs no region guess -- AWS's path-style endpoint 307-redirects to
    // the bucket's real region, which the probe layer follows.
    return { ok: true, provider, bucket, account: null, probeUrl: `https://s3.amazonaws.com/${encodeURIComponent(bucket)}` };
  }

  if (provider === 'gcs') {
    if (!BUCKET_NAME_RE.test(bucket)) return { ok: false, error: `"${bucket}" is not a plausible GCS bucket name` };
    return { ok: true, provider, bucket, account: null, probeUrl: `https://storage.googleapis.com/${encodeURIComponent(bucket)}` };
  }

  // azure
  if (!account || !AZURE_ACCOUNT_RE.test(account)) {
    return { ok: false, error: 'azure needs a storage account name (3-24 lowercase letters/digits) via --account' };
  }
  if (!AZURE_CONTAINER_RE.test(bucket)) {
    return { ok: false, error: `"${bucket}" is not a plausible Azure container name` };
  }
  return {
    ok: true,
    provider,
    bucket,
    account,
    probeUrl: `https://${account}.blob.core.windows.net/${encodeURIComponent(bucket)}?restype=container&comp=list`,
  };
}

// Recognises the bucket-root URL shapes each provider's own docs describe,
// so a caller can paste a URL they already have instead of splitting it
// into provider/bucket/account by hand.
const S3_VIRTUAL_HOSTED_RE = /^([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])\.s3[.-]([a-z0-9-]+\.)?amazonaws\.com$/i;
const S3_PATH_STYLE_RE = /^s3[.-]([a-z0-9-]+\.)?amazonaws\.com$/i;
const GCS_VIRTUAL_HOSTED_RE = /^([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])\.storage\.googleapis\.com$/i;
const GCS_PATH_STYLE_HOST = 'storage.googleapis.com';
const AZURE_HOST_RE = /^([a-z0-9]{3,24})\.blob\.core\.windows\.net$/i;

/**
 * Parse a bucket-root URL the caller already has into the same shape
 * `buildProbeUrl` returns, detecting the provider from the hostname.
 *
 * @returns {{ok: true, provider, bucket, account, probeUrl} | {ok: false, error}}
 */
export function detectTargetFromUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch (err) {
    return { ok: false, error: `not a valid URL: ${err.message}` };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: `unsupported scheme: ${url.protocol}` };
  }
  const host = url.hostname;

  let m = S3_VIRTUAL_HOSTED_RE.exec(host);
  if (m) return buildProbeUrl({ provider: 's3', bucket: m[1] });

  if (S3_PATH_STYLE_RE.test(host)) {
    const bucket = url.pathname.replace(/^\/+/, '').split('/')[0];
    if (!bucket) return { ok: false, error: 'path-style S3 URL is missing the bucket name in its path' };
    return buildProbeUrl({ provider: 's3', bucket });
  }

  m = GCS_VIRTUAL_HOSTED_RE.exec(host);
  if (m) return buildProbeUrl({ provider: 'gcs', bucket: m[1] });

  if (host.toLowerCase() === GCS_PATH_STYLE_HOST) {
    const bucket = url.pathname.replace(/^\/+/, '').split('/')[0];
    if (!bucket) return { ok: false, error: 'GCS URL is missing the bucket name in its path' };
    return buildProbeUrl({ provider: 'gcs', bucket });
  }

  m = AZURE_HOST_RE.exec(host);
  if (m) {
    const container = url.pathname.replace(/^\/+/, '').split('/')[0];
    if (!container) return { ok: false, error: 'Azure blob URL is missing the container name in its path' };
    return buildProbeUrl({ provider: 'azure', bucket: container, account: m[1] });
  }

  return {
    ok: false,
    error:
      `unrecognised host "${host}" -- expected an S3 bucket (*.s3.amazonaws.com or s3.amazonaws.com/<bucket>), ` +
      'a GCS bucket (storage.googleapis.com/<bucket> or *.storage.googleapis.com), or an Azure container ' +
      '(*.blob.core.windows.net/<container>)',
  };
}

// -- Response classification -------------------------------------------

const LIST_BUCKET_RESULT_RE = /<ListBucketResult[\s>]/i;
const ENUMERATION_RESULTS_RE = /<EnumerationResults[\s>]/i;
const ERROR_CODE_RE = /<Code>([^<]+)<\/Code>/i;
const KEY_RE = /<Key>([^<]*)<\/Key>/g;
const IS_TRUNCATED_RE = /<IsTruncated>\s*(true|false)\s*<\/IsTruncated>/i;
// Each <Blob> entry's own first child is always <Name> in Azure's schema;
// the lazy [\s\S]*? stops at the first match after each <Blob> opening tag.
const AZURE_BLOB_NAME_RE = /<Blob>[\s\S]*?<Name>([^<]*)<\/Name>/g;
const AZURE_NEXT_MARKER_RE = /<NextMarker>\s*([^<\s][^<]*)?<\/NextMarker>/i;

// Error codes that mean "this bucket/container exists and refused an
// anonymous listing" -- the good outcome.
const DENIED_CODES = new Set([
  'AccessDenied',
  'PublicAccessNotPermitted',
  'AuthorizationPermissionMismatch',
  'AuthenticationFailed',
  'InvalidAccessKeyId',
]);
// Error codes that mean "no such bucket/container" -- not a security
// finding, just a name that does not resolve to anything.
const NOT_FOUND_CODES = new Set(['NoSuchBucket', 'BucketNotFound', 'ContainerNotFound', 'ResourceNotFound']);

const MAX_SAMPLE_KEYS = 5;

function decodeXmlEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractKeys(bodySample, re) {
  const keys = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(bodySample)) !== null && keys.length < MAX_SAMPLE_KEYS) {
    keys.push(decodeXmlEntities(m[1]));
  }
  return keys;
}

function countMatches(bodySample, re) {
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(bodySample) !== null) n++;
  return n;
}

/**
 * Classify one probe response into a verdict. Pure and deterministic --
 * matches a response body against each provider's own documented XML
 * shape, the same "read the body, not just the status" approach
 * git-exposure-check uses for a soft-404-proof result.
 *
 * @param {string} target - display label (the URL that was probed)
 * @param {{status: number|null, bodySample: string, provider: string,
 *   truncated?: boolean, error: string|null}} probe
 * @returns {{target, provider, status, findings: object[], dangerCount,
 *   ok: boolean, incomplete: boolean, state: string}}
 */
export function buildReport(target, probe) {
  const p = probe && typeof probe === 'object' ? probe : {};
  const provider = p.provider ?? null;
  const status = typeof p.status === 'number' ? p.status : null;
  const body = typeof p.bodySample === 'string' ? p.bodySample : '';
  const incomplete = p.ok === false || status === null;

  if (incomplete) {
    return {
      target,
      provider,
      status,
      findings: [],
      dangerCount: 0,
      ok: false,
      incomplete: true,
      state: 'error',
      error: p.error ?? 'no response',
    };
  }

  const isS3Style = provider === 's3' || provider === 'gcs';
  const looksPublicS3 = isS3Style && LIST_BUCKET_RESULT_RE.test(body);
  const looksPublicAzure = provider === 'azure' && ENUMERATION_RESULTS_RE.test(body);
  const errorMatch = ERROR_CODE_RE.exec(body);
  const errorCode = errorMatch ? errorMatch[1] : null;

  const findings = [];
  let state = 'unknown';

  if (looksPublicS3 || looksPublicAzure) {
    const sampleKeys = looksPublicS3 ? extractKeys(body, KEY_RE) : extractKeys(body, AZURE_BLOB_NAME_RE);
    const objectCount = looksPublicS3 ? countMatches(body, KEY_RE) : countMatches(body, AZURE_BLOB_NAME_RE);
    const truncated = looksPublicS3
      ? /true/i.test(IS_TRUNCATED_RE.exec(body)?.[1] ?? '')
      : AZURE_NEXT_MARKER_RE.test(body);
    state = 'public-listing';
    findings.push({
      id: 'bucket-publicly-listable',
      severity: 'danger',
      title: `This ${provider === 'azure' ? 'container' : 'bucket'} allows anonymous public listing`,
      detail:
        `The response is a real, well-formed ${provider === 'azure' ? 'Azure container-listing (EnumerationResults)' : provider === 'gcs' ? 'GCS bucket-listing (ListBucketResult)' : 'S3 bucket-listing (ListBucketResult)'} ` +
        `document, not an access-denied error -- anyone on the internet can enumerate its contents with no ` +
        `credentials. Object names alone are already often sensitive (customer IDs, internal filenames, backup ` +
        `dates); if the bucket is ALSO configured for public object read, every listed name is directly ` +
        `downloadable. This tool did not fetch any object's content -- only the listing -- so it cannot say ` +
        `whether public-read is also enabled; verify that separately in the provider's own console before ` +
        `assuming otherwise.`,
      objectCount,
      sampleKeys,
      truncated,
    });
  } else if (errorCode && DENIED_CODES.has(errorCode)) {
    state = 'private';
  } else if (errorCode && NOT_FOUND_CODES.has(errorCode)) {
    state = 'not-found';
  } else if (status === 404) {
    state = 'not-found';
  } else if (status === 403) {
    // A 403 with no parseable <Code> is still a denial -- treat the same as
    // a matched DENIED_CODES entry rather than falling through to "unknown".
    state = 'private';
  } else {
    state = 'unknown';
  }

  const dangerCount = findings.filter((f) => f.severity === 'danger').length;

  return {
    target,
    provider,
    status,
    findings,
    dangerCount,
    ok: dangerCount === 0 && state !== 'unknown',
    incomplete: false,
    state,
    error: null,
  };
}
