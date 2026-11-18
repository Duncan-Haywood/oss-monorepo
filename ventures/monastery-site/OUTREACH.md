# Outreach to communities: a kit for the owner

The owner, 2026-11-03: "outreach for the project is probably by email to social
media management or vocations at the existing monasteries."

**Who sends:** the owner, personally, one message at a time, from their own
address. Agents never send these emails, never collect addresses into this
repository, and never automate a send. The rules are in
`portfolio/distribution/README.md` ("Never: unsolicited email ... cold
outreach of any kind, or scraping contact details") and `prompts/goals.md`.
Choosing to write to a community is the owner's call, and so is the legal risk
of doing it. This file only makes the emails good and lawful.

## Before the first email

1. **Have something worth showing.** The builder and both demo sites are live
   at https://marisstella.app/monastery-site/. Open them on a phone first.
2. **Offer the free set-up.** A community that replies "yes, but we have no
   one to do it" goes into the website-request queue
   (`portfolio/requests/`), where a run builds the site with them. Say so in
   the email, because that offer is what a small community can act on.
3. **Start small.** Ten to twenty communities, chosen by hand, where the
   website is missing, broken on a phone, or has no vocations or giving page.
   Read their replies before writing to more.

## Who to write to, and how to find them

- **The address the community publishes for that purpose:** the vocation
  director's email on its own site, or a "communications", "media" or "office"
  address. Prefer a role address to a personal one, and never guess an address.
- **Where to look, one community at a time:** the community's own website or
  Facebook page; its order's or congregation's list of houses; the diocese's
  directory of religious communities; national bodies such as the conferences
  of major superiors (in the US, CMSWR and LCWR for women religious, CMSM for
  men) and the Benedictine, Cistercian, Carmelite and Poor Clare federations.
- **Keep the list outside this public repository.** A spreadsheet on the
  owner's own computer, with the date written and whether they replied. Report
  counts only here (written, replied, built), never names or addresses.
- **Country:** start with the United States. Email to an organisation's role
  address for a free offer is lower risk under US law. The EU and UK (GDPR,
  PECR) and Canada (CASL, which needs consent for most commercial email) are
  stricter: write there only after a community asks, or with advice.

## What every email does

- Says who is writing (the owner's real name) and why, in the first two lines.
- Is honest: free, open source, no catch; what it does and what it does not do
  (it does not handle donations; it links to theirs).
- Has a subject line that says what the email is ("A free website for your
  community's vocations and giving pages"), never a fake "Re:".
- Gives a postal address and an easy way to say no ("Reply 'no thanks' and I
  won't write again"). These follow CAN-SPAM's requirements even where an
  email about a free tool may not strictly need them.
- Is sent once. No follow-up unless they reply. A "no", or silence, is final.
- Makes no claim the repository can't back: no user counts, no testimonials,
  no "trusted by".

## Drafts

### To a vocation director

> **Subject:** A free website for your community's vocations page
>
> Dear Sister [name] / Dear Father [name],
>
> My name is [owner's name]. I build free, open-source software for parishes
> and religious communities, and I made a website builder for monasteries and
> convents. It puts a vocations page at the centre: who may apply, the stages
> of formation, Come and See retreats, the questions discerners ask, and an
> inquiry form that comes straight to you.
>
> You can see an example here: https://marisstella.app/monastery-site/demo/sisters/vocations.html
> (the community is made up). The builder is at https://marisstella.app/monastery-site/.
>
> It is free, with no account, no fees and no advertising, and the site
> belongs to you. If no one in the community has time to set it up, I would be
> glad to do it with you at no cost.
>
> If this isn't useful, reply "no thanks" and I won't write again.
>
> With prayers,
> [owner's name]
> [postal address]

### To whoever runs the community's website or social media

> **Subject:** A free, simple website for [community name]
>
> Dear [name, or "Sister" / "Brother"],
>
> I'm [owner's name]. I make free, open-source tools for Catholic communities,
> and I've built a website builder made for monasteries and convents: horarium,
> vocations, giving, prayer requests, retreats and the guesthouse, all from one
> form. It produces plain pages that load fast on a phone and that any free host
> will serve. There is nothing to update and no plug-ins.
>
> Examples, both made-up communities: monks at https://marisstella.app/monastery-site/demo/abbey/
> and nuns at https://marisstella.app/monastery-site/demo/sisters/.
>
> Giving links go to your own donation page; the site never touches the money.
> If you'd like, I can set it up with you for free.
>
> If you'd rather not hear from me, just reply "no thanks".
>
> In Christ,
> [owner's name]
> [postal address]

### To the superior, where the community has no website at all

> **Subject:** A website for [community name], free of charge
>
> Dear Mother [name] / Dear Father Abbot,
>
> I'm [owner's name]. I noticed [community name] has no website, which can
> make it hard for young people discerning a vocation, or friends who wish to
> give, to find you. I've made a free, open-source website builder for
> religious communities, and I would be glad to build a simple site for you at
> no cost, in your own words, which you would own.
>
> An example of what it makes: https://marisstella.app/monastery-site/demo/abbey/
>
> If you would rather not, a reply of "no thanks" is enough, and I won't write
> again.
>
> With gratitude for your prayers,
> [owner's name]
> [postal address]

## After a reply

- **Yes, we'll try it:** point them at the builder, and ask what was hard.
  Their answer is the next ROADMAP item.
- **Yes, please build it:** open a website request in `portfolio/requests/`
  (no personal details in the public file beyond what they agree to publish)
  and build it from their own text.
- **No:** mark it in the owner's own list and never write again.
- Record the counts in the venture's ledger outcome: written, replied, sites built.
