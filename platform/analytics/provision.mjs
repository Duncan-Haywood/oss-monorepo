// Finds, or creates, the Cloudflare Web Analytics site for the published host
// and prints its public site token, so the deploy can put the beacon on every
// page with no dashboard click (everything as code; CLAUDE.md).
//
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node platform/analytics/provision.mjs
//
// Uses the account's RUM API:
//   GET  /accounts/{account}/rum/site_info/list   find a site whose host is ours
//   POST /accounts/{account}/rum/site_info        create one ({ host, auto_install: false })
// The token needs the account-level Web Analytics / Account Analytics edit
// permission. CLOUDFLARE_ANALYTICS_TOKEN is tried before the deploy token,
// like platform/counter/pull-cloudflare.mjs. Written without access to
// Cloudflare's API reference from the authoring session (2026-11-25): the
// response is read defensively, and every failure is printed and exits 0
// with no token, so a deploy never fails over analytics; the pages then ship
// without the beacon and the Privacy Policy says analytics are off.
//
// With GITHUB_OUTPUT set, writes `token=<value>` there too.

import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { normaliseToken } from './web-analytics.mjs';

const API = 'https://api.cloudflare.com/client/v4';

export function matchSite(sites, host) {
  const want = host.toLowerCase();
  return (sites ?? []).find((s) => [s?.host, s?.ruleset?.zone_name]
    .some((h) => typeof h === 'string' && h.toLowerCase() === want)) ?? null;
}

export async function provision({ host, account, tokens, fetchImpl = fetch, log = console.error }) {
  for (const apiToken of tokens.filter(Boolean)) {
    const call = async (method, url, body) => {
      const res = await fetchImpl(`${API}${url}`, {
        method,
        headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        const why = (json.errors ?? []).map((e) => `${e.code}: ${e.message}`).join('; ') || `HTTP ${res.status}`;
        throw new Error(`${method} ${url.split('?')[0]}: ${why}`);
      }
      return json.result;
    };
    try {
      const sites = await call('GET', `/accounts/${account}/rum/site_info/list?per_page=100`);
      let site = matchSite(Array.isArray(sites) ? sites : [], host);
      if (!site) {
        log(`web analytics: no site for ${host} yet; creating one.`);
        site = await call('POST', `/accounts/${account}/rum/site_info`, { host, auto_install: false });
      }
      const token = normaliseToken(site?.site_token);
      if (token) return token;
      log('web analytics: the API answered without a site_token.');
    } catch (err) {
      log(`web analytics: ${err.message}`);
    }
  }
  return '';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const site = JSON.parse(await fs.readFile(new URL('./site.json', import.meta.url), 'utf8'));
  let token = normaliseToken(site.token);
  if (token) {
    console.error('web analytics: using the token committed in platform/analytics/site.json.');
  } else {
    const account = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLAREACCOUNTID;
    const tokens = [process.env.CLOUDFLARE_ANALYTICS_TOKEN, process.env.CLOUDFLARE_API_TOKEN];
    if (!account || !tokens.some(Boolean)) {
      console.error('web analytics: no Cloudflare account id or API token; skipping.');
    } else {
      token = await provision({ host: site.host, account, tokens });
    }
  }
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `token=${token}\n`);
  console.log(token ? 'web analytics: token found.' : 'web analytics: no token; the site ships without the beacon.');
}
