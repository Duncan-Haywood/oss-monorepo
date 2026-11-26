// Public page: security & privacy. Summarizes docs/legal/privacy.md and data-use.md and the
// anti-fabrication / tenancy rules in docs/ARCHITECTURE.md. Keep in sync with those documents.
import { MarketingFooter } from "@client/components/marketing/footer";
import { useDocumentMeta } from "@client/components/marketing/meta";
import {
  CheckList,
  FeatureCard,
  GetStartedActions,
  OnThisPage,
  PageHero,
  PageSection,
} from "@client/components/marketing/page";
import { PolicyLink } from "@client/components/marketing/site-link";
import { MARKETING_PATHS } from "@client/components/marketing/site-map";
import { Trust } from "@client/components/marketing/trust";
import { Table, Td, Th } from "@client/components/ui";
import { LEGAL_DOC_KEYS, LEGAL_DOC_TITLES } from "@shared/legal";
import {
  Building2,
  Download,
  EyeOff,
  FileClock,
  KeyRound,
  Lock,
  ScrollText,
  ToggleRight,
  Trash2,
  UserCheck,
} from "lucide-react";

const SUBPROCESSORS: { name: string; purpose: string }[] = [
  {
    name: "Cloudflare, Inc.",
    purpose:
      "Hosting, database, file storage, search index, and AI models for document conversion, search embeddings and speech-to-text",
  },
  {
    name: "Anthropic, PBC",
    purpose:
      "The Claude language model for drafting, checking, interviews and fact extraction, through Anthropic's commercial API, which does not use the data it receives to train its models",
  },
  {
    name: "Email delivery provider",
    purpose:
      "Account and notification emails, and application emails when you choose email submission",
  },
  {
    name: "Merchant-of-record payment processor",
    purpose: "Checkout, payments, invoicing and sales tax",
  },
];

export function TrustPage() {
  useDocumentMeta({
    title: "Security & privacy",
    description:
      "How Grant Autopilot uses AI, keeps every organization's data separate, encrypts it, and lets you export or permanently delete it. Your data is never used to train AI models.",
    canonicalPath: MARKETING_PATHS.trust,
  });

  return (
    <>
      <PageHero
        eyebrow="Security & privacy"
        title="Your records are safe with us, and they stay yours"
        actions={
          <GetStartedActions
            secondary={{ to: MARKETING_PATHS.howItWorks, label: "See how it works" }}
          />
        }
      >
        <p>
          You're trusting us with your organization's history and, often, sensitive details about
          the people you serve. Here's exactly how we use your data, how we protect it, and the
          controls your team has.
        </p>
      </PageHero>

      <OnThisPage
        items={[
          { href: "#ai", label: "How we use AI" },
          { href: "#accuracy", label: "Accuracy" },
          { href: "#protection", label: "Protection" },
          { href: "#your-data", label: "Export and deletion" },
          { href: "#records", label: "Audit log and consent" },
          { href: "#subprocessors", label: "Subprocessors" },
          { href: "#policies", label: "Policies" },
        ]}
      />

      <PageSection
        id="ai"
        eyebrow="AI"
        title="How we use AI"
        intro={
          <p>
            Grant Autopilot uses Claude, a large language model made by Anthropic, through
            Anthropic's commercial API. Under that API, the data we send is not used to train
            Anthropic's models.
          </p>
        }
      >
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">What the AI does</h3>
            <CheckList
              className="mt-4"
              items={[
                "Suggests facts from your documents and interview answers, each with the quote it came from, for your team to confirm.",
                "Asks interview questions and follow-ups.",
                "Reads a funder's requirements and estimates how well an opportunity fits.",
                "Drafts application sections from your facts.",
                "Checks the draft in a separate step, claim by claim, against the facts it cites.",
              ]}
            />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">What it never does</h3>
            <CheckList
              className="mt-4"
              items={[
                "Learn from your data. Your documents, interviews and drafts are never used to train AI models, ours or anyone else's.",
                "See facts you've marked restricted. Those are never sent to the AI when writing applications.",
                "Decide on its own to send an application. A person approves, unless your organization turns on autopilot for small requests and sets its limits.",
                "Share what it learns about you with another organization, or use your past proposals as examples for anyone else.",
              ]}
            />
          </div>
        </div>
        <p className="mt-8 max-w-3xl text-neutral-600">
          AI can be wrong. That's why drafts are tied to your own facts, every claim is checked, and
          a person on your team reviews what goes out. Converting documents to text, search and
          speech-to-text run on AI models hosted by Cloudflare, our hosting provider.
        </p>
      </PageSection>

      <Trust />

      <PageSection
        id="protection"
        tone="muted"
        eyebrow="Protection"
        title="How your data is protected"
        intro={
          <p>
            Grant Autopilot is built for many organizations at once, so keeping each one's data
            separate is part of the foundation, not an add-on.
          </p>
        }
      >
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <FeatureCard icon={Building2} title="Each organization kept separate">
            <p>
              Every record, file and search entry belongs to exactly one organization, and every
              request is checked against your membership. Your files and search index are stored
              separately from everyone else's.
            </p>
          </FeatureCard>
          <FeatureCard icon={Lock} title="Encrypted in transit and at rest">
            <p>
              Connections use HTTPS, and stored data is encrypted by our hosting provider. Passwords
              are kept only as secure hashes.
            </p>
          </FeatureCard>
          <FeatureCard icon={UserCheck} title="Roles for your team">
            <p>
              Owners and admins decide who can upload, edit, review, approve or only view, and
              control settings, billing and deletion.
            </p>
          </FeatureCard>
          <FeatureCard icon={KeyRound} title="Limited staff access">
            <p>
              Our staff look at your data only when you ask us for support, or when needed to keep
              the service secure or comply with the law, and only as much as needed.
            </p>
          </FeatureCard>
          <FeatureCard icon={EyeOff} title="Nothing sensitive in logs">
            <p>
              Document contents are kept out of application logs and background job messages. We
              store a one-way hash of IP addresses, never the address itself.
            </p>
          </FeatureCard>
          <FeatureCard icon={ScrollText} title="Never sold, never advertised">
            <p>We never sell your data or use it for advertising.</p>
          </FeatureCard>
        </ul>
        <p className="mt-8 max-w-3xl text-sm text-neutral-600">
          No system is perfectly secure. If a security incident affects your data, we'll notify you
          as the law requires.
        </p>
      </PageSection>

      <PageSection
        id="your-data"
        eyebrow="Your data"
        title="Export and real deletion"
        intro={<p>You can take your data with you or remove it completely, at any time.</p>}
      >
        <ul className="grid gap-4 md:grid-cols-2">
          <FeatureCard icon={Download} title="Export everything">
            <p>
              Owners and admins can download a complete export at any time: your data as JSON plus
              your original files. Export files are deleted from our side 7 days after they're
              created.
            </p>
          </FeatureCard>
          <FeatureCard icon={Trash2} title="Deletion means deletion">
            <p>
              Delete a document and its extracted text, search entries and facts go with it. Delete
              your organization and we remove its files, search entries and all of its database
              records, including the audit log.
            </p>
            <p>
              We keep only a minimal record that a deletion happened, plus billing records the law
              or our payment provider requires. Provider backups and logs roll off on their normal
              schedules.
            </p>
          </FeatureCard>
        </ul>
        <p className="mt-6 max-w-3xl text-sm text-neutral-600">
          You can also set a retention period for original files. After processing and that period,
          the originals are deleted and only the extracted text is kept.
        </p>
      </PageSection>

      <PageSection
        id="records"
        tone="muted"
        eyebrow="Accountability"
        title="An audit log, and consent for every optional feature"
      >
        <ul className="grid gap-4 md:grid-cols-2">
          <FeatureCard icon={FileClock} title="Audit log">
            <p>
              Consequential actions, such as uploads, approvals, submissions, exports and deletions,
              are written to an append-only audit log that your admins can review.
            </p>
            <p>
              Every submission also keeps the exact package that was sent, with a fingerprint
              showing it hasn't changed since.
            </p>
          </FeatureCard>
          <FeatureCard icon={ToggleRight} title="Off until you turn it on">
            <p>
              Crawling your own website, keeping voice recordings (we otherwise keep only the
              transcript) and autopilot submission all stay off until an owner or admin turns them
              on. Turning one off stops future use.
            </p>
            <p>
              Each choice is recorded with the policy version, the time and a hashed IP address.
            </p>
          </FeatureCard>
        </ul>
      </PageSection>

      <PageSection
        id="subprocessors"
        eyebrow="Subprocessors"
        title="Who processes data for us"
        intro={
          <p>
            We share data only with these service providers, and only so they can run the service
            for you. We'll update this list before adding a new one.
          </p>
        }
      >
        <Table>
          <caption className="sr-only">Subprocessors and what they do</caption>
          <thead>
            <tr>
              <Th>Subprocessor</Th>
              <Th>Purpose</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {SUBPROCESSORS.map((s) => (
              <tr key={s.name}>
                <th
                  scope="row"
                  className="whitespace-nowrap px-4 py-3 text-left align-top font-medium text-neutral-900"
                >
                  {s.name}
                </th>
                <Td className="min-w-64">{s.purpose}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </PageSection>

      <PageSection
        id="policies"
        tone="muted"
        eyebrow="In writing"
        title="Read the policies"
        intro={
          <p>Our policies are written in plain language. These are the documents that count.</p>
        }
      >
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LEGAL_DOC_KEYS.map((doc) => (
            <li key={doc}>
              <PolicyLink
                doc={doc}
                className="flex h-full items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-4 font-medium text-neutral-900 shadow-card hover:border-brand-300 hover:text-brand-800"
              >
                {LEGAL_DOC_TITLES[doc]}
                <ScrollText className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
              </PolicyLink>
            </li>
          ))}
        </ul>
      </PageSection>

      <MarketingFooter />
    </>
  );
}
