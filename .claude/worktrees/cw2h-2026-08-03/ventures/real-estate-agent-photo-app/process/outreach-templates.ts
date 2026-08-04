/**
 * outreach-templates.ts — ready-to-send copy for booking the first
 * concierge-MVP customers (roadmap task p2-outreach-templates).
 *
 * Pairs with pricing-one-pager.ts: the one-pager is what a prospect reads,
 * this is what gets the one-pager in front of them. Everything here is a
 * template a human sends manually — no automated sending, no bulk/spam
 * outreach. Fill in the bracketed placeholders per prospect.
 *
 * These bodies are static strings (not template functions), so the
 * on-site-time quotes below are a plain hand-written number, not computed —
 * unlike pricing-one-pager.tsx, which computes the same quote from
 * process/capture-checklist.ts's onSiteTimeRange(). Re-check this file by
 * hand against that function's output any time capture-checklist.ts's shot
 * list changes (see decisions-log.ts: two sessions independently hand-fixed
 * this exact number within a minute of each other on 2026-07-13).
 */

export type OutreachTemplate = {
  id: string;
  channel: "email" | "dm" | "in_person_script" | "sms";
  audience: "agent" | "brokerage" | "str_host";
  subject?: string;
  body: string;
};

export const outreachTemplates: OutreachTemplate[] = [
  {
    id: "agent-cold-email",
    channel: "email",
    audience: "agent",
    subject: "MLS-ready photos for [Listing Address] — $19, ready tomorrow",
    body: `Hi [Agent first name],

I saw your listing at [address/neighborhood] — quick question: who's doing your listing photos right now?

I run a concierge photo service for agents: I come by, guide a ~35-40
minute iPhone shoot using a room-by-room checklist, then hand back 15-25
enhanced, MLS-ready photos within a business day. No photographer
scheduling, no software for you to learn.

First listing is $19, flat. If it's not clearly better than what you're
using now, the edit pass is free to redo — no charge either way for a bad
experience.

Want me to grab a slot for your next listing? Happy to do a walkthrough
of a current one first if that's easier.

[Your name]
[Phone / booking link]`,
  },
  {
    id: "agent-dm",
    channel: "dm",
    audience: "agent",
    body: `Hey [Agent first name] — noticed [address] just listed. I do a
$19 concierge photo shoot for agents (guided iPhone shoot, MLS-ready
photos back next business day, no photographer needed). Want me to swing
by for the next one?`,
  },
  {
    id: "agent-in-person",
    channel: "in_person_script",
    audience: "agent",
    body: `Opener: "Quick one — who's shooting your listing photos right now,
and how's that working out?"

If DIY/mediocre: "I do a $19 guided shoot — about 35-40 minutes with your
phone, I hand you back MLS-ready photos the next day. Want to try it on
your next listing? If it's not better than what you've got now, I'll redo
the edit for free."

If they use a photographer already: "Got it — mostly asking because a lot
of agents use us for the listings that can't wait 3-7 days for a
photographer slot. Worth keeping in your back pocket for a fast-turn
listing?"

Close: get a phone number/email and the next listing's address; follow up
same day with the one-pager (process/pricing-one-pager.tsx) and a
proposed shoot time.`,
  },
  {
    id: "brokerage-intro-email",
    channel: "email",
    audience: "brokerage",
    subject: "A $19/listing photo option for agents who don't hire a photographer",
    body: `Hi [Name],

A chunk of agents at most brokerages still shoot their own listing
photos, which usually means slower days-on-market on Zillow. I run a
concierge service that fixes that without asking anyone to change tools:
I guide a ~35-40 minute iPhone shoot and hand back MLS-ready photos within a
business day, for $19/listing.

Would it be useful to pilot this with 2-3 of your agents on their next
listings, on me, before we talk about anything wider? Happy to work
around whatever's easiest for your team's schedule.

[Your name]
[Phone / booking link]`,
  },
  {
    id: "str-host-dm",
    channel: "dm",
    audience: "str_host",
    body: `Hey [Host first name] — saw your [platform] listing at [property].
Professional-style photos usually pay for themselves in the first night
or two of extra bookings. I do a one-time $19-79 shoot + edit pass
(depends on unit size) — want me to refresh your listing photos before
your next booking gap?`,
  },
];

export type IntakeField = {
  field: string;
  purpose: string;
};

/**
 * Minimum info needed to book a concierge slot. Deliberately short —
 * anything longer risks losing the booking before the first shoot even
 * happens.
 */
export const bookingIntakeFields: IntakeField[] = [
  { field: "Property address", purpose: "Route the shoot and know square footage/room count in advance." },
  { field: "Preferred shoot date/time (2-3 options)", purpose: "Confirm a slot within 24-48 hours of ask." },
  { field: "Access instructions", purpose: "Lockbox code / agent meets on-site / vacant with key." },
  { field: "Best contact for delivery", purpose: "Where to send the finished photo folder." },
  { field: "MLS/board (if known)", purpose: "Confirms export format expectations; logged for p1-listing-audit context." },
];

export function templatesFor(audience: OutreachTemplate["audience"]): OutreachTemplate[] {
  return outreachTemplates.filter((t) => t.audience === audience);
}

/**
 * Fills in the "[Phone / booking link]" placeholder that agent-cold-email
 * and brokerage-intro-email leave for a real link. Takes the link as a
 * parameter instead of importing process/booking-link.ts directly, since
 * that module already imports bookingIntakeFields from this file — an
 * import the other way would form a cycle. Call sites (e.g. docs-site's
 * /pricing page) pass booking-link.ts's BOOKING_LINK.
 */
export function renderTemplateBody(template: OutreachTemplate, bookingLink: string): string {
  return template.body.replace("[Phone / booking link]", bookingLink);
}
