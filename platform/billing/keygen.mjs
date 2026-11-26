#!/usr/bin/env node
// Make the Ed25519 key pair that signs licence keys. Run once, by the owner:
//
//   node platform/billing/keygen.mjs
//
// It prints two lines. The public key goes in catalogue.mjs (`publicKey`) and
// is committed. The private key is a secret: paste it straight into
//   npx wrangler secret put LICENCE_SIGNING_KEY   (on the billing Worker only; never platform/edge/)
// and nowhere else. Losing it only means issuing keys under a new pair; keys
// already sold stop verifying, so keep a copy in the password manager.

const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const pub = b64u(await crypto.subtle.exportKey("raw", pair.publicKey));
const priv = b64u(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
process.stdout.write(`publicKey (commit in platform/billing/catalogue.mjs): ${pub}\n`);
process.stdout.write(`LICENCE_SIGNING_KEY (secret; wrangler secret put only): ${priv}\n`);
