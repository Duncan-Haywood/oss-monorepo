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

// Third round, 2026-11-11 (eval/README.md "Third round"): written from the 0*-2* halves, scored once on the unread 3* half.
// Paraphrased, no corpus names.
const THIRD_NOT_A_STOP = [
  "I will pass this information along to both Jo and Kim.",
  "Thanks, I'll pass along your comments.",
  "He is not a great fit because of his lack of legal experience.",
  "When I asked Lee about it back then she decided against it.",
  "We have some space available and were not looking to expand there.",
  "We're all set to move forward starting next month.",
  "You will probably need to close the file before you attach it.",
  "We do not need access until Monday morning.",
  "No need to call Lone Star.",
  "Sam is out of the office until Monday, I will change the deals for him.",
  "Both are out of the office right now, so it might be tomorrow.",
  "Please note that Mike McConnell will be out of town through the 4th.",
  "I just got back in the office today and am going over the days.",
  "I'm traveling today but I'll call you back to set up an agenda.",
  "Let's omit the people who left the company.",
  "Nadia, would you please contact Patti and set up a time?",
  "Saturday doesn't work for me.",
  "They have moved on to plan B.",
  "Tell them to stop sending invoices to you.",
  "I will remove it from John's calendar.",
];
for (const body of THIRD_NOT_A_STOP) test(`third round, not a stop: ${body}`, () => assert.ok(!["unsubscribe", "bounce", "left_company", "not_interested", "out_of_office"].includes(cat(body)), cat(body)));

test("third round: a Re: subject is the thread's subject, not the reply's words; an auto-reply subject still counts", () => {
  assert.notEqual(cat("Good luck, keep in touch.", { subject: "Re: Pat is no longer at Acme" }), "left_company");
  assert.notEqual(cat("The page went live today.", { subject: "RE: TW Unsubscribed Capacity" }), "unsubscribe");
  assert.equal(cat("", { subject: "Out of Office: budget" }), "out_of_office");
  assert.equal(cat("Please take me off your list.", { subject: "Re: quick question" }), "unsubscribe");
});

test("third round: the real asks still stop", () => {
  assert.equal(cat("Please discontinue sending me these requests for approval."), "unsubscribe");
  assert.equal(cat("I am out of the office until Monday."), "out_of_office");
  assert.equal(cat("No."), "not_interested");
  assert.equal(cat("This seems to not ever get resolved. Looks good to me."), "unclear");
  assert.equal(cat("Not now, and not later either."), "not_interested");
});

// Fourth round, 2026-11-11 (eval/README.md "Fourth round"): written from the 0*-3* halves, scored once on the unread 4* half.
// Paraphrased, no corpus names.
const FOURTH_NOT_A_STOP = [
  "Lee, the firm's CEO, is traveling and won't be back in the office until Wednesday.",
  "Apparently the person she needs to talk to is out of the office.",
  "One of those guys should be back in the office shortly, and I'll let you know.",
  "Somehow her Out of Office notification stopped working.",
  "We hope you will return soon to our site.",
  "I will be out of the office on Friday, but will be in all next week if you want to discuss.",
  "I will be out of the office this afternoon but in all day tomorrow.",
  "My mom had surgery last week and I was in and out of the office.",
  "It is amazing what two days out of the office will do to my workload!",
  "Sorry, I am traveling a bunch.",
  "I am not sure when I will be back up there.",
  "There is a good chance that I will return to Portland.",
  "We're all fine, but very busy!",
  "We are set for closing at 10:00 AM today.",
  "I'll pass on any other articles on the industry.",
  "I guess we don't need the talking points, but we should still find out why.",
  "If you are comfortable with where this is going, then we do not need to meet.",
  "We don't need three different people collecting the same information.",
  "I don't need Smith & Jones to serve as lobbyists.",
  "It isn't really relevant for purposes of the guaranty.",
  "But no need to set up a formal agenda.",
  "The daily quantity does not fit in a deficiency default.",
  "If you need to take it off, take it as vacation for now.",
  "Could we sell it to one buyer and take it off the market?",
  "I would rather not get into the habit of locking in curves early.",
  "At least they leave me alone and let me work out.",
  "No more email for you today.",
  "The updated TW Unsubscribed Capacity page went to production today.",
  "If you have any legal questions feel free to call our lawyer at 555-0100.",
  "The agreement has a confidentiality provision that goes to internal communication.",
  "Now that Randy Lee has left Brightline, they are unlikely to reply soon.",
  "Turns out I was just asking the wrong person.",
  "No. 5 -- add that we are always the counterparty.",
  "No - they pay you just for being you!",
  "Nope. What's the occasion?",
];
for (const body of FOURTH_NOT_A_STOP) test(`fourth round, not a stop: ${body}`, () => assert.ok(!["unsubscribe", "bounce", "left_company", "not_interested", "out_of_office"].includes(cat(body)), cat(body)));

test("fourth round: the real asks still stop", () => {
  assert.equal(cat("No."), "not_interested");
  assert.equal(cat("Nope.\n\nPat Doe\nVP Sales, Acme"), "not_interested");
  assert.equal(cat("No. We are happy with our current vendor."), "not_interested");
  assert.equal(cat("I am out of the office until Monday."), "out_of_office");
  assert.equal(cat("Hi Sam, I am out of the office until Monday, November 20."), "out_of_office");
  assert.equal(cat("I am in London until Friday and out of the office."), "out_of_office");
  assert.equal(cat("Please take me off your list."), "unsubscribe");
  assert.equal(cat("Please leave me alone."), "unsubscribe");
  assert.equal(cat("Jordan has left Brightline."), "left_company");
});

// Fifth round (eval/README.md "Fifth round"): paraphrases of the real phrasings the round-5 rules answer, names changed.
const re = (body) => triage({ subject: "Re: rollout", body }, "2001-06-01").category;
const FIFTH_NOT_A_STOP = [
  "NO. I need to know how many beds there are in total!",
  "No. I do not have any contact information for them.",
  "no - I never heard back from them.",
  "Mr. Hale had passed this on to Jo Brant in the broadband group.",
  "I spoke with Karen about the volume. She said that she passed it on to Fred Boas.",
  "I just don't know how many questions they can come up with. I've quit predicting.",
  "Broadband has taken five people out of East Power and left us short.",
  "Faxing drafts does not work for me.",
  "So I told her I was not interested for now, but it might be worth finding out more.",
  "Actually they are not looking at us. I heard it wrong.",
  "Sorry, we have booked the flights and we do not need the extra night. Is it ok to cancel it and send a new confirm?",
  "Thank you. I don't need the value. I just need the transport report so I can check positions.",
  "I agree that we don't need an RTO, we need to fix the transmission rules.",
  "Thanks for your help, I have talked with Mr. Shaw and we are all set. Give  me a call, I will be here till 6.",
  "It gives customers the opportunity to opt-out of the program.",
  "Sure wish I had a coffee to take my mind off the pain.",
  "The only item from your list that I need clarified is the extensions.",
];
for (const body of FIFTH_NOT_A_STOP) test(`fifth round, not a stop: ${body}`, () => assert.ok(!["unsubscribe", "bounce", "left_company", "not_interested", "out_of_office"].includes(re(body)), re(body)));

test("fifth round: a short absence inside a working reply goes to a person; a notice or a longer absence still pauses", () => {
  const work = "I have asked Bob, Kim and Mechelle to attend the review. I don't have confirmation yet on whether all three can make it. I thought that asking three would fit one of their schedules. I will be out of the office that day.";
  assert.ok(!["out_of_office"].includes(re(work)), re(work));
  // The same sentence under the notice's own subject, or with a return date, or with nothing else, is an away notice.
  assert.equal(triage({ subject: "Out of office", body: work }, "2001-06-01").category, "out_of_office");
  assert.equal(re("I have asked Bob, Kim and Mechelle to attend the review. I don't have confirmation yet on whether all three can make it. I thought that asking three would fit one of their schedules. I will be out of the office until November 12th."), "out_of_office");
  assert.equal(re("I will be out of the office Friday."), "out_of_office");
});

test("fifth round: the real asks still stop", () => {
  assert.equal(re("No. thank you"), "not_interested");
  assert.equal(re("No. We are not interested."), "not_interested");
  assert.equal(re("Nope. Not something a firm like ours would ever buy."), "not_interested");
  assert.equal(re("We don't need it, thanks."), "not_interested");
  assert.equal(re("Please take me off your list."), "unsubscribe");
  assert.equal(re("I left Acme in March."), "left_company");
  assert.equal(re("I've passed this to our head of operations."), "left_company");
});

// Sixth round, 2026-11-11 (eval/README.md "Sixth round"): what the parallel round-5 version had and the landed one lacked, plus
// three real declines both lost on 5*. Real phrasings, names changed.
const SIXTH_NOT_A_STOP = [
  "Mr. Lay had passed this on to Joe Hirko in Broadband Services.",
  "Another thought. Please, send me your resume, I shall forward it to our head trader.",
  "Please e-mail Karen or me with feedback on the candidates.",
  "Yes I will be back tonight",
  "Ryan runs our model for us now so I don't need this spreadsheet everyday.",
  "I agree. We do not need anyone speaking at this.",
  "Could you call me when we're set to trade with Cinnabar?",
  "No need for Ken's involvement with her at this point.",
  "Let me know if you'd like me to politely intervene and take this off your list.",
  "Please notify the sender of the delivery error by replying to this message, and then delete it from your system.",
  "Sorry for the delayed response. Moving Azurix back was decided last year. We did combine them into the D&O program. I am traveling tomorrow and will return to the office Wednesday before noon.",
  "FYI - Tomorrow is better than Monday. On Monday I will be out of the office until late afternoon.",
];
for (const body of SIXTH_NOT_A_STOP) test(`sixth round, not a stop: ${body}`, () => assert.ok(!["unsubscribe", "bounce", "left_company", "not_interested", "out_of_office"].includes(re(body)), re(body)));

test("sixth round: the real asks still stop", () => {
  assert.equal(re("No.  I'll let this one go.    Thanks,  Grigsby"), "not_interested");
  assert.equal(re("No.  I will not agree to any penalty charges on nomination errors.  Please call me if you have any questions."), "not_interested");
  assert.equal(re("Thanks for the resume.  I do not need a regulatory lawyer at this time.    Mark"), "not_interested");
  // Fixed in round 7: "Please cancel the Palm.Net service" is a decline, not a request that scopes work.
  assert.equal(re("remove from list.  no longer with gas desk.  LC"), "unsubscribe");
  assert.equal(re("Thanks for your note. I am out of the office until Monday, November 20."), "out_of_office");
  assert.equal(re("I have passed this on to our head of procurement."), "left_company");
});

// Seventh round, 2026-11-11 (eval/README.md "Seventh round"): from the stops still wrong on 0*-6* under the round-6 rules.
// Real phrasings, names changed.
const SEVENTH_NOT_A_STOP = [
  "Actually I have no plans, but I'm very willing to get away from my desk for a little while.",
  "I am back in the office if anyone needs me.  I will be out of the office tomorrow during the same time out today -- 9:30 until 11.",
  "I can meet at 900 on Thurs.  I will be out of office from 1030 until 300 and then back thanks",
  "Unfortunately, these new dates don't work for me.  The kids' spring break is next week, March 12-16, I will be out of the office that week on vacation.",
  "Thanks Carol, I understand you are only focusing on the online deals. Regarding credit, Rod has been supporting us. Last week we spoke about this. He believes there could be some exposure. I suggest a call wednesday morning. I am traveling wednesday but reachable through my assistant Barbara. Please call any time.",
  "I won't be able to attend the forum since I am travelling but do have a suggestion that would make it more attractive.",
  "Hello Shirley, I'm here until about mid-May and then will go on leave in Europe for a year. I could be available to make trips back and forth.",
  "you're not supposed to let go while I'm away.",
  "I will be back in not too long.",
  "Will be back early evening and all day sunday.",
  "Yes! and when you come visit I'll take my ring off my finger and show it to you.",
  "That sounds great! I'll take it off the list.  Thanks guys",
  "If I can get the clean version, I'm happy to run a blackline here.  Maybe getting out of your system would help!",
  'After my 130th message, I sent back a screaming "UNSUBSCRIBE" message and this is what I got in return',
  "Kudos to all those who opted out of the boat party.",
  "John was not interested in Mike after I spoke with him.",
  "Mike:  We have sent our comments.  We do not need anything from you yet.  Thanks.  Sara",
  "no thanks necessary",
  "John, It is not relevant that it is not standard practice to grant origination for closed deals.",
  "I'm not looking to make money on the grapes.  Just looking for someone to finance the land.",
  "The mail carrier said that a gate key (their key does not fit any of the doors) was the best answer.",
  "Yes, there is a formal process.  Please contact Brent Price for our DASH.",
  "If you have any questions, please speak with Maggie or Julie.",
  "My husband is no longer with Koch, but we do live in Southside.",
  "Richard: I received a delivery failure notice when I tried to forward this to you and the outside lawyers.",
  "No.  Just wanted your thoughts.  Thanks.",
  "no - just a chance to sell more",
  "I have passed it on to Dave and will let you know!",
  "And I certainly never EVER called you that last night.",
];
for (const body of SEVENTH_NOT_A_STOP) test(`seventh round, not a stop: ${body}`, () => assert.ok(!["unsubscribe", "bounce", "left_company", "not_interested", "out_of_office"].includes(re(body)), re(body)));

test("seventh round: the real asks still stop", () => {
  assert.equal(re("Please cancel the Palm.Net service effective immediately.  I am no longer using the Palm Pilot and therefore do not need the Palm.Net service.  Thank you for your assistance."), "not_interested");
  assert.equal(re("Please cancel my subscription."), "not_interested");
  assert.equal(re("Nope.  Just bring a smile."), "not_interested");
  assert.equal(re("We already use Outreach and I can't see us switching. Not looking to cancel our contract anytime soon."), "not_interested");
  assert.equal(re("FYI: I will be out tomorrow 3/10/00 and all next week (3/13-3/17) on vacation.  Grant and Vincent can handle urgent matters while I am away."), "out_of_office");
  assert.equal(re("I am out of the office until 11/20 and will reply when I return."), "out_of_office");
  assert.equal(re("Please never ever contact me again."), "unsubscribe");
  assert.equal(re("I passed it on to Stacey."), "left_company");
  // Still a request that scopes work: "is it ok to cancel ... please send a new confirm".
  assert.ok(!["not_interested"].includes(re("we do not need the extra night - is it ok to cancel and please send a new confirm")));
});

test("a date that does not suit someone else is scheduling, not a departure (7*, 2026-11-11)", () => {
  const t = triage({ from: "a@example.com", subject: "RE: meeting", body: "Lay asked me to let you know that these dates don't work for him, either." }, "2001-06-01");
  assert.notEqual(t.category, "left_company");
  const still = triage({ from: "a@example.com", subject: "RE: proposal", body: "Joe doesn't work for us anymore. Please contact Sam." }, "2001-06-01");
  assert.equal(still.category, "left_company");
});
