// Message rendering: Slack Block Kit and Teams Adaptive Cards. Pure functions.
// Content rule: a message is built only from the event kind's fixed label and summary, a title
// (application / opportunity name), numeric counts and a link into the app. Document text, fact
// statements, draft paragraphs and notify() bodies never reach a chat message.
import {
  INTEGRATION_EVENT_LABELS,
  INTEGRATION_EVENT_SUMMARIES,
  type IntegrationEventKind,
} from "@shared/integrations";
import { isSafeAppLink } from "@shared/notifications";

/** "test" is the fixed message sent by the settings page's Test button. */
export type RenderableKind = IntegrationEventKind | "test";

const LABELS: Record<RenderableKind, string> = {
  ...INTEGRATION_EVENT_LABELS,
  test: "Grant Autopilot is connected",
};
const SUMMARIES: Record<RenderableKind, string> = {
  ...INTEGRATION_EVENT_SUMMARIES,
  test: "This channel will get the notifications your admins picked.",
};

export interface RenderableEvent {
  kind: RenderableKind;
  title: string;
  /** App-relative path ("/orgs/…"). */
  link: string;
  counts?: { label: string; value: number }[];
}

export const MAX_TITLE_CHARS = 150;
export const MAX_COUNTS = 8;
export const APPROVAL_NOTE =
  "Approvals and edits happen in Grant Autopilot, where every decision is recorded.";

/**
 * Plain, single-line, bounded text: control characters and newlines collapse to spaces, and
 * "scheme://" is broken up so a title cannot become a clickable link in the chat client.
 */
export function cleanText(input: string, max = MAX_TITLE_CHARS): string {
  let s = "";
  for (const ch of input.normalize("NFKC")) {
    const code = ch.codePointAt(0) ?? 0;
    s += code < 0x20 || code === 0x7f || (code >= 0x200b && code <= 0x200f) ? " " : ch;
  }
  s = s
    .replace(/\s+/g, " ")
    .trim()
    .replace(/([a-z][a-z0-9+.-]*):\/\//gi, "$1:/ /");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Slack mrkdwn escaping (&, <, >): also neutralizes <!channel>, <@U…> and <url|text> links. */
export function escapeSlack(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Adaptive Card TextBlock markdown: drop the characters that start links/emphasis/headings. */
export function escapeTeams(s: string): string {
  return s.replace(/[[\]()*_`#~<>|\\]/g, (c) =>
    c === "[" || c === "(" ? "‹" : c === "]" || c === ")" ? "›" : " ",
  );
}

export function absoluteLink(appUrl: string, link: string): string {
  const base = appUrl.replace(/\/+$/, "");
  const path = isSafeAppLink(link) ? link : "/";
  return `${base}${path}`;
}

function normalized(e: RenderableEvent) {
  return {
    label: LABELS[e.kind],
    summary: SUMMARIES[e.kind],
    title: cleanText(e.title || LABELS[e.kind]),
    counts: (e.counts ?? [])
      .slice(0, MAX_COUNTS)
      .filter((c) => Number.isFinite(c.value))
      .map((c) => ({ label: cleanText(c.label, 40), value: Math.max(0, Math.trunc(c.value)) })),
  };
}

export interface SlackMessage {
  text: string;
  blocks: Record<string, unknown>[];
}

export function renderSlackMessage(e: RenderableEvent, appUrl: string): SlackMessage {
  const n = normalized(e);
  const url = absoluteLink(appUrl, e.link);
  const blocks: Record<string, unknown>[] = [
    { type: "header", text: { type: "plain_text", text: n.label, emoji: false } },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${escapeSlack(n.title)}*\n${escapeSlack(n.summary)}` },
    },
  ];
  if (n.counts.length) {
    blocks.push({
      type: "section",
      fields: n.counts.map((c) => ({
        type: "mrkdwn",
        text: `*${escapeSlack(c.label)}*\n${c.value}`,
      })),
    });
  }
  blocks.push(
    {
      type: "section",
      text: { type: "mrkdwn", text: `<${url}|Open in Grant Autopilot>` },
    },
    { type: "context", elements: [{ type: "mrkdwn", text: escapeSlack(APPROVAL_NOTE) }] },
  );
  return { text: escapeSlack(`${n.label}: ${n.title}`), blocks };
}

export interface TeamsMessage {
  type: "message";
  attachments: {
    contentType: "application/vnd.microsoft.card.adaptive";
    contentUrl: null;
    content: Record<string, unknown>;
  }[];
}

export function renderTeamsMessage(e: RenderableEvent, appUrl: string): TeamsMessage {
  const n = normalized(e);
  const body: Record<string, unknown>[] = [
    { type: "TextBlock", text: escapeTeams(n.label), weight: "Bolder", size: "Medium", wrap: true },
    { type: "TextBlock", text: escapeTeams(n.title), wrap: true },
    { type: "TextBlock", text: escapeTeams(n.summary), wrap: true, isSubtle: true },
  ];
  if (n.counts.length) {
    body.push({
      type: "FactSet",
      facts: n.counts.map((c) => ({ title: escapeTeams(c.label), value: String(c.value) })),
    });
  }
  body.push({
    type: "TextBlock",
    text: escapeTeams(APPROVAL_NOTE),
    wrap: true,
    size: "Small",
    isSubtle: true,
  });
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body,
          actions: [
            {
              type: "Action.OpenUrl",
              title: "Open in Grant Autopilot",
              url: absoluteLink(appUrl, e.link),
            },
          ],
        },
      },
    ],
  };
}

export function renderMessage(
  provider: "slack" | "teams",
  e: RenderableEvent,
  appUrl: string,
): SlackMessage | TeamsMessage {
  return provider === "slack" ? renderSlackMessage(e, appUrl) : renderTeamsMessage(e, appUrl);
}
