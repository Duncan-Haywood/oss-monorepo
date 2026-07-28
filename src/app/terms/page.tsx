import Link from "next/link";

export const metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-5 py-8 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold">Terms of use</h1>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">Last updated: 28 July 2026</p>

      <p>Short version: use it freely, it&apos;s for fun and self-reflection, don&apos;t rely on it for anything important.</p>

      <H>What this is</H>
      <p>
        A tool that learns your preferences by asking you to choose between two options repeatedly.
        It produces rankings and statistical estimates about your own stated preferences.
      </p>

      <H>What this isn&apos;t</H>
      <p>
        It is not relationship counselling, therapy, psychological assessment, or financial advice.
        The outputs describe patterns in the choices you made — nothing more. They are not a
        diagnosis, not a compatibility verdict, and not a prediction about any real relationship.
        Please don&apos;t make consequential decisions about your life or your relationship on the
        strength of a ranking produced by a swiping game.
      </p>

      <H>Accuracy</H>
      <p>
        Every ranking is an estimate with real uncertainty, which the app shows you as confidence
        intervals. Early results are especially noisy. Where the app can&apos;t say something with
        confidence, it tries to say so rather than guess.
      </p>

      <H>Using it</H>
      <p>
        You may use the app for personal, non-commercial purposes. Please don&apos;t attempt to
        overwhelm it, break into other people&apos;s accounts, or scrape it in bulk. Content you
        enter remains yours; you grant only what is needed to store it and show it back to you (and,
        if you link with a partner, to show the aggregate comparisons described in the{" "}
        <Link href="/privacy" className="underline underline-offset-2">
          privacy policy
        </Link>
        ).
      </p>

      <H>No warranty</H>
      <p>
        This is provided as-is, with no guarantee of availability, accuracy, or fitness for any
        purpose. It is a personal project and may change or disappear without notice.
      </p>

      <H>Contact</H>
      <p>duncan.andrew.haywood@gmail.com</p>

      <Link href="/" className="mt-4 text-amber-700 underline underline-offset-2 dark:text-amber-400">
        ← Back
      </Link>
    </main>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-3 text-base font-semibold">{children}</h2>;
}
