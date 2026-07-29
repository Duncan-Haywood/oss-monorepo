import Link from "next/link";

/**
 * Public landing page. The pitch leads with the problem (you can't
 * articulate what you actually want) rather than the mechanism (pairwise
 * comparison + Glicko-2), because nobody wants a rating system — they want
 * to know themselves.
 */
export default function LandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-9 px-5 py-8 sm:px-6 sm:py-10">
      <section className="flex flex-col items-center gap-4 text-center">
        <div className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          <span aria-hidden="true">💛</span> Pairwise
        </div>
        <h1 className="text-4xl font-bold leading-[1.08] tracking-tight">
          Discover what you value
          <br />
          one choice at a time
        </h1>
        <p className="text-base leading-relaxed text-neutral-600 dark:text-neutral-400">
          Choose between two cards using your first impression. Your choices build a personal
          ranking of the traits, values, lifestyles, and relationship qualities that matter to you.
        </p>
        <Link
          href="/app"
          className="mt-2 w-full rounded-2xl bg-amber-500 px-6 py-4 text-lg font-bold text-neutral-950 shadow-sm transition active:scale-[0.98]"
        >
          Start choosing
        </Link>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          No account needed · pause whenever you want · early insights appear as the evidence builds
        </p>
      </section>

      <section className="flex flex-col gap-4 rounded-3xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-lg font-bold">What you’ll do</h2>
        <Step
          n="1"
          title="Choose your focus"
          body="Explore the partner you would choose, or the person you want to become. Each mode keeps its own ranking."
        />
        <Step
          n="2"
          title="React to each pair"
          body="Tap a card or use the labeled buttons. Skip if neither choice gives a useful signal."
        />
        <Step
          n="3"
          title="See the pattern emerge"
          body="Your ranking, strongest themes, lower-priority qualities, and uncertain areas become clearer as you answer."
        />
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border-2 border-amber-300/60 bg-amber-50 p-5 dark:border-amber-400/30 dark:bg-amber-950/30">
        <h2 className="text-lg font-bold text-amber-900 dark:text-amber-200">Compare as a couple</h2>
        <p className="text-sm leading-relaxed text-amber-900/90 dark:text-amber-200/90">
          You each build your own ranking, then compare shared priorities and differences. Individual
          answers stay private; your partner sees aggregate comparisons rather than each individual choice.
        </p>
        <Link
          href="/couple"
          className="self-start rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-neutral-950"
        >
          See the couple view
        </Link>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-center text-sm font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          What the results can show
        </h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Tile><strong>Your priorities</strong><br />Traits and values that consistently rise to the top.</Tile>
          <Tile><strong>Your pattern</strong><br />The kind of person or life you repeatedly lean toward.</Tile>
          <Tile><strong>Your trade-offs</strong><br />What tends to win when two good qualities conflict.</Tile>
          <Tile><strong>Your uncertainty</strong><br />Choices that need more evidence before the order is clear.</Tile>
        </div>
      </section>

      <section className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Results show uncertainty as well as rank. Early findings are labeled as early, and they
          sharpen as you make more choices.
        </p>
        <Link
          href="/app"
          className="w-full rounded-2xl bg-amber-500 px-6 py-4 text-lg font-bold text-neutral-950 shadow-sm transition active:scale-[0.98]"
        >
          Start choosing
        </Link>
        <p className="flex gap-3 text-xs text-neutral-500 dark:text-neutral-400">
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy
          </Link>
          <Link href="/terms" className="underline underline-offset-2">
            Terms
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
    <div className="rounded-xl border border-neutral-200 bg-white p-3 leading-relaxed text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
      {children}
    </div>
  );
}
