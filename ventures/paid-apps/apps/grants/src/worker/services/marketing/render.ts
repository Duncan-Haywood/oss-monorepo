// Newsletter emails: the double-opt-in confirmation and the welcome / nurture sequence. Built on the
// shared email layout (every value escaped, no tracking pixels, no remote images).
//
// Copy rules (docs/EMAIL_MARKETING.md): plain language, no invented statistics or testimonials, and
// guide titles/descriptions come from the resources library itself (src/client/content/resources)
// rather than being retyped here. Product claims stay within what the site already says.
import { aiDraftsHonest } from "@client/content/resources/ai-drafts-honest";
import { documentsFundersAskFor } from "@client/content/resources/documents-funders-ask-for";
import { funderTypes } from "@client/content/resources/funder-types";
import { grantReporting } from "@client/content/resources/grant-reporting";
import { needStatement } from "@client/content/resources/need-statement";
import { samUeiGrantsGov } from "@client/content/resources/sam-uei-grants-gov";
import type { ResourceArticle } from "@client/content/resources/types";
import type { RenderedEmail } from "../email-templates";
import {
  type Block,
  createTemplateContext,
  type EmailContent,
  PRODUCT_NAME,
  renderContent,
  type TemplateContext,
} from "../email-templates/layout";
import type { NurtureStepKey } from "./sequence";

/** Days a confirmation link stays valid (kept in sync with subscribers.ts). */
export const CONFIRM_LINK_DAYS = 7;

const SITE_PATHS = {
  howItWorks: "/how-it-works",
  trust: "/trust",
  trustAccuracy: "/trust#accuracy",
  demo: "/demo",
  resources: "/resources",
} as const;

const guidePath = (a: ResourceArticle) => `${SITE_PATHS.resources}/${encodeURIComponent(a.slug)}`;

const guideList = (t: TemplateContext, articles: readonly ResourceArticle[]): Block => ({
  type: "list",
  items: articles.map((a) => ({ text: a.title, detail: a.description, url: t.url(guidePath(a)) })),
});

const SOURCES_NOTE =
  "Every guide lists the official sources it relies on. Rules and requirements change, so check the current requirements before you rely on a specific detail.";

export function renderConfirmEmail(appUrl: string, confirmUrl: string): RenderedEmail {
  const t = createTemplateContext(appUrl);
  return renderContent(
    {
      subject: `Confirm your ${PRODUCT_NAME} guide emails`,
      preheader: "One click to confirm. Nothing is sent until you do.",
      heading: "Please confirm your subscription",
      blocks: [
        {
          type: "paragraph",
          text: `Someone, hopefully you, asked to receive grant guide emails from ${PRODUCT_NAME} at this address. Confirm below and we'll add you to the list.`,
        },
        { type: "button", label: "Confirm my subscription", url: confirmUrl, showUrl: true },
        {
          type: "note",
          text: `This link expires in ${CONFIRM_LINK_DAYS} days. If you didn't ask for this, ignore this email: you won't be added and you won't hear from us again.`,
        },
      ],
      footer: {
        reason: `You're receiving this one-time email because this address was entered in the guide signup form on ${t.appUrl || "our website"}.`,
      },
    },
    t,
  );
}

export interface SequenceEmailLinks {
  /** Unsubscribe page (footer link). */
  unsubscribeUrl: string;
  postalAddress: string;
}

type StepContent = Omit<EmailContent, "footer">;

const STEP_CONTENT: Record<NurtureStepKey, (t: TemplateContext) => StepContent> = {
  welcome: (t) => ({
    subject: `Welcome to ${PRODUCT_NAME} grant guides`,
    preheader: "Two guides to start with: the documents funders ask for, and federal registration.",
    heading: "Thanks for confirming",
    blocks: [
      {
        type: "paragraph",
        text: "Over the next two weeks we'll send you three short emails, each pointing to a guide from our resources library. After that, you'll only hear from us when we publish a new guide.",
      },
      {
        type: "paragraph",
        text: "Two good places to start, especially if you're preparing your first applications:",
      },
      guideList(t, [documentsFundersAskFor, samUeiGrantsGov]),
      { type: "note", text: SOURCES_NOTE },
      { type: "link", label: "Browse all guides", url: t.url(SITE_PATHS.resources) },
    ],
  }),
  "getting-ready": (t) => ({
    subject: "Where grants come from, and how to explain your need",
    preheader:
      "Federal, state, foundation and corporate grants, and need statements funders trust.",
    heading: "Know the funder, then make the case",
    blocks: [
      {
        type: "paragraph",
        text: "Different kinds of funders expect different things, and the need statement is where most proposals win or lose a reviewer's trust. These two guides cover both:",
      },
      guideList(t, [funderTypes, needStatement]),
      { type: "note", text: SOURCES_NOTE },
    ],
  }),
  writing: (t) => ({
    subject: "After the award, and using AI honestly",
    preheader: "What grant reporting involves, and where AI drafting helps or hurts.",
    heading: "Plan for reporting, and keep drafts honest",
    blocks: [
      {
        type: "paragraph",
        text: "Winning a grant starts a reporting relationship, and AI writing tools make it easy to say more than your records support. These guides cover both:",
      },
      guideList(t, [grantReporting, aiDraftsHonest]),
      {
        type: "paragraph",
        text: `How ${PRODUCT_NAME} handles accuracy: every factual claim in a draft cites a fact from your own records, and anything it can't verify is flagged for your team.`,
      },
      { type: "link", label: "How we keep drafts accurate", url: t.url(SITE_PATHS.trustAccuracy) },
    ],
  }),
  "how-it-works": (t) => ({
    subject: `How ${PRODUCT_NAME} works (last email in this series)`,
    preheader: "From your own records to a checked draft, with your team approving every step.",
    heading: `If you'd like help with the writing`,
    blocks: [
      {
        type: "paragraph",
        text: `${PRODUCT_NAME} builds a fact base from your records, finds grants that fit and drafts applications where every fact cites its source. Anything it can't verify is flagged, and your team approves before anything is sent.`,
      },
      {
        type: "list",
        items: [
          { text: "How it works", url: t.url(SITE_PATHS.howItWorks) },
          {
            text: "Try the demo",
            detail: "an imagined charity, no sign-up, nothing saved",
            url: t.url(SITE_PATHS.demo),
          },
          { text: "Security, privacy and accuracy", url: t.url(SITE_PATHS.trust) },
        ],
      },
      {
        type: "paragraph",
        text: "This is the last email in the welcome series. From here on we'll only write when there's a new guide.",
      },
    ],
  }),
};

export function renderSequenceEmail(
  step: NurtureStepKey,
  appUrl: string,
  links: SequenceEmailLinks,
): RenderedEmail {
  const t = createTemplateContext(appUrl);
  const content = STEP_CONTENT[step](t);
  return renderContent(
    {
      ...content,
      signoff: ["The Grant Autopilot team"],
      footer: {
        reason: `You're receiving this because you signed up for grant guide emails on ${t.appUrl || "our website"} and confirmed your address.`,
        unsubscribeUrl: links.unsubscribeUrl,
        postalAddress: links.postalAddress,
      },
    },
    t,
  );
}
