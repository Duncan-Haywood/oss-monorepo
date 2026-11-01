---
title: "An AI support agent that knows when to hand off, measured on 2,160 real bank questions"
seo_title: "AI support agent that knows when to hand off: 2,160 bank questions"
date: 2026-10-21
description: "Past tickets matter more than the model: on BANKING77's held-out test, 40 labelled past questions per topic took right answers from 65 to 1,007."
tags: [projects, customer-service, ai-agents, evaluation, open-source]
---

# An AI support agent that knows when to hand off, measured on 2,160 real bank questions

The pitch for an AI support agent is simple: the same twenty questions
(where's my order, how do I cancel, how do I reset my password) take up most
of a small team's day, and a chat could answer them at 2am. The worry is
just as simple. A model given your help docs answers *something* every time,
in the same confident tone whether it is right or has made up a refund
policy.

So the question we put to the new open-source
[Support Agent](/ventures/support-agent/README.md) was not "how often does it
answer?" It was "how often does it answer *wrongly*, and what does it do with
the rest?" Every number below comes from
`node fixtures/banking77/benchmark.mjs` in that folder.

## The test: real customer questions, and some it should refuse

[BANKING77](https://arxiv.org/abs/2003.04807) (PolyAI, CC BY 4.0) is 13,083
questions people wrote to an online bank, each labelled with one of 77
intents. It is a good stress test because many intents are near-twins:
"contactless isn't working" and "my card payment was declined" use almost the
same words, but the first has a help-article answer and the second needs
someone to look at the account.

We wrote 22 short help articles for a made-up money app from the intent names
alone, covering 34 intents. We deliberately left 20 intents uncovered: lost
cards, double charges, refund requests, payments the customer doesn't
recognise, failed transfers. A good agent hands those to a person. The
agent's settings were fitted on the dataset's training questions. The scores
are on its held-out test split: 2,160 questions, 1,360 of them answerable from
an article.

## The agent never has to answer

Support Agent has four moves, and each reply says which one it made and why:

1. **Hand off by rule**, before searching: the customer asks for a person, or
   for money to move, or mentions a lawyer, an injury, a hacked account, a
   data deletion request, sounds furious, or pastes a card number.
2. **Answer**, when its confidence clears a bar: the matching passage is
   copied from the article, with the article named.
3. **Offer articles**, when it is fairly but not fully sure: "these may
   answer it", with "talk to a person" one click away.
4. **Hand off**, otherwise, with the chat so far sent to your inbox.

The confidence is a small logistic model over signals such as how much of the
question the best article covers and how far ahead of the runner-up it is.
The bar is chosen from labelled questions: the highest number of right
answers while wrong answers stay at or under 5% of answers given.

## What happened

| Past questions per topic | Answered right | Answered wrong (share of answers) | Offered articles | Handed off |
|---|---|---|---|---|
| none | 65 (3.0%) | 0 (0%) | 1,172 | 923 |
| 10 | 786 (36.4%) | 39 (4.7%) | 431 | 904 |
| 40 | 1,007 (46.6%) | 66 (6.2%) | 211 | 876 |

"Past questions" are questions customers really asked, each labelled with the
article that answered it, or with "handoff" when a person had to deal with it.
They were drawn from the training split, never from the test questions.

**Past tickets are the lever.** With nothing but the articles, plain word
matching could not tell the near-twins apart at a 5% error cap, so the agent
was cautious. It stated only 65 answers, all right, and offered articles for
1,172 questions (851 of those offers included the right article). Given 40
labelled past questions per topic, it answered 1,007 questions right: 74% of
the answerable ones. Those labels are something most support teams already
have, buried in their inbox.

**Questions that need a person were rarely answered.** Of the 800 uncovered
questions, 15 (with 10 past questions per topic) and 22 (with 40) got an
answer. The rest were handed off or offered articles. Most wrong answers were
the other kind of mistake: an answerable question sent to the wrong article.

**The bar drifts on questions it has not seen.** It was set to keep wrong
answers at or under 5% on the training questions. On the test split it came
out at 4.7% with 10 past questions per topic and 6.2% with 40. If you can live
with 5%, set the cap lower, and re-run your own test questions after every
change to the articles.

## Where the model fits

In this design, a language model never decides whether to answer. Without
one, answers are copied sentences, so nothing can be invented. With one (your
own key, or a model on your own machine), it may reword an answer the agent
has already chosen, from that article only. The rewording is thrown away if it
contains a number, a link, an email address or a promise ("refund", "free of
charge", "guarantee") that the article doesn't, or if it cites no passage.

That is a narrower job than most AI support products give their model. It is
also one you can check, which is the point.

## Caveats

- BANKING77 is banking, in English, and harder than most shops: few small
  businesses have twenty near-identical ways to say "my card doesn't work".
  The coffee-shop sample in the repository does better (32 right, 1 wrong of
  86), but we wrote those questions ourselves, so they are a demo, not
  evidence.
- We wrote the 22 articles. Better articles would score better; so would
  embeddings, which this version does not use.
- The test split was scored three times while the code changed for unrelated
  reasons; the
  [benchmark notes](/ventures/support-agent/fixtures/banking77/README.md) give
  every run's numbers.

## Try it

The [browser page](https://duncan-haywood.github.io/monorepo-projects/support-agent/)
runs the agent and the evaluation on your own articles and questions, with
nothing uploaded. The server is one Node process with no dependencies. It
serves a chat bubble for your site and hands conversations to
[Support Desk](/ventures/support-desk/README.md) or any inbox webhook. Its
admin page lists the questions customers asked that no article answered,
which is the list of articles to write next.

*Built and measured by Claude (an AI coding agent) in one session, at the
owner's request "I want to make AI customer service systems." Not legal or
professional advice; you are responsible for what your support channel tells
customers.*
