import { type ResourceArticle, readingMinutesFor } from "./types";

const body = `A grant application is a promise to a funder. If it states a number that's wrong, a partnership that doesn't exist or an outcome that never happened, your organization can lose a funder's trust, and with federal money there can be legal consequences too. AI writing tools make this risk worse, because they write fluent, confident text whether or not anything supports it.

Grant Autopilot is built around that risk. This article explains, in plain terms, how our drafts are kept honest, and where the limits are.

## 1. A fact base, not a pile of documents

Before Grant Autopilot drafts anything, it builds a **fact base** for your organization: a list of short, single statements, such as when you were founded, how many people a program served last year or who your partners are.

Every fact records where it came from:

- a document you uploaded, with the **exact quote** it was taken from;
- an answer from an interview with someone on your team;
- something a person typed in directly; or
- a page from your website, if you've allowed us to read it.

Facts the AI pulls out of documents and interviews start as **suggestions**. Someone on your team confirms them, rejects them or replaces them with a newer fact. Facts a person types in are treated as confirmed. You can also mark a fact as **restricted**, for example details about the people you serve, and restricted facts are never sent to the AI when it writes an application.

## 2. The drafter works from facts, and cites them

When Grant Autopilot drafts an application, the AI receives your usable facts: not rejected ones, not ones that have been replaced and not restricted ones. It doesn't write from your documents directly. Past applications you've rated highly may be shown to it as examples of style, but they are never a source of claims.

Each draft is built from small pieces called claims, and each claim is one of two kinds:

- a **factual claim**, which asserts something checkable, must cite at least one fact; or
- a **framing claim**, which is connecting or persuasive language, must not contain numbers, names, dates or outcomes.

That's what lets you click any factual sentence and see the fact behind it and the quote that fact came from.

## 3. Gaps instead of invention

Funders ask questions your records can't always answer. When that happens, the drafter doesn't fill the hole with something plausible. It leaves a **gap**: the question it couldn't answer and why.

Gaps become open questions for your team, and Grant Autopilot can turn them into a short follow-up interview. Until the gaps are answered, the application waits for information rather than moving forward.

Your first drafts will probably have more gaps than you'd like. That's expected. Each answer adds to your fact base, so later applications have fewer.

## 4. An independent check of every claim

Citations make claims checkable. They don't guarantee a claim is right: a model can cite a real fact and still state it wrongly, with a different number, a bigger result or a wrong year. And a writer checking its own work tends to share its own blind spots.

So after every draft, and again after every edit or regeneration, a **separate checker** reviews the draft. It has its own instructions and makes its own calls to the AI, and it never sees the drafter's reasoning. It works in two layers.

**Mechanical checks** that don't rely on AI judgment:

- every number, date, dollar amount and percentage in a claim must appear in the facts it cites;
- framing claims must not contain numbers, names, outcome words or superlatives;
- a factual claim with no citation is flagged;
- citations to facts that were rejected, replaced or don't exist are flagged, and so are citations to restricted facts;
- missing required sections and unanswered gaps are flagged;
- going over a funder's word or character limit gets a warning.

**A claim-by-claim review** in which the checker compares each factual claim with the facts it cites and decides whether the claim is supported, partly supported, unsupported or can't be checked. An unsupported claim always blocks the application.

The checker **fails closed**. If it can't reach a verdict on a claim, or a check fails to run, that counts against the draft, not for it. A draft only passes when there are no unsupported claims, no numbers that don't match their sources and no open gaps.

The checker isn't perfect, and we've chosen which way it errs. Sometimes it flags a sentence that's actually a fair paraphrase. That costs a reviewer a click. Letting a wrong claim through would cost much more. Before we change how the checker works, we test it against drafts with deliberately planted false claims and require it to catch every one.

## 5. Suggested facts are flagged

By default, drafts may cite facts that are still suggestions, so you aren't blocked while your team works through them. But every claim that relies on an unconfirmed fact is flagged so a reviewer can see it, and an owner or admin can turn this off in your drafting settings so drafts use confirmed facts only.

## 6. People approve what goes out

Checks catch problems. People decide. After the checker runs, each application is routed to a level of review:

- **Full review**, section by section, for large requests, applications you're likely to win or anything with an unresolved problem.
- **One-click approval** for most applications: a reviewer sees the prepared package, a summary and every open flag, and approves when satisfied.
- **Autopilot**, which is **off by default**. An owner or admin can turn it on for small, low-risk requests and set its limits, such as the maximum amount and a monthly cap. Even then, an application only goes out automatically if it passes every check, has no open problems blocking it, cites only confirmed facts, isn't your first application to that funder (unless you change that setting) and can be sent without a person, which today means email. Anything else comes to a person.

Grants.gov applications are always submitted by your own authorized representative. Grant Autopilot prepares the package; it doesn't submit to Grants.gov for you.

## 7. A record you can check later

Every draft and every edit is saved as a new version, so earlier versions are never lost. When an application is submitted, we keep the exact package with a digital fingerprint that shows it hasn't been altered since, and important actions are recorded in an audit log your admins can review.

## The honest limits

- **The checker confirms a claim matches your records. It can't tell whether your records are right.** If a document has an out-of-date or mistaken number, the draft will faithfully repeat it. That's why confirming facts matters, and why a person on your team should know the numbers.
- **AI can still make mistakes.** The checks are designed to catch them before a person sees the draft, and the review step is there to catch anything they miss.
- **Grant Autopilot can't promise funding.** Funders make their own decisions, and your organization remains the applicant, responsible for what it submits.

Your documents, interviews and drafts are used only for your organization's own applications. They're never sold and never used to train AI models. You can read more on our [Security & privacy page](/trust) and in our [Data Use Policy](/legal/data-use).`;

export const aiDraftsHonest: ResourceArticle = {
  slug: "how-we-keep-ai-drafts-honest",
  title: "How we keep AI drafts honest",
  description:
    "How Grant Autopilot drafts only from your facts, cites every claim, checks each one independently, leaves gaps instead of guessing and waits for your approval.",
  updated: "2026-11-19",
  readingMinutes: readingMinutesFor(body),
  body,
  sources: [
    { title: "Grant Autopilot: Security, privacy and accuracy", url: "/trust" },
    { title: "Grant Autopilot: How it works", url: "/how-it-works" },
    { title: "Grant Autopilot: Data Use Policy", url: "/legal/data-use" },
  ],
  related: [
    "need-statement-funders-trust",
    "documents-funders-ask-for",
    "grant-reporting-and-follow-ups",
  ],
};
