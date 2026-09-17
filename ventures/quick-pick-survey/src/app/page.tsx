import Link from "next/link";

/**
 * Public landing page. The pitch leads with the problem (you can't
 * articulate what you actually want) rather than the mechanism (pairwise
 * comparison + Glicko-2), because nobody wants a rating system — they want
 * to know themselves.
 */
export default function LandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-10 px-6 py-10">
      <section className="flex flex-col items-center gap-4 text-center">
        <div className="text-5xl">💛</div>
        <h1 className="text-4xl font-bold leading-tight tracking-tight">
          Find out what you
          <br />
          actually want
        </h1>
        <p className="text-base leading-relaxed text-neutral-600 dark:text-neutral-400">
          Ask someone what they want in a partner and you get a list of adjectives. Make them choose
          between two real options, forty times, and you get the truth.
        </p>
        <Link
          href="/app"
          className="mt-2 w-full rounded-2xl bg-amber-500 px-6 py-4 text-lg font-bold text-neutral-950 shadow-sm transition active:scale-[0.98]"
        >
          Start — it takes 30 seconds
        </Link>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">No account needed to try it.</p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-center text-sm font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          How it works
        </h2>
        <Step
          n="1"
          title="Pick between two"
          body="One card against another. Swipe up or down. No sliders, no essays, no 1-to-10 scales you'd use inconsistently anyway."
        />
        <Step
          n="2"
          title="It learns as you go"
          body="Every choice narrows it down. The questions adapt to whatever it's least sure about, so nothing is wasted."
        />
        <Step
          n="3"
          title="Insights unlock"
          body="Every 10 picks levels you up and opens something new — your top choices, what you value, what you're still torn on."
        />
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border-2 border-amber-300/60 bg-amber-50 p-5 dark:border-amber-400/30 dark:bg-amber-950/30">
        <h2 className="text-lg font-bold text-amber-900 dark:text-amber-200">Better with two 💞</h2>
        <p className="text-sm leading-relaxed text-amber-900/90 dark:text-amber-200/90">
          You each answer on your own, then compare. Not just where you agree — the interesting part
          is <strong>where you were wrong about each other</strong>. Guess what your partner wants,
          then find out.
        </p>
        <Link
          href="/couple"
          className="self-start rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-neutral-950"
        >
          Link with your partner
        </Link>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-center text-sm font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          What you&apos;ll find out
        </h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Tile>Whether you value warmth or ambition more</Tile>
          <Tile>What an extra hour a week is worth to you in money</Tile>
          <Tile>Which matters more: who they are, or what they have</Tile>
          <Tile>Where you&apos;re still genuinely undecided</Tile>
        </div>
      </section>

      <section className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Built on the same rating maths chess uses to rank players — so every result comes with an
          honest confidence interval instead of false certainty.
        </p>
        <Link
          href="/app"
          className="w-full rounded-2xl bg-amber-500 px-6 py-4 text-lg font-bold text-neutral-950 shadow-sm transition active:scale-[0.98]"
        >
          Try it
        </Link>
        <p className="flex gap-3 text-xs text-neutral-500 dark:text-neutral-400">
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy
          </Link>
          <Link href="/terms" className="underline underline-offset-2">
            Terms
          </Link>
          <Link href="/vs-typeform" className="underline underline-offset-2">
            vs. Typeform
          </Link>
        </p>
      </section>
    </main>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-neutral-950">
        {n}
      </span>
      <div>
        <h3 className="text-sm font-bold">{title}</h3>
        <p className="mt-0.5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{body}</p>
      </div>
    </div>
  );
}

function Tile({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
      {children}
    </div>
  );
}
