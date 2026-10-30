---
title: "A babysitter's follow-through, on a timer: confirmations, reminders and STOP"
seo_title: "Babysitter confirmations, reminders and STOP, on a timer"
date: 2026-10-30
description: "The kit's server can now send six follow-up messages a solo babysitter forgets, with quiet hours, opt-outs and a sent log so nothing goes out twice."
tags: [babysitting-business-kit, automation, sms, email]
---

Most of a babysitter's sales work happens after the family says yes. You confirm the sit, check in the day before, say thank you, ask for a few words for your website, remind them about the $69 from Sunday, and a month later ask whether they would like another date night. Each one is a short message, and each one is easy to forget when you have three families and a class schedule.

The [Babysitting Business Kit](https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/) already drafted those messages on its Today tab. Its optional self-hosted server can now send them, on the sitter's own Resend (email) and Twilio (text) accounts, once each rule is turned on in Settings:

| Rule | When it goes |
|---|---|
| Booking confirmation | when a saved sit reaches the server; again only if its date or time changes |
| Reminder: "anything new I should know?" | inside the 24 hours before each sit, including each week of a repeating booking |
| Thank-you with a testimonial ask | 1 to 14 days after the first sit with a family |
| Rebook nudge | the family's last sit was N to N+90 days ago and nothing is booked |
| Unpaid reminder | at 3 days, then at 10, and never after 30 |
| Birthday note | on a child's birthday, only for families the sitter ticks |

Every rule starts off. The page shows a preview of what would go out right now, and the server has the same preview at `/api/automations/preview`. The tests are built on it.

## What the tests pin down

There are 19 tests (11 for the planner, 8 for the server). Some of the cases:

- A 6pm-9pm sit for two children at the default rate card ($20 an hour plus $3 for the second child) is confirmed as "about $69 at my rates". After the sitter moves it to 5pm, it is confirmed again with "Updated details". Saving it again without a change sends nothing.
- With no other rule on, a sit at 4pm on 5 November gets no reminder at 3:59pm on the 4th and one at 4:00pm. The family has no email on file, so it goes as a text to the number on file in +1 format.
- At 8:30pm the run sends nothing: quiet hours are 8pm to 8am in the sitter's time zone. The FCC's calling-hours rule for solicitations is 8am to 9pm at the recipient's location ([47 CFR 64.1200(c)(1)](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200)), so the default ends an hour earlier than that.
- A run that sends three messages, then a second run five minutes later, then a restart from the saved JSON file, makes three API calls in total. A sync from the browser app does not wipe the record either: the server merges its sent log and opt-outs into each upload.
- A message whose send keeps failing is tried three times and then dropped, so a bad address costs 3 calls rather than one every five minutes forever.
- A text of "Stop", "opt out" or "revoke" to the sitter's number, with a valid Twilio signature, opts that number out. "Please stop by at 5" does not. The signature check is tested against the worked example in [Twilio's security docs](https://www.twilio.com/docs/usage/security). A forged signature gets a 403.
- Opening an unsubscribe link does not unsubscribe anyone, because mail scanners open links too. The button on the page does, and so does the one-click `List-Unsubscribe-Post` request that mail apps send. A link with the wrong token gets a 400.
- A family that unsubscribed from email is not switched to texts.

## The consent part

Texts are where a small business can get into trouble. The README summarises the rules in plain words and links the sources. Under the FCC's TCPA rules ([47 CFR 64.1200](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200)), marketing texts sent with automated equipment need the recipient's prior express written consent, and a reply of "stop", "quit", "end", "revoke", "opt out", "cancel" or "unsubscribe" withdraws it. For email, the FTC's [CAN-SPAM guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business) asks commercial messages to carry a postal address and an opt-out. That is why the settings have a mailing-address box, and a P.O. box is fine. None of this is legal advice. The safest setup is to text only families who asked for texts, and to leave the rebook and birthday rules off until you have asked.

The code is MIT: `automations.mjs` plans the messages and runs in the browser too, and `automations-server.mjs` sends them. Self-hosting instructions are in the [README](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/babysitting-business-kit).
