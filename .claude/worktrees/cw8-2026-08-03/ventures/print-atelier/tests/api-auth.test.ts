import test from "node:test";
import assert from "node:assert/strict";

import {
  OPS_TOKEN_ENV,
  checkOperator,
  readBearerToken,
} from "../src/lib/api-auth";

const TOKEN = "s3cr3t-operator-token";
const configured = { [OPS_TOKEN_ENV]: TOKEN };

test("readBearerToken extracts a well-formed bearer credential", () => {
  assert.equal(readBearerToken(`Bearer ${TOKEN}`), TOKEN);
  assert.equal(readBearerToken(`  Bearer   ${TOKEN}  `), TOKEN);
});

test("readBearerToken rejects anything that is not a bearer credential", () => {
  for (const header of [
    null,
    undefined,
    "",
    TOKEN,
    `Basic ${TOKEN}`,
    "Bearer",
    "Bearer ",
    `bearer ${TOKEN}`, // scheme is case-sensitive here; be strict rather than clever
  ]) {
    assert.equal(readBearerToken(header), null, `expected null for ${JSON.stringify(header)}`);
  }
});

test("an unset operator token denies every request rather than opening the route", () => {
  // The regression this pins: treating "no token configured" as "auth not
  // required yet" makes the first deploy to a real host silently public.
  for (const env of [{}, { [OPS_TOKEN_ENV]: "" }, { [OPS_TOKEN_ENV]: "   " }]) {
    const denial = checkOperator(`Bearer ${TOKEN}`, env);
    assert.ok(denial, "an unconfigured token must not authorize anyone");
    assert.equal(denial.status, 503);
  }
});

test("a missing, malformed, or wrong token is refused with 401", () => {
  for (const header of [null, "", "Bearer wrong-token", `Basic ${TOKEN}`, "Bearer"]) {
    const denial = checkOperator(header, configured);
    assert.ok(denial, `expected a denial for ${JSON.stringify(header)}`);
    assert.equal(denial.status, 401);
    assert.equal(denial.error, "Not authorised");
  }
});

test("a token that is a prefix or extension of the real one is refused", () => {
  for (const wrong of [TOKEN.slice(0, -1), `${TOKEN}x`, TOKEN.toUpperCase()]) {
    const denial = checkOperator(`Bearer ${wrong}`, configured);
    assert.ok(denial, `expected a denial for ${wrong}`);
    assert.equal(denial.status, 401);
  }
});

test("denials never disclose the expected token", () => {
  const denial = checkOperator("Bearer wrong-token", configured);
  assert.ok(denial);
  assert.ok(
    !JSON.stringify(denial).includes(TOKEN),
    "the denial body must not echo the configured secret",
  );
});

test("the correct token is authorized", () => {
  assert.equal(checkOperator(`Bearer ${TOKEN}`, configured), null);
});
