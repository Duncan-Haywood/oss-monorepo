// Action entry (action.yml `main`): mint the job's token. No dependencies; the
// runner's Node fetch only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProfiles, mint, tokenName } from './mint.mjs';

/** Inputs arrive as INPUT_<NAME> (GitHub upper-cases the name, keeps underscores). */
export const input = (env, name) => String(env[`INPUT_${name.toUpperCase()}`] ?? '').trim();

function append(file, key, value) {
  if (!file) throw new Error(`runner did not provide the file for ${key}`);
  if (/[\r\n]/.test(value)) throw new Error(`${key} contains a newline`);
  fs.appendFileSync(file, `${key}=${value}\n`);
}

export async function run({ env = process.env, fetchImpl = fetch, out = (s) => process.stdout.write(s), now = new Date(), profiles = loadProfiles() } = {}) {
  const profile = input(env, 'profile');
  const owner = input(env, 'owner') || 'user';
  const accountId = input(env, 'account_id');
  const ttlRaw = input(env, 'ttl_minutes');
  const name = tokenName({
    repo: env.GITHUB_REPOSITORY || 'local',
    profile,
    run: `${env.GITHUB_RUN_ID || Date.now()}.${env.GITHUB_RUN_ATTEMPT || 1}.${env.GITHUB_JOB || 'job'}`,
  });
  const t = await mint({
    fetch: fetchImpl,
    minter: input(env, 'minter_token'),
    owner,
    accountId,
    zoneId: input(env, 'zone_id') || undefined,
    profiles,
    profileName: profile,
    name,
    ttlMinutes: ttlRaw ? Number(ttlRaw) : undefined,
    now,
  });
  // Mask before the value can reach any other line of output.
  out(`::add-mask::${t.value}\n`);
  // The post step deletes the token; saved before anything else can fail.
  append(env.GITHUB_STATE, 'token_id', t.id);
  append(env.GITHUB_OUTPUT, 'token', t.value);
  append(env.GITHUB_OUTPUT, 'token_id', t.id);
  append(env.GITHUB_OUTPUT, 'expires_on', t.expires_on);
  if (input(env, 'export_env') !== 'false') {
    append(env.GITHUB_ENV, 'CLOUDFLARE_API_TOKEN', t.value);
    append(env.GITHUB_ENV, 'CLOUDFLARE_ACCOUNT_ID', accountId);
  }
  out(`Minted ${t.name} (profile ${profile}, expires ${t.expires_on}); deleted when this job ends.\n`);
  return t;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((e) => {
    process.stdout.write(`::error title=Cloudflare token not minted::${e.message}\n`);
    process.exitCode = 1;
  });
}
