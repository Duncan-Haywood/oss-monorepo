/**
 * Browser-side DNS observation capture and change comparison.
 *
 * ## Why this exists alongside `src/dns_evidence/`
 *
 * The Python package is the canonical implementation and stays that way: it
 * speaks the DNS wire protocol over UDP/TCP to *named* resolvers, which is the
 * only way to record what one specific resolver answered. A browser cannot open
 * a UDP socket, so that capability is not portable and this module does not
 * pretend otherwise.
 *
 * What is portable is the part that made the venture worth building — the
 * before/after evidence record — and until now it was reachable only by cloning
 * the repo and running a CLI. An MSP mid-migration who needs to show a customer
 * what a nameserver cutover actually changed is not going to do that. This
 * module is the same workflow over DNS-over-HTTPS, from the visitor's own
 * browser, at zero marginal cost to us: no server, no account, no egress from
 * our infrastructure at all.
 *
 * ## What is deliberately identical to the Python
 *
 * `observationKey`, `observationValue`, `buildReport` and `markdownReport`
 * reimplement `report.py`'s semantics line for line, including the rule that
 * matters most: an observation whose status is uncertain compares as
 * `inconclusive` and is *never* reported as `unchanged`. A tool that quietly
 * rounded a timeout down to "no change" would be worse than no tool, because
 * the whole product is the claim that the record is honest about what it did
 * not see.
 *
 * The snapshot schema is the same too, so a `before.json` captured here loads
 * in `python3 -m dns_evidence compare` and vice versa.
 *
 * ## What is deliberately *not* identical
 *
 * Answer text is normalised by `normalizeAnswer` rather than by `report.py`'s
 * `format_rdata`, because DoH resolvers hand back already-presented strings and
 * they disagree with each other about trailing dots and TXT quoting. Comparing
 * a snapshot captured here against one captured by the CLI can therefore show a
 * cosmetic `changed` on the same underlying record. Within this tool — the case
 * an agency actually runs, both captures from the same browser — normalisation
 * is consistent and the comparison is sound. `index.html` says so in plain
 * words rather than leaving a user to discover it.
 */

/** DNS type name -> wire number, for filtering DoH answer sets. */
export const RECORD_TYPES = Object.freeze({
  A: 1, NS: 2, CNAME: 5, SOA: 6, PTR: 12, MX: 15, TXT: 16, AAAA: 28, SRV: 33, CAA: 257,
});

/**
 * Statuses that mean "we did not get a usable answer".
 *
 * Mirrors `report.py`'s `UNCERTAIN`. `capture.py`'s narrower
 * `UNCERTAIN_STATUSES` is the set a capture can *produce*; this is the set a
 * comparison must *accept*, which is why `disagreement` and `dnssec_failure`
 * are here — a snapshot from another producer may carry them.
 */
export const UNCERTAIN = Object.freeze(new Set([
  'timeout', 'disagreement', 'dnssec_failure', 'refused', 'error',
]));

/**
 * Public DoH endpoints that answer the JSON API.
 *
 * All three are free, require no key, and are queried by the visitor's browser
 * rather than by us. `id` is what lands in the snapshot as the `resolver`
 * field, so it is part of the record's identity and must stay stable — renaming
 * one would make every stored `before.json` compare as `inconclusive`.
 */
export const RESOLVERS = Object.freeze([
  { id: 'cloudflare', label: 'Cloudflare (1.1.1.1)', endpoint: 'https://cloudflare-dns.com/dns-query' },
  { id: 'google', label: 'Google (8.8.8.8)', endpoint: 'https://dns.google/resolve' },
  { id: 'quad9', label: 'Quad9 (9.9.9.9)', endpoint: 'https://dns.quad9.net:5053/dns-query' },
]);

const REQUIRED_FIELDS = ['name', 'type', 'resolver', 'observed_at'];

/** ISO 8601, seconds precision, `Z` suffix — the shape `capture.py` writes. */
export function utcNow(now = new Date()) {
  return `${now.toISOString().slice(0, 19)}Z`;
}

/**
 * Is `name` inside the domain the user declared they are authorised to query?
 *
 * Mirrors `capture.py`'s guard of the same name. This is the one check that
 * keeps the tool from being a general-purpose scanner pointed at somebody
 * else's estate: the authorisation the user affirms is scoped to a domain, so
 * every query has to fall inside it.
 */
export function nameInAuthorizedDomain(name, domain) {
  const n = String(name).toLowerCase().replace(/\.$/, '');
  const d = String(domain).toLowerCase().replace(/\.$/, '');
  if (!n || !d) return false;
  return n === d || n.endsWith(`.${d}`);
}

/**
 * Put a resolver's presented rdata into one consistent form.
 *
 * Resolvers disagree about trailing dots on names and about whether TXT strings
 * arrive quoted. Both differences are cosmetic and both would otherwise show up
 * as a `changed` finding when nothing about the zone moved — the exact false
 * positive that would cost a user trust in the report.
 */
export function normalizeAnswer(type, data) {
  const raw = String(data ?? '').trim();
  let value = raw.replace(/\s+/g, ' ');
  if (type === 'TXT') {
    // A long TXT record arrives as several quoted chunks; DNS defines the value
    // as their concatenation, so join rather than keeping the split visible.
    // TXT text is opaque: spacing inside the quotes is kept, as capture.py keeps it.
    const chunks = raw.match(/"(?:[^"\\]|\\.)*"/g);
    if (chunks) value = chunks.map((c) => c.slice(1, -1)).join('');
    return value;
  }
  // Names are case-insensitive and the root dot carries no information here.
  if (['CNAME', 'NS', 'PTR', 'MX', 'SOA', 'SRV'].includes(type)) {
    // A bare root target (`0 .`, the RFC 7505 null MX) is kept, as capture.py keeps it.
    return value.replace(/(?<=\S)\.(?=\s|$)/g, '').toLowerCase();
  }
  return value;
}

/** Identity of an observation: mirrors `report.py`'s `_key`. */
export function observationKey(observation) {
  return [
    String(observation.name).toLowerCase(),
    String(observation.type).toUpperCase(),
    String(observation.resolver),
  ];
}

/**
 * The identity as a Map key.
 *
 * NUL is the separator because DNS text can contain almost anything a friendlier
 * character might be: a TXT record holds spaces, an SPF record holds colons, and
 * `buildReport` joins *answer sets* with the same separator to compare them. A
 * space there would make `['a b']` and `['a', 'b']` compare equal, reporting a
 * real change as `unchanged`. NUL cannot appear in any of these fields.
 *
 * Written as the `\u0000` escape rather than a literal byte: a raw NUL makes git
 * treat the whole file as binary, which costs every future reviewer the diff and
 * the ability to comment on a line. It cost this one that, until CI caught it.
 */
const keyString = (observation) => observationKey(observation).join('\u0000');

/**
 * Comparable value of an observation, or `null` when nothing was observed.
 *
 * Mirrors `report.py`'s `_value`. Returning `null` for an uncertain status is
 * what makes `buildReport` say `inconclusive` instead of `unchanged`.
 */
export function observationValue(observation) {
  if (UNCERTAIN.has(observation.status)) return null;
  return [...(observation.answers ?? [])].map(String).sort();
}

/**
 * Reject a snapshot that cannot be compared, with the reason.
 *
 * Mirrors `report.py`'s `load_snapshot`. Kept strict on purpose: a malformed
 * `before.json` that loaded anyway would produce a confident-looking report
 * built on a file the user did not mean to hand over.
 */
export function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('Snapshot must be a JSON object.');
  if (snapshot.authorized !== true) throw new Error('Snapshot must declare "authorized": true.');
  if (!snapshot.domain) throw new Error('Snapshot must include a customer-authorized domain.');
  if (!Array.isArray(snapshot.observations)) throw new Error('Snapshot must include an observations list.');
  const seen = new Set();
  for (const observation of snapshot.observations) {
    if (!observation || typeof observation !== 'object') throw new Error('Each observation must be an object.');
    const missing = REQUIRED_FIELDS.filter((field) => !observation[field]);
    if (missing.length) throw new Error(`Observation missing required fields: ${missing.join(', ')}`);
    if (Number.isNaN(Date.parse(observation.observed_at))) {
      throw new Error('Observation observed_at must be an ISO 8601 timestamp.');
    }
    // `report.py` tests `"answers" not in observation`, which is exact in
    // Python. The JS equivalent has to be a null check rather than an `in`
    // check: `{answers: undefined}` survives a JSON round-trip from a producer
    // that emitted the key empty, and `in` would wave it through as a
    // successful observation carrying nothing to compare.
    if (observation.answers == null && !UNCERTAIN.has(observation.status)) {
      throw new Error('Successful observations require answers; failures require a known status.');
    }
    if (observation.answers != null && !Array.isArray(observation.answers)) {
      throw new Error('Observation answers must be a list.');
    }
    const identity = keyString(observation);
    if (seen.has(identity)) throw new Error('Snapshot contains duplicate name/type/resolver observations.');
    seen.add(identity);
  }
  if (snapshot.captured_at && Number.isNaN(Date.parse(snapshot.captured_at))) {
    throw new Error('captured_at must be an ISO 8601 timestamp.');
  }
  return snapshot;
}

/**
 * Copied verbatim from `report.py`'s `limitations`, and pinned by a test that
 * diffs both implementations' Markdown over the same snapshots.
 *
 * The wording is the Python's rather than a browser-specific rewrite on
 * purpose: these strings travel inside the report JSON, so an agency that
 * captures here and compares with the CLI (or the reverse) would otherwise get
 * two documents whose "Limits" sections disagree about what the tool claims.
 */
export const LIMITATIONS = Object.freeze([
  'This records observations from named resolvers; it does not establish global DNS truth.',
  'Inconclusive observations are not reported as unchanged.',
  'The customer must verify authorization and decide on remediation.',
]);

/**
 * Compare two snapshots of the same domain.
 *
 * Mirrors `report.py`'s `build_report`, including the union over both sides so
 * that a query present in only one capture is surfaced as `inconclusive`
 * rather than dropped. Dropping it would let a record that stopped being
 * queried disappear from the evidence silently.
 */
export function buildReport(before, after, now = new Date()) {
  if (String(before.domain).toLowerCase() !== String(after.domain).toLowerCase()) {
    throw new Error('Snapshots must describe the same domain.');
  }
  const old = new Map(before.observations.map((o) => [keyString(o), o]));
  const fresh = new Map(after.observations.map((o) => [keyString(o), o]));
  const findings = [];
  for (const identity of [...new Set([...old.keys(), ...fresh.keys()])].sort()) {
    const [name, type, resolver] = identity.split('\u0000');
    const previous = old.get(identity);
    const current = fresh.get(identity);
    const previousValue = previous ? observationValue(previous) : null;
    const currentValue = current ? observationValue(current) : null;
    let status;
    if (!previous || !current || previousValue === null || currentValue === null) status = 'inconclusive';
    else if (previousValue.join('\u0000') === currentValue.join('\u0000')) status = 'unchanged';
    else status = 'changed';
    findings.push({
      name, type, resolver, status,
      before_status: previous ? (previous.status ?? 'ok') : 'missing',
      after_status: current ? (current.status ?? 'ok') : 'missing',
      before_answers: previousValue,
      after_answers: currentValue,
      before_observed_at: previous ? previous.observed_at : null,
      after_observed_at: current ? current.observed_at : null,
    });
  }
  const counts = {};
  for (const finding of findings) counts[finding.status] = (counts[finding.status] ?? 0) + 1;
  return {
    domain: before.domain,
    before_captured_at: before.captured_at ?? null,
    after_captured_at: after.captured_at ?? null,
    generated_at: utcNow(now),
    finding_counts: counts,
    findings,
    limitations: [...LIMITATIONS],
  };
}

/** Keep arbitrary DNS text inside a Markdown table cell. */
function escapeCell(value) {
  return String(value).replace(/&/g, '&amp;').replace(/\|/g, '&#124;').replace(/`/g, '&#96;').replace(/\n/g, '<br>');
}

function displayAnswers(answers, status) {
  if (answers === null) return `${status} (not observed)`;
  if (!answers.length) return '(no answers)';
  return answers.map((a) => `\`${escapeCell(a)}\``).join('<br>');
}

/** Mirrors `report.py`'s `markdown_report`, so both producers paste alike. */
export function markdownReport(report) {
  const counts = report.finding_counts;
  const lines = [
    `# DNS evidence: \`${report.domain}\``, '',
    'This is an observation record, not a security, deliverability, or compliance warranty.', '',
    '## Summary', '',
    ['changed', 'unchanged', 'inconclusive'].map((k) => `**${k}:** ${counts[k] ?? 0}`).join(' · '),
    '', '## Findings', '',
    '| Name | Type | Resolver | Result | Before | After |', '|---|---|---|---|---|---|',
  ];
  for (const f of report.findings) {
    lines.push(`| \`${f.name}\` | \`${f.type}\` | \`${f.resolver}\` | **${f.status}** | ` +
      `${displayAnswers(f.before_answers, f.before_status)} | ${displayAnswers(f.after_answers, f.after_status)} |`);
  }
  lines.push('', '## Limits', '');
  for (const limit of report.limitations) lines.push(`- ${limit}`);
  return `${lines.join('\n')}\n`;
}

/**
 * Ask one resolver one question over DoH and record what came back.
 *
 * Every failure path produces an observation with an uncertain `status` rather
 * than throwing, because "this resolver did not answer" is itself evidence and
 * has to survive into the record. A thrown error would lose it.
 */
export async function queryResolver(name, type, resolver, {
  fetchImpl = globalThis.fetch, timeoutMs = 5000, now = () => new Date(),
} = {}) {
  const observation = {
    name: String(name).toLowerCase(),
    type: String(type).toUpperCase(),
    resolver: resolver.id,
    observed_at: utcNow(now()),
  };
  const url = `${resolver.endpoint}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(url, {
      headers: { accept: 'application/dns-json' },
      signal: controller ? controller.signal : undefined,
    });
    if (!response.ok) {
      // A 4xx/5xx from the DoH endpoint is a transport failure, not a DNS
      // answer — it says nothing about the zone, so it must not read as one.
      observation.status = response.status === 429 ? 'refused' : 'error';
      observation.detail = `HTTP ${response.status}`;
      return observation;
    }
    const body = await response.json();
    // RFC 1035 RCODEs, as the JSON API reports them.
    if (body.Status === 5) { observation.status = 'refused'; return observation; }
    if (body.Status !== 0 && body.Status !== 3) {
      observation.status = 'error';
      observation.detail = `RCODE ${body.Status}`;
      return observation;
    }
    const wanted = RECORD_TYPES[observation.type];
    // NXDOMAIN (3) and a NOERROR with no matching records are both real,
    // reportable observations of "nothing here" — an empty answers array, not
    // an uncertain status. Only the requested type is kept, so a CNAME in the
    // chain is not mistaken for the A record that was asked for.
    observation.answers = (body.Answer ?? [])
      .filter((entry) => entry.type === wanted)
      .map((entry) => normalizeAnswer(observation.type, entry.data))
      .sort();
    if (body.AD === true) observation.dnssec = 'authenticated';
    return observation;
  } catch (error) {
    observation.status = error && error.name === 'AbortError' ? 'timeout' : 'error';
    if (observation.status === 'error' && error) observation.detail = String(error.message ?? error).slice(0, 200);
    return observation;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Run a whole capture plan.
 *
 * Queries run sequentially rather than fanned out: three public resolvers times
 * a dozen names is enough concurrency to look like abuse from a single client,
 * and the tool has no deadline that would justify it.
 */
export async function captureSnapshot(plan, { querier = queryResolver, onProgress, now = () => new Date() } = {}) {
  if (plan.authorized !== true) throw new Error('Capture requires the authorization confirmation.');
  if (!plan.domain) throw new Error('Capture requires a customer-authorized domain.');
  const observations = [];
  const total = plan.queries.length * plan.resolvers.length;
  let done = 0;
  for (const query of plan.queries) {
    if (!nameInAuthorizedDomain(query.name, plan.domain)) {
      throw new Error(`"${query.name}" is outside the authorized domain "${plan.domain}".`);
    }
    for (const resolver of plan.resolvers) {
      observations.push(await querier(query.name, query.type, resolver, { now }));
      done += 1;
      if (onProgress) onProgress(done, total);
    }
  }
  return {
    authorized: true,
    domain: plan.domain,
    captured_at: utcNow(now()),
    captured_by: 'dns-configuration-evidence (browser, DNS-over-HTTPS)',
    observations,
  };
}
