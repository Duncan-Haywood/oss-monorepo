import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReviews, analyze, composeReply, checkReply, replyAll, triage, summarize, toCsv, inferRating, REVIEW_LIMIT } from "./calc.mjs";

const profile = { business: "Luigi's", owner: "Luigi", contact: "555-123-4567", type: "restaurant", tone: "warm" };

test("parseReviews reads star lines, names and blank-line blocks", () => {
  const rs = parseReviews("5 stars\nMaria - Loved the pasta.\n\n★★☆☆☆\nTom R: Cold food.\n\nRating: 3 Fine, slow.\n\nJust a body with no stars");
  assert.equal(rs.length, 4);
  assert.deepEqual(rs.map((r) => r.rating), [5, 2, 3, null]);
  assert.equal(rs[0].reviewer, "Maria");
  assert.equal(rs[0].body, "Loved the pasta.");
  assert.equal(rs[1].reviewer, "Tom R");
  assert.equal(rs[2].body, "Fine, slow.");
});

test("a leading sentiment word is not taken for a name", () => {
  const [r] = parseReviews("Great - food was fine");
  assert.equal(r.reviewer, "");
});

test("inferRating leans on sentiment words and is 3 on a tie", () => {
  assert.equal(inferRating("amazing and perfect, highly recommend"), 5);
  assert.equal(inferRating("terrible and awful, never again"), 1);
  assert.equal(inferRating("it was a place"), 3);
});

test("analyze finds topics and flags", () => {
  const a = analyze({ body: "Waited an hour, my lawyer will be in touch. I want a refund." }, "restaurant");
  assert.ok(a.topics.includes("wait"));
  assert.deepEqual(a.flags.map((f) => f.id).sort(), ["incentive", "legal"]);
  const f = analyze({ body: "I have never been here, wrong business", rating: 1 }, "restaurant");
  assert.ok(f.flags.some((x) => x.id === "fake"));
});

test("health practices always get the privacy flag and a general reply", () => {
  const review = { rating: 5, reviewer: "Ann", body: "Dr Lee fixed my toothache, great staff and the root canal was painless." };
  const { text, analysis } = composeReply(review, { ...profile, type: "health" });
  assert.ok(analysis.flags.some((f) => f.id === "privacy"));
  assert.doesNotMatch(text, /root canal|toothache|appointment|treatment|patient/i);
  assert.deepEqual(checkReply(text, review, { ...profile, type: "health" }).errors, []);
});

test("legal and safety claims get a short offline reply that says nothing about what happened", () => {
  const { text } = composeReply({ rating: 1, reviewer: "Sam", body: "I got food poisoning and my attorney will sue." }, profile);
  assert.match(text, /555-123-4567/);
  assert.doesNotMatch(text, /poison|sue|attorney/i);
  assert.ok(text.length < 300);
});

test("a complaint reply apologises, names the issue, moves offline, and offers nothing", () => {
  const { text } = composeReply({ rating: 1, reviewer: "Tom R", body: "Waited an hour and the waiter was rude. I want a refund." }, profile);
  assert.match(text, /^Hi Tom|^Hello Tom|^Dear Tom|^Tom/);
  assert.match(text, /555-123-4567/);
  assert.doesNotMatch(text, /refund|free|discount|compensat/i);
  assert.doesNotMatch(text, /R,|Tom R/);
});

test("replies are deterministic and vary between different reviews", () => {
  const r1 = { rating: 5, reviewer: "A", body: "Great food" };
  const a = composeReply(r1, profile).text;
  assert.equal(composeReply(r1, profile).text, a);
  const set = new Set(["Lovely", "Super fast", "Nice staff", "Yum", "Best pizza", "Good vibes", "So good", "Friendly"].map((b, i) => composeReply({ rating: 5, reviewer: "X", body: b + i }, profile).text));
  assert.ok(set.size >= 3);
});

test("checkReply catches the mistakes owners make", () => {
  const rv = { reviewer: "Tom Rivera", body: "x" };
  assert.ok(checkReply("Tom, you are a liar and this is fake.", rv, profile).errors.length);
  assert.ok(checkReply("Please update your review and we will make it right, Tom.", rv, profile).errors.length);
  assert.ok(checkReply("x".repeat(REVIEW_LIMIT + 1), rv, profile).errors.length);
  assert.ok(checkReply("We will refund you in full, Tom, thanks for writing in today.", rv, profile).warnings.some((w) => /refund/i.test(w)));
  assert.ok(checkReply("Call me on 555 999 0000 any time you like, thanks for the review.", rv, profile).warnings.some((w) => /phone number/.test(w)));
  assert.ok(checkReply("Thanks Tom Rivera, we are sorry about the wait you had last week.", rv, profile).warnings.some((w) => /full name/.test(w)));
  const hp = { ...profile, type: "health" };
  assert.ok(checkReply("We hope your root canal appointment went well, thank you for the review.", rv, hp).errors.length);
  assert.deepEqual(checkReply("Thank you for the kind words. The whole team will be glad to read this.", rv, profile).errors, []);
});

test("every template reply passes its own checks across tones, types and ratings", () => {
  const bodies = ["Slow service and cold food", "Loved everything", "It was okay", "I will sue", "rude receptionist, overpriced", "Never been here"];
  for (const type of ["restaurant", "home", "auto", "salon", "retail", "lodging", "health", "generic"]) {
    for (const tone of ["warm", "professional", "brief"]) {
      for (const [i, body] of bodies.entries()) {
        for (const rating of [1, 3, 5, null]) {
          const p = { ...profile, type, tone };
          const rv = { reviewer: i % 2 ? "Jo Smith" : "", rating, body };
          const { text } = composeReply(rv, p);
          const lint = checkReply(text, { ...rv, reviewer: rv.reviewer }, p);
          assert.deepEqual(lint.errors, [], `${type}/${tone}/${rating}/${body}: ${text}`);
          assert.ok(text.length < 700);
          assert.doesNotMatch(text, /undefined|\{name\}|NaN/);
        }
      }
    }
  }
});

test("no contact given still asks them to get in touch", () => {
  const { text } = composeReply({ rating: 2, reviewer: "Al", body: "Not great." }, { ...profile, contact: "" });
  assert.match(text, /contact us directly/);
});

test("batch: triage puts safety and low stars first; summary counts topics", () => {
  const rows = replyAll("5 stars\nHappy.\n\n2 stars\nSlow and expensive.\n\n3 stars\nOk.\n\n1 star\nMy lawyer will call you.", profile);
  const t = triage(rows);
  assert.deepEqual(t.map((x) => x.analysis.rating), [1, 2, 3, 5]);
  const s = summarize(rows);
  assert.equal(s.count, 4);
  assert.equal(s.average, 2.75);
  assert.equal(s.flagged, 1);
  assert.ok(s.complaints.some((c) => c.id === "wait"));
});

test("toCsv quotes embedded quotes and newlines", () => {
  const rows = replyAll('1 star\nSaid "rude" to me.', profile);
  const csv = toCsv(rows);
  assert.match(csv, /""rude""/);
  assert.equal(csv.split("\n")[0], "reviewer,rating,sentiment,topics,flags,review,reply");
});
