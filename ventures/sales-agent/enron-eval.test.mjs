import test from "node:test";
import assert from "node:assert/strict";
import { triage, stripQuoted } from "./engine.mjs";
import { readAsServer, looksAuto, looksBounce } from "./eval/enron.mjs";

// Phrasings found on real mail (eval/enron.mjs on the Enron corpus, 2026-11-10; eval/README.md "Real mail: the Enron
// corpus"). Paraphrased, no names from the corpus. Each fired a stop (a lead suppressed, paused or marked departed) on
// real writing that asks for nothing of the kind.
const cat = (body, extra = {}) => triage({ body, subject: "", from: "pat@example.test", ...extra }, "2026-11-10").category;

const NOT_A_STOP = [
  "If you have received this email in error, please notify the sender and delete this message from your system.",
  "To unsubscribe from this group, send an email to: list-unsubscribe@example.test",
  "If you no longer wish to receive this alert, click here to unsubscribe.",
  "The contract has a one day opt-out clause.",
  "If you have any questions, please contact me at 555-0100.",
  "Please contact Sam Ortiz for the weekly dial-in number and passcode.",
  "I left you a voicemail this morning about the renewal.",
  "I have left Jordan a message asking her to call you.",
  "When I left the meeting I thought we had a plan.",
  "Please let us know how you would like us to handle this.",
  "There is no need to amend the schedule.",
  "Thanks, I'll pass it on to the rest of the team.",
  "I will pass your comments on to the committee.",
  "It is my understanding that the counterparty is not interested in an option.",
  "We are fine with changing the issue to yellow.",
  "Please advise if you are planning to be out of the office in June.",
  "She stepped out of the office for a minute.",
  "Sign it and I will return a fully executed copy to you.",
  "That adds about $800,ooo to this year's earnings.",
  "Can you get me off the phone with their lawyer by noon?",
  "Don't send me a message back saying it isn't true.",
  // Second round, 2026-11-11 (eval/README.md "Second round"), written from the two earlier halves only.
  "I left a copy of the broker quotes on your desk.",
  "I left at noon to catch my flight.",
  "Sorry I left your name off the note.",
  "Please email the signed version of both documents.",
  "Please email your street address to me.",
  "If you could handle this please.",
  "He has left town by now.",
  "Please consider the following retired judges.",
  "If you're not the right person, could you please pass it on.",
  "I tried to send this to your home email, but it was undeliverable.",
  "This came back to me as undeliverable so I'll try again.",
  "Please notify us immediately by reply e-mail and then delete this message from your system.",
  "Then she needs to stop sending these out like they are.",
  "Please do not email this to the lawyers.",
  "At least this is one thing to cross off your list.",
  "Voluntary opt out of the rate freeze.",
  "According to legal, we don't need to confirm any of these deals.",
  "No need to retract the invite at this point.",
  "No need for thanks.",
  "Not for us to contact the regulator about it.",
  "Thanks, I'll pass the good news on to the trader.",
  "I think we are good to go.",
  "The results were good.",
  "If you got them from the desk, then we're set.",
  "The assistant told me that you will be back on Friday.",
  "I will be back in touch within the next day or so.",
  "Now that I'm back in the office, I'm having folks check this.",
  "I have been out of the office with no access to e-mail, so sorry for the slow reply.",
  "I'm out of excuses now.",
  "While I'm out, please keep an eye on the deal.",
  "She wants us to hire everyone who is out on leave.",
  "I was unexpectedly out of the office yesterday and did not get to review it.",
];
for (const body of NOT_A_STOP) {
  test(`real-mail phrasing is not a stop: ${body.slice(0, 60)}`, () => {
    assert.ok(!["unsubscribe", "bounce", "left_company", "not_interested", "out_of_office"].includes(cat(body)), cat(body));
  });
}

// The real asks found in the same mail still stop.
const STILL = {
  "Take me off this list, please.": "unsubscribe",
  "Please remove me from your distribution list.": "unsubscribe",
  "Please take my name off of your emails, I am no longer in that group.": "unsubscribe",
  "I am out of the office until Monday.": "out_of_office",
  "I will be back in the office on Thursday.": "out_of_office",
  "I am on maternity leave.": "out_of_office",
  "I am no longer with the gas desk.": "left_company",
  "Susan handles that function.": "left_company",
  "Not interested.": "not_interested",
  "Thanks but I will pass for now.": "not_interested",
  "I'll pass on this one, good luck with it.": "not_interested",
  "Thanks but we're all set with our current provider.": "not_interested",
  // The real opt-out recall set (eval/optout-recall.mjs, 2026-11-10): the phrasings the rules missed, paraphrased.
  "Please get me off.": "unsubscribe",
  "Can you get me off whatever distribution list I am on?": "unsubscribe",
  "Could you get my name taken off the outage e-mail list?": "unsubscribe",
  "Please delete me from the list.": "unsubscribe",
  "Please delete my name off the mailing list and add my colleague.": "unsubscribe",
  "Please do not send me these charts.": "unsubscribe",
  "Please do not send me any other solicitation.": "unsubscribe",
  // Second round (2026-11-11): the narrowed rules still read these.
  "I left Acme in March, so please try Dana.": "left_company",
  "I have left the company.": "left_company",
  "Jordan has left Brightline.": "left_company",
  "I've recently retired.": "left_company",
  "Please contact Dana Lee, she runs purchasing now.": "left_company",
  "I'm out of town next week.": "out_of_office",
  "I am out for the next several weeks.": "out_of_office",
  "I'm currently out on a family emergency.": "out_of_office",
  "No need to follow up, thanks.": "not_interested",
  "We don't need to talk, we're covered.": "not_interested",
  "No thanks, we're good.": "not_interested",
};

// Lotus Notes quote headers (no "wrote:", no ">") are history, not the reply; so is a "Forwarded by" block.
test("a Lotus Notes quote header ends the reply", () => {
  const body = "Thanks, will look today.\n\n\nPat Doe@ECT\n09/26/2000 11:19 AM\nTo: Sam Roe/HOU/ECT@ECT\ncc:\nSubject: Re: contract\n\nPlease take me off this list.";
  assert.equal(stripQuoted(body), "Thanks, will look today.");
  assert.notEqual(cat(stripQuoted(body)), "unsubscribe");
  const fwd = "See below.\n---------------------- Forwarded by Sam Roe/HOU/ECT on 04/09/2001 04:48 PM ---------------------------\nI am out of the office until Monday.";
  assert.equal(stripQuoted(fwd), "See below.");
  const outlook = "ok\n\n\"Doe, Pat\" <pat@example.test> on 11/03/2000 03:18:19 PM\nTo: <sam@example.test>\ncc:\nSubject: RE:\n\nNot interested.";
  assert.equal(stripQuoted(outlook), "ok");
});
for (const [body, want] of Object.entries(STILL)) test(`real ask still stops: ${body}`, () => assert.equal(cat(body), want));

test("an auto-reply sent from postmaster@ is an away notice, not a bounce (real: maternity leave, referrals)", () => {
  const t = triage({ from: "postmaster@mail.example.test", subject: "Auto Reply to your message ...", body: "----- The following text is an automated response to your message -----\nThanks for your message, I am on maternity leave. In my absence, please contact Dana, dana@example.test" }, "2026-11-10");
  assert.equal(t.category, "out_of_office");
});

test("a person replying under an 'Undeliverable' subject is not a bounce; a daemon still is", () => {
  assert.notEqual(cat("Did this reach you? It came back the first time.", { subject: "RE: Fw: Undeliverable: Fw: Last schedule" }), "bounce");
  assert.equal(triage({ from: "mailer-daemon@mx.example.test", subject: "Undeliverable: hello", body: "User unknown" }, "2026-11-10").category, "bounce");
});

test("readAsServer reads a raw message the way the self-host server does (quoted-printable, history cut)", () => {
  const raw = "Message-ID: <1@example.test>\nFrom: pat@example.test\nSubject: RE: hello\nContent-Type: text/plain; charset=us-ascii\nContent-Transfer-Encoding: quoted-printable\n\nPlease take me off this list, th=\nanks.\n\n-----Original Message-----\nFrom: us@example.test\nWant a demo?";
  const got = readAsServer(raw);
  assert.equal(got.headers.messageId, "<1@example.test>");
  assert.equal(got.reply.body, "Please take me off this list, thanks.");
  assert.equal(triage(got.reply, "2026-11-10").category, "unsubscribe");
});

test("recall checks: auto-reply subjects only (not people asking for vacation days), daemon bounces", () => {
  assert.ok(looksAuto({ subject: "Out of Office AutoReply: budget" }));
  assert.ok(!looksAuto({ subject: "Vacation days" }) && !looksAuto({ subject: "Re: Out of office" }));
  assert.ok(looksBounce({ from: "Mail Delivery Subsystem <MAILER-DAEMON@mx.example.test>", subject: "Returned mail" }));
  assert.ok(!looksBounce({ from: "postmaster@x.example.test", subject: "Auto Reply to your message" }));
});
