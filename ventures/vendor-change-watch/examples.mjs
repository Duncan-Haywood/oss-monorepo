/**
 * A worked example, so the page is useful on the first visit too.
 *
 * The change it carries is the one practitioners actually chase: a
 * subprocessor quietly added, plus a retention window lengthened, plus a
 * notice period cut — the three edits that matter and that a "last updated"
 * date at the top of a terms page will not tell you about.
 */

export const EXAMPLE_VENDOR = "Acme SaaS";
export const EXAMPLE_URL = "https://acme.example/legal/subprocessors";
export const EXAMPLE_TYPE = "subprocessors";

export const EXAMPLE_BEFORE = `Subprocessors

Acme engages the subprocessors listed below to deliver the Service. We notify
customers at least 30 days before adding a new subprocessor.

Infrastructure

Amazon Web Services, Inc. — hosting and storage — United States, Ireland.
Cloudflare, Inc. — content delivery and DDoS mitigation — global edge network.

Analytics and support

Zendesk, Inc. — customer support ticketing — United States.

Data retention

Customer content is retained for 30 days after account closure and then
deleted from primary storage and backups.`;

export const EXAMPLE_AFTER = `Subprocessors

Acme engages the subprocessors listed below to deliver the Service. We notify
customers at least 10 days before adding a new subprocessor.

Infrastructure

Amazon Web Services, Inc. — hosting and storage — United States, Ireland.
Cloudflare, Inc. — content delivery and DDoS mitigation — global edge network.

Analytics and support

Zendesk, Inc. — customer support ticketing — United States.
Nimbus Model Labs, Inc. — AI features and model inference — United States.

Data retention

Customer content is retained for 180 days after account closure and then
deleted from primary storage and backups.

Onward transfers

Customer content may be processed outside your selected region where required
to deliver AI features.`;
