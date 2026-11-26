import { type ResourceArticle, readingMinutesFor } from "./types";

const body = `The need statement (also called the statement of need or problem statement) is where you explain why your project matters. Everything that follows, from your activities to your budget, only makes sense if the need is clear. A good one is specific, backed by real data and honest about what that data shows.

This guide covers what to include, where to find trustworthy data, how to cite it and how to avoid the exaggerations that make reviewers stop trusting a proposal.

## Describe the community's need, not your organization's

A useful rule: the need statement describes something lacking *in the community you serve*, not what your organization needs to do its work. "We need a new van" is an organizational need. "Families in the north end of the county have no public transit to the only clinic offering prenatal care" is a community need, and the van is part of your answer.

A clear need statement usually answers five questions:

1. **Who** is affected? Be specific about the population: age, circumstances, location.
2. **Where?** Name the geography: neighborhood, county, reservation, service area.
3. **What is the problem**, and how big is it? This is where data goes.
4. **What's missing?** Explain the gap: what services exist, who they don't reach and why.
5. **Why you, and why now?** Connect the gap to your project and to the funder's priorities.

Keep it short. Candid suggests making your case in a page or less, and says to always follow the funder's guidelines, including its length limits and questions.

## Use real, local, recent data

Reviewers trust numbers they can check. The strongest need statements combine public data with your own records.

**Public data sources** that are free and widely trusted include:

- **The U.S. Census Bureau's American Community Survey (ACS)**, available at data.census.gov, for income, poverty, education, language, disability, housing, internet access and more, down to the county, town and census tract level.
- **The Bureau of Labor Statistics' Local Area Unemployment Statistics (LAUS)**, for monthly and annual unemployment and labor force data for states, counties, metro areas and many cities. Workforce programs often lean on this.
- **CDC PLACES**, for local estimates of health measures by county, place, census tract and ZIP code area.
- Your **state agencies**, for education, health, child welfare and workforce data. Many publish county dashboards.

**Your own data** is often the most persuasive, because no one else has it: waitlists, intake records, the number of people you turned away, the distance people travel to reach you, or results of a community survey you ran. Describe how you collected it and over what period.

**For tribal communities**, national survey figures for small populations can have large margins of error, and the tribe may hold better data of its own. Follow your tribe's or community's rules about what data can be shared and how, and ask permission before using community-held data in an application.

## Understand what the numbers can and can't tell you

You don't need to be a statistician, but a few habits will keep you accurate.

**Know which ACS estimate you're using.** The Census Bureau publishes 1-year estimates (most current, but only for areas with 65,000 or more people) and 5-year estimates (less current, but available for all areas and more reliable). For a small town, rural county or reservation, you'll usually need the 5-year estimates.

**Check the margin of error.** Every ACS figure is an estimate from a sample, and the Census Bureau publishes a margin of error with each one. For small areas the margin can be large. If a tract-level figure has a margin of error almost as big as the estimate, use a larger area, such as the county, or say the figure is uncertain.

**Compare like with like.** The Census Bureau says to compare 1-year estimates only with other 1-year estimates, and 5-year estimates only with non-overlapping 5-year estimates. Don't say a rate "rose" or "fell" by comparing two different kinds of estimates.

**Compare your area with a fair benchmark.** Comparing your county with the state or national figure for the same year and the same measure is often clearer than a number on its own.

## Cite every number

Every statistic should say where it came from. A citation should let a reviewer find the same number. Include:

- the source (for example, "U.S. Census Bureau, American Community Survey");
- the year or period and, for ACS, whether it's a 1-year or 5-year estimate;
- the geography;
- the table or page, or a link.

Follow the funder's format if it has one. If it doesn't, footnotes or a short source line after the figure both work. For your own data, cite it plainly: "Agency intake records, January to June 2026."

A sentence pattern that works: "According to the [source]'s [year] [estimate type], [figure] of [population] in [place] [measure], compared with [figure] statewide." Fill in each part from the source itself, word for word for the measure, so you don't change what it means.

## Don't exaggerate

Exaggeration is tempting when you care about the problem, but reviewers read a lot of proposals and they notice. One stretched claim can make them doubt everything else. Watch for these:

- **Superlatives you can't prove.** "The only program," "the highest rate in the state," "the worst crisis in decades." Use them only if a source says so, and cite it.
- **National numbers presented as local.** A national statistic tells reviewers about the country, not your county. If local data doesn't exist, say so, and use the national figure as context only.
- **Old data presented as current.** Give the year. If the newest data is several years old, say that too.
- **Rounding up.** If the source gives a precise figure, use it. Don't turn it into "nearly half" or "one in five" unless that's a fair reading, and never round in the direction that helps you.
- **Implied cause and effect.** Two things happening in the same place doesn't mean one caused the other. Say what the data shows and stop there.
- **Composite or invented stories.** If you share a participant's story, it must be real, shared with their permission and stripped of anything that could identify them unless they've agreed otherwise. Don't merge several people into one story without saying so.

If something important isn't documented, don't guess. Say what you know and how you know it, for example "staff report that most callers ask about evening classes," and if possible describe how the project will collect better data.

## Balance need with strength

A need statement that is all deficits can make a community sound hopeless and a project sound futile. Name the community's assets too: strong families, cultural traditions, local leaders, partners and your own track record. Funders want to invest in something that can work. Candid's guidance also suggests pairing data with human stories, as long as those stories are real.

## A quick checklist

- Describes the community's need, not your organization's
- Names a specific population and place
- Uses local data where it exists, with the year and source for every number
- Uses ACS 5-year estimates for small areas, and mentions uncertainty when margins are large
- Includes your own program data, with how and when it was collected
- Explains the gap in services, not just the size of the problem
- Contains no superlatives or stories you can't back up
- Connects clearly to your project and the funder's priorities

Grant Autopilot drafts need statements only from facts in your organization's records, each linked to the quote it came from, and it flags any number in a draft that doesn't appear in the facts it cites. If your records don't answer a funder's question, the draft leaves a gap for your team instead of filling it in.`;

export const needStatement: ResourceArticle = {
  slug: "need-statement-funders-trust",
  title: "Writing a need statement that funders trust",
  description:
    "How to describe your community's need with real, local data: where to find trustworthy numbers, how to cite them and how to avoid exaggeration.",
  updated: "2026-11-19",
  readingMinutes: readingMinutesFor(body),
  body,
  sources: [
    {
      title: "Candid: How to write a winning grant proposal",
      url: "https://candid.org/blogs/how-to-write-a-grant-proposal/",
    },
    {
      title: "U.S. Census Bureau: When to use 1-year or 5-year ACS estimates",
      url: "https://www.census.gov/programs-surveys/acs/guidance/estimates.html",
    },
    {
      title: "U.S. Census Bureau: Comparing ACS data",
      url: "https://www.census.gov/programs-surveys/acs/guidance/comparing-acs-data.html",
    },
    {
      title: "U.S. Bureau of Labor Statistics: Local Area Unemployment Statistics",
      url: "https://www.bls.gov/lau/",
    },
    {
      title: "CDC: PLACES, local data for better health",
      url: "https://www.cdc.gov/places/index.html",
    },
  ],
  related: [
    "how-we-keep-ai-drafts-honest",
    "documents-funders-ask-for",
    "federal-state-foundation-corporate-grants",
  ],
};
