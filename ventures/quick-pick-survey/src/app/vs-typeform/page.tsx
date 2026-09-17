import Link from "next/link";
import type { Metadata } from "next";

/**
 * Comparison / "alternative" landing page, the same shape dozens of other
 * ventures in this monorepo use to catch "typeform alternative" and
 * "typeform vs" searches: an honest, sourced comparison against one
 * well-known paid competitor, with a disclaimer and a not-affiliated
 * statement.
 *
 * The root layout sets `robots: { index: false, follow: false }` for the
 * whole app, because the app itself shows one person's private preference
 * data. That reasoning does not apply to this page — it is public marketing
 * copy with nothing personal on it — so the export below overrides `robots`
 * back to indexable. Next.js metadata fields replace rather than merge
 * across segments, so this is enough on its own.
 *
 * The FAQ copy lives in one place (`FAQS` below) and is rendered into both
 * the visible <h3>/<p> pairs and the FAQPage JSON-LD from the same strings,
 * on purpose: a mismatch between the two is a real regression class in this
 * repo (see PR #2872) and sharing the source string is what makes it
 * impossible to reintroduce by accident.
 */

const TYPEFORM_ANSWER =
  "They do different jobs. Typeform, founded in 2012 by David Okuniev and " +
  "Robert Muñoz and headquartered in Barcelona, Spain, is a general-" +
  "purpose form and survey builder: you design each question yourself in a " +
  "visual editor — multiple choice, rating scales, open text, file " +
  "uploads, payment collection — add branching logic by hand, and " +
  "publish the result as a hosted form or embed, under an ongoing " +
  "subscription account with a free plan capped at a small number of " +
  "responses per month. Typeform's own pricing page is not reachable from " +
  "this session to confirm today's exact plan names or dollar figures, so " +
  "no price for it is invented here — only its well-documented " +
  "identity and category are stated, and no dollar amount for Typeform " +
  "appears on this page. Quick Pick does one narrower thing, and does not " +
  "let you write a single question: it shows two options at a time and " +
  "infers your preference ordering from which you pick — Glicko-2, the " +
  "same rating system chess.com ranks players with, for discrete items, and " +
  "a Davidson tie-extended Bradley-Terry model for continuous trade-offs " +
  "like income versus free time — choosing each next pair adaptively " +
  "from what it is least sure of, with a real confidence interval on every " +
  "result. It needs no account to start, runs a free hosted session, and " +
  "has no form builder, no branching logic, no file uploads, and no payment " +
  "collection at all. Someone who needs to design and publish their own " +
  "custom form — a signup form, a lead form, an NPS survey — is " +
  "better served by Typeform or a comparable form builder; someone who " +
  "wants their own (or a partner's) real preference ordering without " +
  "writing any questions is in the right place here.";

const AFFILIATION_ANSWER =
  "No. This site is not affiliated with, endorsed by, or sponsored by " +
  "Typeform S.L. Typeform is a trademark of its owner, named here only to " +
  "describe what this app is and is not.";

const FAQS = [
  { question: "Should I use Quick Pick or Typeform?", answer: TYPEFORM_ANSWER },
  { question: "Is this page affiliated with Typeform?", answer: AFFILIATION_ANSWER },
] as const;

const TITLE = "Quick Pick vs. Typeform";
const DESCRIPTION =
  "Typeform is a general-purpose form and survey builder sold as an ongoing " +
  "subscription account: you design each question yourself. Quick Pick is a " +
  "free, no-account pairwise-comparison engine — you pick between two " +
  "options and it infers your real preference ordering, with Glicko-2 and a " +
  "Davidson tie-extended Bradley-Terry model, no question-writing required. " +
  "Not affiliated with Typeform.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  alternates: { canonical: "/vs-typeform" },
  openGraph: {
    type: "website",
    title: TITLE,
    description: DESCRIPTION,
    url: "/vs-typeform",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map(({ question, answer }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: { "@type": "Answer", text: answer },
  })),
};

export default function VsTypeformPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 py-8 text-sm leading-relaxed">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <p>
        <Link href="/" className="text-amber-700 underline underline-offset-2 dark:text-amber-400">
          &larr; Quick Pick
        </Link>
      </p>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Quick Pick vs. Typeform</h1>
        <p className="text-base text-neutral-600 dark:text-neutral-400">
          Two different shapes: Typeform is a form builder you design questions in, sold under an
          ongoing subscription account. Quick Pick is a free, no-account engine that asks nothing you
          have to write &mdash; it just shows you two options and works out what you actually want from
          which one you pick.
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-lg font-bold">What each tool is for</h2>
        <p>
          <strong>Typeform</strong> is a general-purpose form and survey builder, founded in 2012 by
          David Okuniev and Robert Mu&ntilde;oz and headquartered in Barcelona, Spain. You design each
          question yourself in a visual editor &mdash; multiple choice, rating scales, open text, file
          uploads, payment collection &mdash; wire up branching logic by hand, and publish the result as
          a hosted form or an embed. It is account-based and sold as an ongoing subscription, with a
          free plan capped at a small number of responses per month. Typeform&apos;s own pricing page is
          not reachable from this session to confirm today&apos;s exact plan names or dollar figures, so
          no price for it is invented here: only its well-documented identity and category are stated,
          and no dollar amount for Typeform appears on this page.
        </p>
        <p>
          <strong>Quick Pick</strong> does not let you write a single question. It shows two options at
          a time and infers your preference ordering from which you pick &mdash; Glicko-2, the rating
          system chess.com ranks players with, for discrete items like activities or professions, and a
          Davidson tie-extended Bradley-Terry model for continuous trade-offs like income versus free
          time. Question selection adapts to what the model is least sure about, and every result comes
          with a real confidence interval instead of a false certainty. You can start answering with no
          account, and two linked people can compare what they each want against what they guessed the
          other wanted. It has no form builder, no branching logic, no file uploads, and no payment
          collection.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                <th scope="col" className="border-b border-neutral-200 py-2 pr-3 dark:border-neutral-800">
                  Question
                </th>
                <th scope="col" className="border-b border-neutral-200 py-2 dark:border-neutral-800">
                  Where to answer it
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-b border-neutral-200 py-2 pr-3 align-top dark:border-neutral-800">
                  I want to design and publish my own form or survey &mdash; a signup form, a lead form,
                  an NPS survey, a quiz &mdash; with a visual builder and custom logic.
                </td>
                <td className="border-b border-neutral-200 py-2 align-top dark:border-neutral-800">
                  Typeform, or a comparable form builder.
                </td>
              </tr>
              <tr>
                <td className="border-b border-neutral-200 py-2 pr-3 align-top dark:border-neutral-800">
                  I want to find out my own (or my partner&apos;s) real preference ordering without
                  writing any questions myself.
                </td>
                <td className="border-b border-neutral-200 py-2 align-top dark:border-neutral-800">
                  Quick Pick &mdash; free, no account, no question-writing.
                </td>
              </tr>
              <tr>
                <td className="border-b border-neutral-200 py-2 pr-3 align-top dark:border-neutral-800">
                  I want an adaptive paired-comparison survey with a statistical confidence interval on
                  every result, without building the scoring myself.
                </td>
                <td className="border-b border-neutral-200 py-2 align-top dark:border-neutral-800">
                  Quick Pick &mdash; that is Glicko-2 and Bradley-Terry running under the hood. Building
                  the same in Typeform means authoring every pairwise question and scoring it yourself.
                </td>
              </tr>
              <tr>
                <td className="border-b border-neutral-200 py-2 pr-3 align-top dark:border-neutral-800">
                  I want to compare what my partner wants for themselves against what I think they want.
                </td>
                <td className="border-b border-neutral-200 py-2 align-top dark:border-neutral-800">
                  Quick Pick&apos;s linked-couple perspectives &mdash; Typeform has no such concept.
                </td>
              </tr>
              <tr>
                <td className="border-b border-neutral-200 py-2 pr-3 align-top dark:border-neutral-800">
                  I need branching logic, file uploads, payment collection, or a form my whole team edits.
                </td>
                <td className="border-b border-neutral-200 py-2 align-top dark:border-neutral-800">
                  Typeform, or a comparable form builder &mdash; entirely outside what Quick Pick does.
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-3 align-top">Do I need an account to try it?</td>
                <td className="py-2 align-top">
                  Quick Pick: no, start immediately. Typeform: forms are built and hosted from an
                  account.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p>
          Most people get different value from each: Typeform (or a comparable form builder) for
          designing and publishing a custom form under an ongoing account, and Quick Pick for an
          instant, no-login answer to what you (or a linked partner) actually prefer, with nothing to
          design. This page&apos;s own figures are a description of what each product does, not a live
          benchmark of either.
        </p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Quick Pick needs no account to start a session: picks are stored against that session so one
          person&apos;s answers can never move another&apos;s ranking. See the{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            privacy policy
          </Link>{" "}
          for exactly what is stored.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Common questions</h2>
        {FAQS.map(({ question, answer }) => (
          <div key={question}>
            <h3 className="text-base font-semibold">{question}</h3>
            <p>{answer}</p>
          </div>
        ))}
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Open{" "}
          <Link href="/app" className="underline underline-offset-2">
            Quick Pick
          </Link>{" "}
          to try it, or read the{" "}
          <Link href="/" className="underline underline-offset-2">
            how it works
          </Link>{" "}
          section on the home page.
        </p>
      </section>

      <footer className="flex flex-col gap-3 border-t border-neutral-200 pt-4 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        <p>
          <strong>No warranty.</strong> Quick Pick is provided free and as-is, without warranty of any
          kind, express or implied. It is not relationship counselling, therapy, psychological
          assessment, or financial advice, and a ranking it produces is not a diagnosis or a
          compatibility verdict. You are responsible for how you use its output. To the maximum extent
          permitted by law, the authors accept no liability for any loss or damage arising from its use.
        </p>
        <p>
          <strong>Best-effort hosting, no SLA.</strong> This is a free, experimental app and may be
          slow, broken, moved, or taken offline without notice.
        </p>
        <p>
          This page makes no live comparison against Typeform &mdash; it is a static description of
          publicly documented facts, and no dollar figure for Typeform appears on it.
        </p>
      </footer>
    </main>
  );
}
