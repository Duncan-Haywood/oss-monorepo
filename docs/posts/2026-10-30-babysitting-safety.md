---
title: "A late-sit check-in for babysitters, and an emergency card that works offline"
date: 2026-10-30
tags: [babysitting-business-kit, safety, self-hosted, privacy]
description: "A check-in that alerts a trusted contact if a sitter isn't home on time, ignoring quiet hours, plus a per-family emergency card and a 10-item house checklist."
---

Babysitters often drive home alone late at night from a house they had not seen a month earlier. The [Babysitting Business Kit](https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/) now has a **Safety** tab for that part of the job.

**Late-sit check-in.** Before a sit, the sitter names someone she trusts and sets a "home by" time. Her own server (the optional one she self-hosts) handles the rest:

- at the home-by time she gets a reminder with a private link (`/safe/<128-bit token>`). One tap says "I'm home safe", and two more buttons add 30 minutes or an hour;
- if she still has not checked in after the grace period (10 to 240 minutes, 30 by default), the server texts the contact through her Twilio account or emails them through her Resend account;
- the contact is told her name, her phone number, the time and only the place she picked: the family's town, their street with no house number, or nothing at all. The message never includes the children's names or any other detail about them, and a test checks for that;
- if she checks in after the alert has gone out, the contact gets an all-clear.

The kit's marketing automations stay silent from 8pm to 8am. **Safety alerts ignore those quiet hours on purpose**, because an alert at 1am is the reason the feature exists. The server checks every minute and retries a failed send up to five times. It also refuses to start a check-in it could not deliver, for example when there is a phone number but no Twilio account, so nobody trusts a timer that cannot go off. Opening the link (a GET request) never changes anything, so a link preview can't check her in by accident. If the app syncs with old data, the server keeps its own newer copy of each check-in.

**Emergency card.** For each family, a one-page card built from what the app already holds: the family record plus the info sheet the parents filled in. It has the address and nearest cross streets, the parents' phones, emergency contacts, each child's allergies and medicines, the pediatrician and hospital, and whether a medical consent note is on file. A red box at the top says "call 911 first" for anything life-threatening and gives the Poison Help number, 1-800-222-1222, as listed on [poison.org](https://www.poison.org/). The card opens offline from the installed app, so a sitter can print one copy for her bag and one for the fridge.

**House walk-through.** Ten items to go over with the parents on the first visit: two ways out, smoke alarms and the extinguisher, the first-aid kit, medicines, pets, a pool or other water, hazards locked away, doors and the alarm, the address for 911, and phone signal. The checklist is saved per family. Notes on where things are print on the card. The card also lists anything still missing: in the invented example, one family has everything filled in and the other is missing cross streets, an emergency contact and a doctor.

By the numbers: three new modules (283 + 132 + 143 lines) and 13 tests, using a fake clock and a fake fetch. They check that nothing is sent before home-by, that the reminder comes at home-by, and that the alert goes out at 10pm local time, inside quiet hours. It is a backup, not an emergency service: an alert can arrive up to a minute late, and only if her server and her messaging accounts are working.
