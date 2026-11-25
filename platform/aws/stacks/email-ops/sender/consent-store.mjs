// The one suppression and consent table every sender checks
// (`platform/aws/stacks/email-ops/` creates it). Addresses are never stored in clear:
// the key is an HMAC of the normalised address with a pepper kept in Secrets
// Manager, so the table alone does not reveal who is on it, and a lookup by
// address still works.
//
//   pk = a#<hmac>   sk = SUPPRESS#all | SUPPRESS#marketing | SUPPRESS#cold | SUPPRESS#unsubscribed
//                        reason, at, source
//   pk = a#<hmac>   sk = CONSENT#marketing
//                        at, source (form or page), wording (version of the text shown), product
//
// Suppression rows never expire. Consent rows are deleted on unsubscribe
// (the suppression row then records that it was withdrawn, and when).

import { createHmac } from 'node:crypto';
import { normalizeAddress, suppressionFor } from './policy.mjs';

export function addressKey(pepper, address) {
  const a = normalizeAddress(address);
  if (!a) throw new Error('not an email address');
  if (!pepper || String(pepper).length < 16) throw new Error('pepper must be at least 16 characters');
  return `a#${createHmac('sha256', pepper).update(a).digest('base64url')}`;
}

/** `call` is a DynamoDB JSON-protocol client (sigv4.mjs jsonProtocol, or the test fake). */
export function consentStore({ call, table, pepper, now = () => new Date() }) {
  const key = (address) => addressKey(pepper, address);
  return {
    /** Everything known about one address, in the shape `maySend` reads. */
    async state(address) {
      const out = await call('Query', {
        TableName: table,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': { S: key(address) } },
        ConsistentRead: true,
      });
      const state = { suppressed: {}, consent: {} };
      for (const it of out.Items || []) {
        const [kind, scope] = it.sk.S.split('#');
        if (kind === 'SUPPRESS') state.suppressed[scope] = it.reason?.S || 'suppressed';
        if (kind === 'CONSENT') state.consent[scope] = { at: it.at?.S, source: it.source?.S, wording: it.wording?.S };
      }
      return state;
    },
    /** Record an opt-in. Refused once the address has unsubscribed or complained: that needs a human look. */
    async recordConsent(address, { source, wording, product = '' }) {
      if (!source || !wording) throw new Error('consent needs a source and the wording version shown');
      const s = await this.state(address);
      if (s.suppressed.all || s.suppressed.marketing || s.suppressed.unsubscribed) return { recorded: false, reason: 'previously-suppressed' };
      await call('PutItem', {
        TableName: table,
        Item: { pk: { S: key(address) }, sk: { S: 'CONSENT#marketing' }, at: { S: now().toISOString() }, source: { S: source }, wording: { S: wording }, product: { S: product } },
      });
      return { recorded: true };
    },
    /** Apply a bounce, complaint or unsubscribe event. Idempotent; keeps the first time it happened. */
    async suppress(address, event) {
      const scopes = suppressionFor(event);
      for (const [scope, reason] of scopes) {
        try {
          await call('PutItem', {
            TableName: table,
            Item: { pk: { S: key(address) }, sk: { S: `SUPPRESS#${scope}` }, reason: { S: reason }, at: { S: now().toISOString() }, source: { S: event.source || '' } },
            ConditionExpression: 'attribute_not_exists(pk)',
          });
        } catch (e) {
          if (e?.code !== 'ConditionalCheckFailedException') throw e;
        }
      }
      if (scopes.length && event.type !== 'hard-bounce') {
        await call('DeleteItem', { TableName: table, Key: { pk: { S: key(address) }, sk: { S: 'CONSENT#marketing' } } });
      }
      return scopes.map(([s]) => s);
    },
  };
}
