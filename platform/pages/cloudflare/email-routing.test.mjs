import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RULE_PREFIX, apply, desiredRules, loadConfig, plan } from './email-routing.mjs';

test('the config is valid and every address is on the site domain', async () => {
  const cfg = await loadConfig();
  assert.equal(cfg.zone, 'marisstella.app');
  assert.ok(cfg.addresses.some((a) => a.local === 'support'));
  // Mail goes to the agent inbox Worker, never to a person's address.
  assert.equal(cfg.deliver_to_worker, 'monorepo-projects-edge');
  assert.ok(!JSON.stringify(cfg).includes('@'));
});

test('plan creates missing rules, updates drifted ones and leaves hand-made rules alone', () => {
  const cfg = { zone: 'x.test', addresses: [{ local: 'support' }, { local: 'hello' }], deliver_to_worker: 'w' };
  const want = desiredRules(cfg);
  assert.deepEqual(want[0].actions, [{ type: 'worker', value: ['w'] }]);
  const existing = [
    { id: '1', ...want[0] },
    { id: '2', ...want[1], actions: [{ type: 'forward', value: ['old@y.test'] }] },
    { id: '3', name: `${RULE_PREFIX}gone@x.test`, enabled: true, matchers: [], actions: [] },
    { id: '4', name: 'hand made', enabled: true, matchers: [], actions: [] },
  ];
  const ops = plan(existing, want);
  assert.deepEqual(ops.map((o) => [o.op, o.id]), [['update', '2'], ['disable', '3']]);
  assert.deepEqual(plan([], want).map((o) => o.op), ['create', 'create']);
  assert.deepEqual(plan(want.map((r, i) => ({ id: String(i), ...r })), want), []);
});

test('apply is a dry run unless asked to write', async () => {
  const calls = [];
  const cf = async (method, route, body) => {
    calls.push(`${method} ${route}`);
    if (route.startsWith('/zones?')) return [{ id: 'z' }];
    if (route.endsWith('/email/routing')) return { enabled: false };
    if (route.endsWith('/rules')) return [];
    return {};
  };
  const cfg = { zone: 'x.test', addresses: [{ local: 'support' }], deliver_to_worker: 'w' };
  const lines = [];
  await apply({ cfg, cf, write: false, log: (l) => lines.push(l) });
  assert.ok(calls.every((c) => c.startsWith('GET ')));
  assert.ok(lines.some((l) => l.includes('would create support@x.test')));
  calls.length = 0;
  await apply({ cfg, cf, write: true, log: () => {} });
  assert.ok(calls.includes('POST /zones/z/email/routing/enable'));
  assert.ok(!calls.some((c) => c.includes('/addresses')), 'no destination address to verify');
  assert.ok(calls.includes('POST /zones/z/email/routing/rules'));
});
