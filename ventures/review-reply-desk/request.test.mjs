import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReviewLink, parseCustomers, composeRequest, checkRequest, smsParts, sendLink, buildRequests, requestsToCsv, GOOGLE_WRITE_REVIEW } from "./request.mjs";

const PID = "ChIJN1t_tDeuEmsRUsoyG83frY4";
const profile = { business: "Luigi's Trattoria", owner: "Luigi", tone: "warm" };

test("parseReviewLink builds the Google link from a Place ID and accepts known hosts only", () => {
  const a = parseReviewLink(PID);
  assert.equal(a.url, GOOGLE_WRITE_REVIEW + PID);
  assert.equal(a.platform, "google");
  assert.equal(parseReviewLink("https://g.page/r/CabcDEF/review").platform, "google");
  assert.equal(parseReviewLink(`https://search.google.com/local/writereview?placeid=${PID}`).placeId, PID);
  assert.equal(parseReviewLink("https://www.yelp.com/biz/luigis").platform, "yelp");
  assert.equal(parseReviewLink("https://www.facebook.com/luigis/reviews").platform, "facebook");
  assert.equal(parseReviewLink("").ok, false);
  assert.equal(parseReviewLink("hello").ok, false);
  assert.equal(parseReviewLink("http://g.page/r/x/review").ok, false);
  assert.equal(parseReviewLink("https://evil.example/google.com").ok, false);
  assert.equal(parseReviewLink("https://google.com.evil.example/x").ok, false);
  assert.equal(parseReviewLink("https://search.google.com/local/writereview").ok, false);
  assert.equal(parseReviewLink("javascript:alert(1)").ok, false);
});

test("parseCustomers reads name, phone, email and a service note in any order", () => {
  const cs = parseCustomers("Maria Lopez, (555) 123-4567, kitchen remodel\nTom, tom@example.com\n\nDee | +1 555 222 3333 | dee@x.io\nJust a name");
  assert.equal(cs.length, 4);
  assert.deepEqual(cs[0], { name: "Maria", phone: "(555) 123-4567", email: "", service: "kitchen remodel" });
  assert.equal(cs[1].email, "tom@example.com");
  assert.equal(cs[2].phone, "+1 555 222 3333");
  assert.equal(cs[2].email, "dee@x.io");
  assert.equal(cs[3].name, "Just");
});

test("every built-in template, in every tone and channel, passes its own checker", () => {
  const link = GOOGLE_WRITE_REVIEW + PID;
  for (const tone of ["warm", "professional", "brief"]) {
    for (const channel of ["sms", "email", "receipt"]) {
      for (const c of [{ name: "Maria", service: "kitchen remodel" }, { name: "", service: "" }]) {
        const m = composeRequest(c, channel, { ...profile, tone }, link);
        const r = checkRequest(m.text, { channel, link });
        assert.deepEqual(r.errors, [], `${tone}/${channel}: ${m.text}`);
        assert.ok(m.text.includes(link));
        if (channel === "sms") assert.match(m.text, /STOP/);
      }
    }
  }
});

test("checkRequest catches incentives, gating, rating asks and a missing link", () => {
  const e = (t, o) => checkRequest(t, o).errors.length;
  assert.equal(e("Leave a review and get 10% off https://x.co", {}), 1);
  assert.equal(e("Enter to win a gift card for a review https://x.co", {}), 1);
  assert.equal(e("If you were happy with us, please review https://x.co", {}), 1);
  assert.equal(e("If you had a great experience, review us https://x.co", {}), 1);
  assert.equal(e("Unhappy? Please email us first before posting https://x.co", {}), 1);
  assert.equal(e("Please leave us 5 stars https://x.co", {}), 1);
  assert.equal(e("We'd love a positive review https://x.co", {}), 1);
  assert.equal(e("Please update your review after the refund https://x.co", {}), 1);
  assert.equal(e("Honest feedback please", { link: "https://x.co" }), 1);
  assert.equal(e("Feel free to share honest feedback https://x.co", {}), 0);
});

test("a URL containing 'free' or 'off' does not trip the incentive rule", () => {
  assert.equal(checkRequest("Honest feedback: https://example.com/free-offer-5star", {}).errors.length, 0);
});

test("sms warnings: opt-out, unicode, and part count", () => {
  assert.equal(smsParts("a".repeat(160)).parts, 1);
  assert.equal(smsParts("a".repeat(161)).parts, 2);
  assert.equal(smsParts("don’t").unicode, true);
  assert.equal(smsParts("é€".padEnd(71, "x")).parts, 2);
  const r = checkRequest("Please share honest feedback https://x.co", { channel: "sms" });
  assert.ok(r.warnings.some((w) => /opt-out/.test(w)));
  const long = checkRequest("honest " + "x".repeat(400) + " STOP https://x.co", { channel: "sms" });
  assert.ok(long.warnings.some((w) => /3 text parts/.test(w)));
});

test("sendLink and buildRequests keep contact details in the browser-side links only", () => {
  const out = buildRequests("Maria, 555-123-4567\nTom, tom@example.com", PID, profile, "sms");
  assert.equal(out.ok, true);
  assert.equal(out.rows.length, 2);
  assert.match(out.rows[0].send, /^sms:5551234567\?&body=/);
  assert.equal(out.rows[1].missing, true);
  assert.equal(out.rows[1].send, "");
  const em = buildRequests("Tom, tom@example.com", PID, profile, "email");
  assert.match(em.rows[0].send, /^mailto:tom@example\.com\?subject=/);
  assert.equal(sendLink({}, { channel: "sms", text: "x" }), "");
  assert.equal(buildRequests("Maria", "nope", profile).ok, false);
});

test("CSV escapes quotes and neutralises formula cells", () => {
  const out = buildRequests('=cmd|x, 555-123-4567', PID, { business: 'Say "hi" Cafe' }, "sms");
  const csv = requestsToCsv(out.rows);
  assert.match(csv, /"'=cmd"/);
  assert.match(csv, /Say ""hi"" Cafe/);
  assert.equal(csv.split("\n").length, 2);
});
