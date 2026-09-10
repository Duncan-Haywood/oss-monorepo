// Classifies a set of CORS probe results (real HTTP responses, collected by
// probe.mjs's live network requests or pasted in by hand) into named CORS
// misconfiguration patterns.
//
// Pure function, no I/O, no network -- this is the module both the CLI
// (check.mjs, which fetches for real) and the browser page (index.html,
// which can only ever analyse a payload someone already fetched) import, so
// the classification logic exists exactly once.
//
// Why the browser can never fetch this itself: `Origin` is a forbidden
// request-header name under the WHATWG Fetch spec, so `fetch()`/`XHR` inside
// a browser tab cannot set it to anything but the page's own origin --
// that restriction is part of what CORS protects, and no page running this
// checker can spoof around it. Only a non-browser HTTP client (this CLI,
// curl, Corsy, etc.) can send the crafted Origin headers these probes need.
// See README.md and index.html's FAQ for the fuller explanation.
//
// The four probes and what each one tests, in the terms PortSwigger's Web
// Security Academy "CORS" material and the wider bug-bounty literature use:
//
//   reflect        An origin with no relationship to the target at all
//                   ("https://cors-probe-<random>.invalid"). If the server's
//                   Access-Control-Allow-Origin echoes it back verbatim, the
//                   server trusts *any* origin -- the broadest possible
//                   misconfiguration.
//   null-origin    Origin: null. A sandboxed iframe or a `data:` URI sends
//                   this automatically, so an attacker-controlled page can
//                   trigger it with no special setup. A server that reflects
//                   `null` is trusting an origin any attacker can produce.
//   prefix-match   Origin = the target's own origin plus an attacker-chosen
//                   suffix ("https://target.example.com.attacker.invalid").
//                   Passes a naive `origin.startsWith(allowedOrigin)` check.
//   suffix-match   Origin = an attacker-chosen prefix plus the target's
//                   hostname ("https://evil-target.example.com"). Passes a
//                   naive `origin.endsWith(allowedHost)` or
//                   `origin.includes(allowedHost)` check with no dot-boundary
//                   anchor.
//   same-origin    Origin = the target's own origin. This one is not an
//                   attack, and a server echoing it back is never a finding
//                   on its own -- that is the correct, healthy answer. It
//                   exists so the Vary: Origin check below can fire on a
//                   server whose allow-list *works*, which is the only
//                   population that check was ever about. See the note on
//                   `missing-vary-origin`.
//
// A server correctly validating against an explicit allow-list should never
// reflect any of the four attack origins back -- rejecting them is the
// expected, healthy result and is why a clean report says so rather than
// just staying silent.

export const PROBE_LABELS = [
  'baseline', 'reflect', 'null-origin', 'prefix-match', 'suffix-match', 'same-origin',
];

function norm(value) {
  return typeof value === 'string' ? value.trim() : null;
}

function isTrue(value) {
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

function acao(probe) {
  return norm(probe?.headers?.['access-control-allow-origin']);
}

function acac(probe) {
  return norm(probe?.headers?.['access-control-allow-credentials']);
}

function vary(probe) {
  return norm(probe?.headers?.vary);
}

function reflectsRequestOrigin(probe) {
  const value = acao(probe);
  return value !== null && probe.requestOrigin !== null && value === probe.requestOrigin;
}

function byLabel(probes) {
  const map = new Map();
  for (const probe of probes || []) {
    if (probe && typeof probe.label === 'string') map.set(probe.label, probe);
  }
  return map;
}

/**
 * @param {string} target - the URL that was probed (for display only)
 * @param {Array<{label: string, requestOrigin: string|null, ok: boolean,
 *   status: number|null, headers: Record<string,string|null>, error: string|null}>} probes
 * @returns {{
 *   target: string, probes: object[], findings: object[],
 *   dangerCount: number, noticeCount: number, ok: boolean, incomplete: boolean,
 * }}
 */
export function buildReport(target, probes) {
  const list = Array.isArray(probes) ? probes : [];
  const map = byLabel(list);
  const findings = [];

  const failed = list.filter((p) => p && p.ok === false).map((p) => p.label);
  const incomplete = failed.length > 0;

  const reflect = map.get('reflect');
  if (reflect && reflect.ok !== false && reflectsRequestOrigin(reflect)) {
    findings.push({
      id: 'reflects-arbitrary-origin',
      severity: 'danger',
      title: 'Reflects an unrelated origin',
      detail:
        `Sent Origin: ${reflect.requestOrigin} (an origin with no relationship to this site) ` +
        `and the response echoed it back verbatim in Access-Control-Allow-Origin. This server ` +
        `trusts any origin at all, not a specific allow-list.` +
        (isTrue(acac(reflect))
          ? ' Access-Control-Allow-Credentials is also true, so any site on the web can make ' +
            "authenticated requests as a logged-in visitor and read the response."
          : ''),
      probeLabel: 'reflect',
      requestOrigin: reflect.requestOrigin,
      evidenceHeader: `access-control-allow-origin: ${acao(reflect)}`,
    });
  }

  const nullOrigin = map.get('null-origin');
  if (nullOrigin && nullOrigin.ok !== false && acao(nullOrigin) === 'null') {
    findings.push({
      id: 'accepts-null-origin',
      severity: 'danger',
      title: 'Accepts Origin: null',
      detail:
        'Access-Control-Allow-Origin: null trusts the literal string "null" as an origin. ' +
        'A sandboxed iframe or a data: URI sends Origin: null automatically, so any attacker-' +
        'controlled page can produce this origin with no domain of their own.',
      probeLabel: 'null-origin',
      requestOrigin: 'null',
      evidenceHeader: `access-control-allow-origin: ${acao(nullOrigin)}`,
    });
  }

  for (const label of ['prefix-match', 'suffix-match']) {
    const probe = map.get(label);
    if (probe && probe.ok !== false && reflectsRequestOrigin(probe)) {
      const kind = label === 'prefix-match' ? 'startsWith' : 'endsWith/includes';
      findings.push({
        id: 'unanchored-origin-match',
        severity: 'danger',
        title: `Origin allow-list looks unanchored (${label})`,
        detail:
          `Sent Origin: ${probe.requestOrigin}, an attacker-registrable domain built to pass a ` +
          `naive \`${kind}\` string check against this site's real origin/hostname, and the ` +
          `response reflected it back. The allow-list check needs an exact match or a properly ` +
          `dot-anchored subdomain check, not a substring test.`,
        probeLabel: label,
        requestOrigin: probe.requestOrigin,
        evidenceHeader: `access-control-allow-origin: ${acao(probe)}`,
      });
    }
  }

  const wildcardWithCreds = list.find(
    (p) => p && p.ok !== false && acao(p) === '*' && isTrue(acac(p)),
  );
  if (wildcardWithCreds) {
    findings.push({
      id: 'wildcard-with-credentials',
      severity: 'notice',
      title: 'Wildcard origin with credentials allowed',
      detail:
        'Access-Control-Allow-Origin: * together with Access-Control-Allow-Credentials: true is ' +
        'invalid under the Fetch spec, and current browsers refuse to expose a credentialed ' +
        'response in this case -- so this is unlikely to be directly exploitable through a ' +
        'browser today. It still signals a copy-pasted or overly permissive CORS policy worth ' +
        'reviewing, and a non-browser HTTP client would not enforce the block.',
      probeLabel: wildcardWithCreds.label,
      requestOrigin: wildcardWithCreds.requestOrigin,
      evidenceHeader: `access-control-allow-origin: * ; access-control-allow-credentials: ${acac(wildcardWithCreds)}`,
    });
  }

  // Vary: Origin. This used to look only at the `reflect` probe, which meant
  // it could only ever fire on a server that had *already* been flagged as
  // trusting arbitrary origins -- so for the population it actually matters
  // for (a working allow-list that echoes each permitted origin back and
  // forgets to say the response varies by it, the ordinary shape behind CORS
  // cache poisoning) the check was dead. The `same-origin` probe exists to
  // give it a case it can see.
  //
  // The discrimination that keeps this from crying wolf is `baseline`: a
  // server that sends the same Access-Control-Allow-Origin with no Origin
  // header at all is answering statically, and a cache cannot confuse a
  // response that is identical for everybody. Only a header that changes
  // with the request needs Vary.
  const baseline = map.get('baseline');
  const staticAcao =
    baseline && baseline.ok !== false ? acao(baseline) : null;
  const varyCandidate = ['reflect', 'same-origin', 'null-origin', 'prefix-match', 'suffix-match']
    .map((label) => map.get(label))
    .find(
      (probe) =>
        probe &&
        probe.ok !== false &&
        reflectsRequestOrigin(probe) &&
        acao(probe) !== staticAcao &&
        !(vary(probe) || '').toLowerCase().includes('origin'),
    );
  if (varyCandidate) {
    findings.push({
      id: 'missing-vary-origin',
      severity: 'notice',
      title: 'Dynamic origin with no Vary: Origin',
      detail:
        'The response reflects the request Origin back but does not send Vary: Origin. A shared ' +
        'or intermediary cache that does not know the response varies by Origin can serve one ' +
        "visitor's CORS-permissive response to a different origin's request." +
        (varyCandidate.label === 'same-origin'
          ? ' This one is worth reading carefully: the allow-list itself is behaving correctly ' +
            'here -- it echoed back an origin it should echo back. The risk is the caching layer ' +
            'in front of it, not the check behind it.'
          : ''),
      probeLabel: varyCandidate.label,
      requestOrigin: varyCandidate.requestOrigin,
      evidenceHeader: `vary: ${vary(varyCandidate) ?? '(not set)'}`,
    });
  }

  const dangerCount = findings.filter((f) => f.severity === 'danger').length;
  const noticeCount = findings.filter((f) => f.severity === 'notice').length;

  return {
    target,
    probes: list.map((p) => ({
      label: p.label,
      requestOrigin: p.requestOrigin ?? null,
      ok: p.ok !== false,
      status: p.status ?? null,
      headers: p.headers ?? {},
      error: p.error ?? null,
    })),
    findings,
    dangerCount,
    noticeCount,
    ok: !incomplete && dangerCount === 0,
    incomplete,
    failedProbes: failed,
  };
}
