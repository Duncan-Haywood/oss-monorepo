import test from "node:test";
import assert from "node:assert/strict";
import { triage, runInbox, awayNotice } from "./engine.mjs";
import { textKey } from "./eval/enron.mjs";

// The away policy (eval/README.md "The away policy", 2026-11-11): only a machine's away notice pauses the lead silently. A
// person who wrote back and said they are away is paused until the date they give *and* reaches a person. Phrasings are
// paraphrased from real Enron replies (eval/enron.mjs on 7*), no names from the corpus.
const T = "2026-11-12";
const tri = (body, extra = {}) => triage({ body, subject: "Re: the renewal", from: "pat@example.test", ...extra }, T);

test("a person's away reply is paused and sent to a person", () => {
  for (const body of [
    "Pat, I'm in Chicago right now and will return on Thursday. Let me know if you can wait until then. Thanks.",
    "I am on vacation during the week of Oct. 9.",
    "Thanks for the email and invitation. I am out of the office traveling right now and must get back to you on my availability.",
    "I am out of the office this entire week on vacation, so I will be unable to participate.",
  ]) {
    const t = tri(body);
    assert.equal(t.category, "out_of_office", body);
    assert.equal(t.subtype, "person_away", body);
  }
});

test("a machine's away notice stays a silent pause", () => {
  const cases = [
    [{ subject: "Automatic reply: the renewal" }, "I am out of the office until Monday, November 16."],
    [{ subject: "Out of Office: the renewal" }, "I am away until Monday."],
    [{ subject: "Away" }, "I'm away at a conference this week and will respond next week."],
    [{ signal: "auto-reply" }, "I am out of the office until Monday."],
    [{}, "This is an automatic message. I am out of the office Monday through Friday."],
    [{}, "I will be out of the office until Friday October 12. I will respond to your message when I return."],
    [{}, "Thanks for your email. I am on parental leave until January 2027. For anything urgent, contact sam@example.test."],
    [{}, "I'm on vacation until June 12 with limited email access."],
    [{}, "Auto-reply: Annual closure. Our office reopens 2 January."],
    [{}, "I am currently on sabbatical. Messages are not monitored."],
  ];
  for (const [extra, body] of cases) {
    const t = tri(body, extra);
    assert.equal(t.category, "out_of_office", body);
    assert.equal(t.subtype, null, body);
  }
  assert.equal(awayNotice({ from: "no-reply@example.test", body: "Away." }), true);
  assert.equal(awayNotice({ subject: "Re: lunch", body: "I'm out next week, but will give you a call." }), false);
});

test("the inbox: a person's away reply pauses the cadence and adds a task to read it", () => {
  const replies = `From: Pat Lee <pat@example.test>
Subject: Re: the renewal

Pat here. I'm in Chicago right now and will return on Thursday, November 19. Let me know if you can wait until then.
`;
  const r = runInbox({ replies, prospects: "email,first_name,company,status\npat@example.test,Pat,Acme,active\n", today: T });
  const item = r.items[0];
  assert.equal(item.triage.subtype, "person_away");
  assert.equal(r.prospects[0].status, "paused");
  assert.equal(r.prospects[0].paused_until, "2026-11-20"); // business day after Thursday 19 November
  assert.equal(item.approval, "nothing_to_send");
  assert.ok(item.applied.some((a) => /tasks to read/.test(a)), JSON.stringify(item.applied));
  const task = r.tasks.find((x) => x.email === "pat@example.test");
  assert.ok(task && /wrote back themselves/.test(task.task), JSON.stringify(r.tasks));
});

test("the inbox: an auto-reply still pauses with no task", () => {
  const replies = `From: Pat Lee <pat@example.test>
Subject: Automatic reply: the renewal

I am out of the office until Thursday, November 19.
`;
  const r = runInbox({ replies, prospects: "email,first_name,company,status\npat@example.test,Pat,Acme,active\n", today: T });
  assert.equal(r.items[0].triage.subtype, null);
  assert.equal(r.prospects[0].status, "paused");
  assert.equal(r.tasks.filter((x) => x.email === "pat@example.test").length, 0);
});

test("eval: textKey folds case, punctuation and spacing", () => {
  assert.equal(textKey("Please  REMOVE me, from the list!"), textKey("please remove me from the list"));
  assert.equal(textKey("x".repeat(400)).length, 300);
});
