import { expect, it } from "vitest";
import { signUnsubscribe, verifyUnsubscribe } from "./unsubscribe-token";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

it("verifies its own token and refuses every other spelling of the same bytes", async () => {
  const t = await signUnsubscribe("secret", "org_1", "usr_1");
  expect(await verifyUnsubscribe("secret", "org_1", "usr_1", t)).toBe(true);
  expect(await verifyUnsubscribe("secret", "org_1", "usr_2", t)).toBe(false);
  expect(await verifyUnsubscribe("other", "org_1", "usr_1", t)).toBe(false);
  // The last of 43 characters carries 4 bits and 2 spare ones: the three siblings that differ only
  // in the spare bits decode to the same signature and must still be refused.
  const last = B64.indexOf(t.at(-1) ?? "");
  for (let spare = 1; spare < 4; spare++) {
    const sibling = `${t.slice(0, -1)}${B64[(last & ~3) | spare]}`;
    expect(await verifyUnsubscribe("secret", "org_1", "usr_1", sibling)).toBe(false);
  }
});

it("signs each list apart: a digest link never stops the getting-started reminders, or back", async () => {
  const digest = await signUnsubscribe("secret", "org_1", "usr_1");
  const onboarding = await signUnsubscribe("secret", "org_1", "usr_1", "onboarding");
  expect(onboarding).not.toBe(digest);
  expect(await verifyUnsubscribe("secret", "org_1", "usr_1", onboarding, "onboarding")).toBe(true);
  expect(await verifyUnsubscribe("secret", "org_1", "usr_1", digest, "onboarding")).toBe(false);
  expect(await verifyUnsubscribe("secret", "org_1", "usr_1", onboarding)).toBe(false);
  // The default is still the digest, so links already in people's mailboxes keep working.
  expect(await verifyUnsubscribe("secret", "org_1", "usr_1", digest, "digest")).toBe(true);
});
