import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { grantsProfile } from "./profiles/grants.ts";
import { sellerBooksProfile } from "./profiles/seller-books.ts";
import {
  escapeHtml,
  NO_CERTIFICATION_NOTE,
  renderTrustDocument,
  renderTrustSection,
  STATUS_LABELS,
} from "./render.ts";
import type { TrustProfile } from "./types.ts";

describe("renderTrustSection", () => {
  const html = renderTrustSection(grantsProfile);

  it("states plainly that no certification is held", () => {
    assert.ok(html.includes(escapeHtml(NO_CERTIFICATION_NOTE)));
  });
  it("labels owner-to-confirm items as being confirmed, never as fact", () => {
    assert.ok(html.includes(`<span class="trust-status">${STATUS_LABELS.owner_to_confirm}</span>`));
    assert.ok(html.includes(`<span class="trust-status">${STATUS_LABELS.not_in_place}</span>`));
  });
  it("says the contact is not published while securityContact is null", () => {
    assert.match(html, /security contact address is being set up/);
  });
  it("links the contact and policy once set", () => {
    const p: TrustProfile = {
      ...grantsProfile,
      securityContact: "mailto:security@example.test",
      disclosurePolicyUrl: "https://example.test/security/disclosure",
    };
    const out = renderTrustSection(p);
    assert.match(out, /href="mailto:security@example.test">security@example.test<\/a>/);
    assert.match(out, /vulnerability disclosure policy/);
  });
  it("does not link a provider page nobody has checked", () => {
    assert.ok(!html.includes("trust-hub"));
    assert.match(html, /Not linked yet/);
    const [cf, ...rest] = grantsProfile.subprocessors;
    assert.ok(cf);
    const checked = { ...cf, trustUrlCheckedOn: "2026-11-25" };
    const out = renderTrustSection({ ...grantsProfile, subprocessors: [checked, ...rest] });
    assert.match(out, /href="https:\/\/www.cloudflare.com\/trust-hub\/"/);
    assert.match(out, /checked 2026-11-25/);
  });
  it("hides repository paths unless a source base URL is given", () => {
    assert.ok(!html.includes("apps/grants/"));
    const out = renderTrustSection(grantsProfile, {
      sourceBaseUrl: "https://git.example/tree/main/",
    });
    assert.match(out, /href="https:\/\/git.example\/tree\/main\/apps\/grants\/wrangler.jsonc"/);
  });
  it("escapes profile text", () => {
    const p: TrustProfile = {
      ...grantsProfile,
      product: `<img src=x onerror="alert(1)">`,
    };
    const out = renderTrustSection(p);
    assert.ok(!out.includes("<img"));
    assert.match(out, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  });
  it("renders the pre-launch wording for a product that is not live", () => {
    assert.match(renderTrustSection(sellerBooksProfile), /not yet serving customers/);
  });
});

describe("renderTrustDocument", () => {
  it("is a full document with no scripts or external resources", () => {
    const doc = renderTrustDocument(grantsProfile, {
      canonicalUrl: "https://marisstella.app/grants/security",
    });
    assert.match(doc, /^<!doctype html>/);
    assert.match(doc, /<link rel="canonical" href="https:\/\/marisstella.app\/grants\/security">/);
    assert.ok(!/<script/i.test(doc));
    assert.ok(!/<link rel="stylesheet"/i.test(doc));
    assert.match(doc, /prefers-color-scheme:dark/);
  });
});
