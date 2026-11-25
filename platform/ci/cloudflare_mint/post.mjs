// Action post step (action.yml `post`): runs when the job ends, pass or fail.
// Deletes this job's token, then any expired token an earlier, killed job left.
// Never fails the job: the token expires on its own anyway.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { revoke, sweep } from './mint.mjs';
import { input } from './main.mjs';

export async function post({ env = process.env, fetchImpl = fetch, out = (s) => process.stdout.write(s), now = new Date() } = {}) {
  const id = String(env.STATE_token_id || '').trim();
  const common = { fetch: fetchImpl, minter: input(env, 'minter_token'), owner: input(env, 'owner') || 'user', accountId: input(env, 'account_id') };
  if (id) {
    try {
      out(`Token ${id}: ${await revoke({ ...common, id })}.\n`);
    } catch (e) {
      out(`::warning title=Cloudflare token not deleted::${e.message}. It still expires on its own.\n`);
    }
  } else {
    out('No token was minted in this job; nothing to delete.\n');
  }
  try {
    const gone = await sweep({ ...common, now });
    if (gone.length) out(`Swept ${gone.length} expired ci-mint token(s).\n`);
  } catch (e) {
    out(`::notice title=Sweep skipped::${e.message}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  post().catch(() => {});
}
