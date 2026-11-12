import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck, formatText, parseArgs, main } from './check.mjs';
import { verdictFor } from './analyze.mjs';

function fakeChain(map) {
  return async (hostname) => map[hostname] ?? { chain: [hostname], finalTarget: null, truncated: false, error: null };
}

test('runCheck reports ok:true and sends no probe when the hostname has no risky CNAME', async () => {
  let probeCalled = false;
  const report = await runCheck(['example.com'], {
    resolveCnameChainFn: fakeChain({}),
    fetchHostnameFn: async () => { probeCalled = true; return { ok: true, status: 200, text: '', error: null }; },
  });
  assert.equal(report.ok, true);
  assert.equal(probeCalled, false, 'no point probing a hostname that matched no provider');
});

test('runCheck sends a probe and confirms a finding for a matched, dangling target', async () => {
  const report = await runCheck(['blog.example.com'], {
    resolveCnameChainFn: fakeChain({
      'blog.example.com': { chain: ['blog.example.com', 'old-app.herokuapp.com'], finalTarget: 'old-app.herokuapp.com', truncated: false, error: null },
    }),
    fetchHostnameFn: async () => ({ ok: true, status: 404, text: 'No such app', error: null }),
  });
  assert.equal(report.ok, false);
  assert.equal(report.confirmedCount, 1);
});

test('runCheck reports unconfirmed when the matched target is actually in use', async () => {
  const report = await runCheck(['blog.example.com'], {
    resolveCnameChainFn: fakeChain({
      'blog.example.com': { chain: ['blog.example.com', 'old-app.herokuapp.com'], finalTarget: 'old-app.herokuapp.com', truncated: false, error: null },
    }),
    fetchHostnameFn: async () => ({ ok: true, status: 200, text: '<html><body>real app</body></html>', error: null }),
  });
  assert.equal(report.ok, false);
  assert.equal(report.confirmedCount, 0);
  assert.equal(report.unconfirmedCount, 1);
});

test('runCheck skips the probe (and reports lookup-error) when the DNS lookup itself failed', async () => {
  let probeCalled = false;
  const report = await runCheck(['example.com'], {
    resolveCnameChainFn: fakeChain({
      'example.com': { chain: ['example.com'], finalTarget: null, truncated: false, error: 'timed out' },
    }),
    fetchHostnameFn: async () => { probeCalled = true; return { ok: true, status: 200, text: '', error: null }; },
  });
  assert.equal(probeCalled, false);
  assert.equal(report.errors.length, 1);
});

test('runCheck handles multiple hostnames independently and in parallel', async () => {
  const report = await runCheck(['safe.example.com', 'danger.example.com'], {
    resolveCnameChainFn: fakeChain({
      'danger.example.com': { chain: ['danger.example.com', 'old-app.herokuapp.com'], finalTarget: 'old-app.herokuapp.com', truncated: false, error: null },
    }),
    fetchHostnameFn: async () => ({ ok: true, status: 404, text: 'No such app', error: null }),
  });
  assert.equal(report.hostnamesChecked, 2);
  assert.equal(report.confirmedCount, 1);
});

test('runCheck passes a custom timeout through to both the lookup and the probe', async () => {
  let seenLookupTimeout = null;
  let seenProbeTimeout = null;
  await runCheck(['blog.example.com'], {
    resolveCnameChainFn: async (hostname, opts) => {
      seenLookupTimeout = opts?.timeoutMs;
      return { chain: [hostname, 'old-app.herokuapp.com'], finalTarget: 'old-app.herokuapp.com', truncated: false, error: null };
    },
    fetchHostnameFn: async (hostname, opts) => {
      seenProbeTimeout = opts?.timeoutMs;
      return { ok: true, status: 404, text: 'No such app', error: null };
    },
    timeoutMs: 1234,
  });
  assert.equal(seenLookupTimeout, 1234);
  assert.equal(seenProbeTimeout, 1234);
});

test('runCheck probes when the provider is mid-chain, not last (S3 internal name, quality audit 2026-11-12)', async () => {
  let probed = false;
  const chain = ['assets.example.com', 'gone.s3.amazonaws.com', 's3-1-w.amazonaws.com', 's3-w.us-east-1.amazonaws.com'];
  const report = await runCheck(['assets.example.com'], {
    resolveCnameChainFn: fakeChain({ 'assets.example.com': { chain, finalTarget: chain[3], truncated: false, error: null } }),
    fetchHostnameFn: async () => { probed = true; return { ok: true, status: 404, text: 'NoSuchBucket', error: null }; },
  });
  assert.equal(probed, true);
  assert.equal(report.confirmedCount, 1);
});

// Red-team gaps 2026-11-12: formatText, parseArgs and main's exit codes had
// no test, so every mutant seeded in them escaped.

function resultOf(category) {
  return { hostname: `${category}.example.com`, category, chain: [`${category}.example.com`], provider: null, probe: null, error: null };
}
function reportOf(results, extra = {}) {
  return { hostnamesChecked: results.length, results, findings: [], confirmedCount: 0, unconfirmedCount: 0, errors: [], incomplete: false, ok: true, ...extra };
}

test('formatText counts only no-cname and not-risky hostnames as clean', () => {
  const text = formatText(reportOf([resultOf('no-cname'), resultOf('not-risky'), resultOf('risky-unconfirmed')]));
  assert.match(text, /^2 hostname\(s\) with no risky CNAME target found\.$/m);
});

test('formatText prints no clean-count line when no hostname is clean', () => {
  const text = formatText(reportOf([resultOf('risky-unconfirmed')]));
  assert.doesNotMatch(text, /with no risky CNAME target found/);
});

test('parseArgs separates hostnames from --json and --timeout <ms>', () => {
  assert.deepEqual(parseArgs(['a.example.com', '--json', '--timeout', '500', 'b.example.com']),
    { hostnames: ['a.example.com', 'b.example.com'], json: true, timeoutMs: 500 });
  assert.deepEqual(parseArgs(['a.example.com']), { hostnames: ['a.example.com'], json: false, timeoutMs: undefined });
});

/** Runs main() with argv, a fake global fetch (DoH answers from `cnames`,
 * every probe answers `probeText`), and process.exit/console captured. */
async function runMain(args, { cnames = {}, probeText = '', dohStatus = 0 } = {}) {
  const saved = { argv: process.argv, exit: process.exit, fetch: globalThis.fetch, log: console.log, error: console.error };
  const out = [];
  let code = null;
  process.argv = ['node', 'check.mjs', ...args];
  process.exit = (c) => { if (code === null) code = c; throw new Error('__exit__'); };
  console.log = (s) => out.push(String(s));
  console.error = (s) => out.push(String(s));
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    if (u.hostname === 'cloudflare-dns.com') {
      const target = cnames[u.searchParams.get('name')];
      const body = { Status: dohStatus, Answer: target ? [{ type: 5, data: `${target}.` }] : [] };
      return { ok: true, status: 200, json: async () => body };
    }
    return new Response(probeText, { status: 404 });
  };
  try {
    await main();
  } catch (err) {
    if (err.message !== '__exit__') throw err;
  } finally {
    Object.assign(process, { argv: saved.argv, exit: saved.exit });
    globalThis.fetch = saved.fetch;
    console.log = saved.log;
    console.error = saved.error;
  }
  return { code, out: out.join('\n') };
}

test('the CLI exits 2 with usage when given no hostname', async () => {
  const { code, out } = await runMain([]);
  assert.equal(code, 2);
  assert.match(out, /Usage: node check\.mjs/);
});

test('the CLI exits 0 for one hostname with no CNAME', async () => {
  const { code, out } = await runMain(['plain.example.com']);
  assert.equal(code, 0);
  assert.match(out, /Hostnames checked: 1/);
});

test('the CLI exits 1, not another code, for a confirmed dangling CNAME', async () => {
  const { code, out } = await runMain(['blog.example.com', '--json'],
    { cnames: { 'blog.example.com': 'old-app.herokuapp.com' }, probeText: 'No such app' });
  assert.equal(code, 1);
  assert.equal(JSON.parse(out).confirmedCount, 1);
});

test('the CLI exits 1 when a lookup could not complete (README: a failed lookup is not a pass)', async () => {
  const { code } = await runMain(['plain.example.com'], { dohStatus: 2 });
  assert.equal(code, 1);
});

// Red team 2026-11-12: a pasted URL went to the resolver as-is. Cloudflare
// answers NXDOMAIN for "https://blog.example.com/", which read as no-cname,
// so a dangling CNAME came back "No subdomain-takeover risk found", exit 0.
test('runCheck looks up the hostname inside a pasted URL, not the URL', async () => {
  const asked = [];
  const report = await runCheck(['https://Blog.Example.com:443/path?q=1#x', 'blog.example.com.'], {
    resolveCnameChainFn: async (h) => {
      asked.push(h);
      return fakeChain({
        'blog.example.com': { chain: ['blog.example.com', 'old-app.herokuapp.com'], finalTarget: 'old-app.herokuapp.com', truncated: false, error: null },
      })(h);
    },
    fetchHostnameFn: async () => ({ ok: true, status: 404, text: 'No such app', error: null }),
  });
  assert.deepEqual(asked, ['blog.example.com', 'blog.example.com']);
  assert.equal(report.confirmedCount, 2);
});

test('runCheck never reads a non-hostname as a clean result', async () => {
  let asked = 0;
  const report = await runCheck(['not a hostname', 'exa mple.com', 'http://', '-bad.example.com'], {
    resolveCnameChainFn: async (h) => { asked++; return fakeChain({})(h); },
    fetchHostnameFn: async () => { throw new Error('no probe expected'); },
  });
  assert.equal(asked, 0, 'an input that is not a hostname is never sent to the resolver');
  assert.equal(report.errors.length, 4);
  assert.equal(verdictFor(report).clean, false);
  assert.equal(verdictFor(report).exitCode, 1);
});
