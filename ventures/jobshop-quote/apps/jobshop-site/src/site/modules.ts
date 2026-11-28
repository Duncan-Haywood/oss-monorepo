// Renders a module landing page (./module-data.ts) and its FAQ. The plan and "is it new" answers
// follow the launch switch like every other page.

import { EARLY_ACCESS_PLAN, formatUsd, PLANS } from "@shared/plans";
import { type Launch, SITE_NAME } from "./config";
import { type Html, html } from "./html";
import { MODULES, type ModuleData, type ModuleFaq } from "./module-data";
import { AI_OFF, ctaBand, href, primaryCta, type RenderContext, SHOTS, shotFigure } from "./pages";

/** The questions every module page answers, then the module's own. */
export function moduleFaqs(launch: Launch, m: ModuleData): readonly ModuleFaq[] {
  const from = formatUsd(Math.min(...PLANS.map((p) => p.monthlyPrice)));
  const plan = launch.open
    ? `Every plan, including the free ${EARLY_ACCESS_PLAN.name} plan (up to ${EARLY_ACCESS_PLAN.rfqsPerMonth} RFQs a month, ${EARLY_ACCESS_PLAN.seats} people, no card). Plans differ by RFQs a month and seats, not by features. Paid plans start at ${from} a month${launch.paidPlans ? "" : " and are not on sale yet"}.`
    : `Every plan. ${SITE_NAME} is in development: early access is free, up to ${EARLY_ACCESS_PLAN.rfqsPerMonth} RFQs a month, and proposed plans start at ${from} a month.`;
  const isNew = launch.open
    ? `Yes. It opened in November 2026 and has no customers, reviews or published results yet. What this page describes works in the hosted app today; check every price, time and quantity before you send a quote.`
    : `Yes. It is in development: what this page describes is built and being tested before the app opens to the public.`;
  return [
    { q: "Which plans include it?", a: plan },
    m.faq,
    { q: `Is ${SITE_NAME} new?`, a: isNew },
  ];
}

export function modulePage(ctx: RenderContext, m: ModuleData): Html {
  const others = MODULES.filter((x) => x !== m);
  const shot = m.shot ? shotFigure(ctx, SHOTS[m.shot.key], m.shot.caption) : "";
  return html`<section class="page-head">
  <div class="container narrow">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>${ctx.launch.open ? "In the app today" : "Built · in development"}</p>
    <h1>${m.h1}</h1>
    <p class="lead">${m.intro}</p>
    <p class="actions">${primaryCta(ctx)}</p>
  </div>
</section>
<section class="band">
  <div class="container narrow prose">
    <h2>What it does</h2>
    <ul>${m.does.map((d) => html`<li>${d}</li>`)}</ul>
    ${shot}
    <h2>What it does not do yet</h2>
    <ul>${m.limits.map((d) => html`<li>${d}</li>`)}</ul>
    ${m.id === "quoting" && !ctx.launch.aiReading ? html`<p class="fineprint">${AI_OFF}</p>` : ""}
    <h2>Free guides on this</h2>
    <ul>${m.guides.map((g) => html`<li><a class="link" href="${href(ctx, g.path)}">${g.label}</a></li>`)}</ul>
  </div>
</section>
<section class="band band-muted">
  <div class="container narrow faq">
    <h2>Common questions</h2>
    ${moduleFaqs(ctx.launch, m).map((f) => html`<details><summary>${f.q}</summary><p>${f.a}</p></details>`)}
  </div>
</section>
<section class="band">
  <div class="container narrow prose">
    <h2>The rest of ${SITE_NAME}</h2>
    <p>Every part works on the same rate card and the same quotes, so nothing is typed twice.</p>
    <ul>${others.map((x) => html`<li><a class="link" href="${href(ctx, x.path)}">${x.label}</a></li>`)}</ul>
    <p><a class="link" href="${href(ctx, "/how-it-works")}">How it works, step by step</a> · <a class="link" href="${href(ctx, "/pricing")}">Pricing</a></p>
  </div>
</section>
${ctaBand(
  ctx,
  "Try it on your own RFQs",
  ctx.launch.open
    ? "The Early access plan is free and needs no card."
    : "Early access is free while it's in development.",
)}`;
}
