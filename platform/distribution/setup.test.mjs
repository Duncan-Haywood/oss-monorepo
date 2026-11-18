import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { load, problems, checklist, namesIn, SETUP_MD } from './setup.mjs';

test('accounts.json agrees with the workflows, channels.yaml and email routing', () => {
  assert.deepEqual(problems(load()), []);
});

test('SETUP.md is the generated checklist', () => {
  assert.equal(fs.readFileSync(SETUP_MD, 'utf8'), checklist(load()));
});

test('namesIn ignores names GitHub provides and splits secrets from variables', () => {
  const n = namesIn('a: ${{ secrets.GITHUB_TOKEN }} b: ${{ secrets.X_TOKEN }} c: ${{ vars.CI_RUNNER }} d: ${{ vars.DISTRIBUTE_X }}');
  assert.deepEqual([...n.secrets], ['X_TOKEN']);
  assert.deepEqual([...n.variables], ['DISTRIBUTE_X']);
});

const base = () => ({
  email: { zone: 'x.test', addresses: [{ local: 'accounts' }] },
  channels: [{ id: 'bot', rung: 'artifact' }],
  workflows: { 'distribute-bot.yml': '${{ secrets.BOT_TOKEN }} ${{ vars.DISTRIBUTE_BOT }}' },
  accounts: {
    signup_address: { local: 'accounts', purpose: 'p' },
    accounts: [{ id: 'bot', name: 'Bot', tier: 1, signup_url: 'https://x.test', signup_with: 'accounts',
      unlocks: ['bot'], workflows: ['distribute-bot.yml'], secrets: ['BOT_TOKEN'], variables: ['DISTRIBUTE_BOT'], steps: ['do it'] }],
  },
});

test('a clean fixture has no problems', () => {
  assert.deepEqual(problems(base()), []);
});

test('a credential a workflow reads but no account asks for is drift', () => {
  const d = base();
  d.workflows['distribute-bot.yml'] += ' ${{ secrets.NEW_KEY }}';
  assert.match(problems(d).join('\n'), /reads secrets NEW_KEY, but no row/);
});

test('stale names, unknown channels, missing workflows and unrouted addresses are drift', () => {
  const d = base();
  const a = d.accounts.accounts[0];
  a.variables.push('GONE');
  a.unlocks.push('nope');
  a.workflows.push('missing.yml');
  a.signup_with = 'other';
  const out = problems(d).join('\n');
  assert.match(out, /lists variables GONE/);
  assert.match(out, /unknown channel nope/);
  assert.match(out, /missing\.yml does not exist/);
  assert.match(out, /other@, which email-routing/);
});

test('the checklist names the sign-up address and never a secret value', () => {
  const md = checklist(base());
  assert.match(md, /accounts@x\.test/);
  assert.match(md, /`BOT_TOKEN`/);
  assert.match(md, /Switches on: `bot` \(now artifact\)/);
});
