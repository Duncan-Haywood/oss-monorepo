import { test } from "node:test";
import assert from "node:assert/strict";
import * as licence from "./licence.mjs";
import { PADDLE } from "./checkout.mjs";
import { assertPackLicence } from "../../../../platform/billing/testkit.mjs";

test("the Job report licence follows the shared contract (platform/billing/testkit.mjs)", async () => {
  await assertPackLicence(licence, PADDLE, "residential-takeoff");
});
