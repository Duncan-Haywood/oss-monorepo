import Link from "next/link";
import { MarketingDemoWidget } from "@/components/marketing/MarketingDemoWidget";
import { ConvergenceVisualizer } from "@/components/marketing/ConvergenceVisualizer";
import { FaqSection } from "@/components/marketing/FaqSection";

const ArrowIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none">
    <path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const HeartIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
    <path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.4 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SparkIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
    <path d="m12 2 1.2 5.1a5 5 0 0 0 3.7 3.7L22 12l-5.1 1.2a5 5 0 0 0-3.7 3.7L12 22l-1.2-5.1a5 5 0 0 0-3.7-3.7L2 12l5.1-1.2a5 5 0 0 0 3.7-3.7L12 2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  </svg>
);

const ShieldCheckIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function LandingPage() {
  return (
    <main className="overflow-hidden bg-[#faf8f5] text-[#1c1917] antialiased dark:bg-[#0c0a09] dark:text-[#f5f5f4]">
      {/* Navigation Header */}
      <header className="sticky top-0 z-40 w-full border-b border-stone-200/60 bg-[#faf8f5]/80 backdrop-blur-md dark:border-stone-800/60 dark:bg-[#0c0a09]/80">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8 lg:px-10">
          <Link href="/" className="flex items-center gap-2.5 text-xl font-black tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-orange-400 text-stone-950 shadow-[0_4px_16px_rgba(245,158,11,0.35)]">
              <HeartIcon />
            </span>
            Pairwise
          </Link>

          <div className="hidden items-center gap-8 text-sm font-semibold text-stone-700 dark:text-stone-300 md:flex">
            <a href="#how-it-works" className="transition hover:text-amber-800 dark:hover:text-amber-400">How It Works</a>
            <a href="#science" className="transition hover:text-amber-800 dark:hover:text-amber-400">The Science</a>
            <a href="#couples" className="transition hover:text-amber-800 dark:hover:text-amber-400">Couples Mode</a>
            <a href="#pricing" className="transition hover:text-amber-800 dark:hover:text-amber-400">Pricing</a>
            <a href="#faq" className="transition hover:text-amber-800 dark:hover:text-amber-400">FAQ</a>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="rounded-full px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-200/60 dark:text-stone-300 dark:hover:bg-stone-800/60"
            >
              Sign in
            </Link>
            <Link
              href="/app"
              className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-stone-800 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400"
            >
              Start choosing free
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pb-20 pt-12 sm:px-8 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:pb-28 lg:pt-20">
        <div className="relative z-10 max-w-2xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-100 px-3.5 py-1.5 text-xs font-bold text-amber-900 backdrop-blur dark:bg-amber-950/70 dark:text-amber-300">
            <SparkIcon />
            <span>Glicko-2 & Bradley-Terry Preference Engine</span>
          </div>

          <h1 className="text-[3.25rem] font-black leading-[0.94] tracking-tight sm:text-7xl lg:text-[5rem]">
            Hard to explain.
            <span className="mt-2 block bg-gradient-to-r from-amber-700 via-orange-600 to-amber-600 bg-clip-text text-transparent dark:from-amber-400 dark:to-orange-400">
              Easy to choose.
            </span>
          </h1>

          <p className="mt-7 max-w-xl text-lg leading-8 text-stone-700 dark:text-stone-300 sm:text-xl">
            When asked directly about your values, social pressure and ideal self-image skew your answers. Pairwise uses instinctive side-by-side choices to pinpoint what you and your partner actually prioritize.
          </p>

          <div className="mt-9 flex flex-col gap-3.5 sm:flex-row">
            <Link
              href="/app"
              className="group inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-amber-500 px-8 py-4 text-base font-black text-stone-950 shadow-[0_12px_32px_rgba(245,158,11,0.28)] transition-all hover:-translate-y-0.5 hover:bg-amber-400"
            >
              Make your first choice
              <span className="transition-transform group-hover:translate-x-1">
                <ArrowIcon />
              </span>
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-stone-300 bg-white/70 px-7 py-4 text-base font-bold text-stone-900 backdrop-blur transition hover:bg-stone-100 dark:border-stone-800 dark:bg-stone-900/60 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              Explore how it works
            </a>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-stone-600 dark:text-stone-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheckIcon /> No registration required to try
            </span>
            <span aria-hidden="true">•</span>
            <span>Pause & resume anytime</span>
            <span aria-hidden="true">•</span>
            <span>100% private data isolation</span>
          </div>
        </div>

        {/* Live Interactive Hero Demo */}
        <MarketingDemoWidget />

        {/* Glow Elements */}
        <div aria-hidden="true" className="pointer-events-none absolute -right-36 top-0 h-[36rem] w-[36rem] rounded-full bg-amber-500/10 blur-3xl dark:bg-amber-500/15" />
        <div aria-hidden="true" className="pointer-events-none absolute -left-48 bottom-0 h-96 w-96 rounded-full bg-orange-500/10 blur-3xl dark:bg-orange-500/10" />
      </section>

      {/* Metrics Banner */}
      <section className="border-y border-stone-200 bg-white/60 dark:border-stone-800 dark:bg-stone-950/40">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-5 py-8 text-center sm:grid-cols-3 sm:px-8 lg:px-10">
          <div>
            <p className="text-3xl font-black tracking-tight text-amber-700 dark:text-amber-400">2 Taps</p>
            <p className="mt-1 text-sm font-semibold text-stone-700 dark:text-stone-300">To start uncovering a preference</p>
          </div>
          <div>
            <p className="text-3xl font-black tracking-tight text-amber-700 dark:text-amber-400">±40 RD</p>
            <p className="mt-1 text-sm font-semibold text-stone-700 dark:text-stone-300">Glicko-2 statistical confidence bound</p>
          </div>
          <div>
            <p className="text-3xl font-black tracking-tight text-amber-700 dark:text-amber-400">0 Verdicts</p>
            <p className="mt-1 text-sm font-semibold text-stone-700 dark:text-stone-300">Constructive conversation prompts, not labels</p>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
        <div className="text-center">
          <span className="text-xs font-black uppercase tracking-widest text-amber-800 dark:text-amber-400">
            A Better Measurement Standard
          </span>
          <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
            Stop overthinking. Start choosing.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-stone-700 dark:text-stone-300">
            Self-assessment forms ask you to evaluate abstract concepts in isolation. Pairwise simplifies decisions down to natural binary micro-trade-offs.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          <div className="rounded-3xl border border-stone-200 bg-white p-7 shadow-sm transition hover:shadow-md dark:border-stone-800 dark:bg-stone-900/60">
            <span className="text-xs font-black text-amber-700 dark:text-amber-400">STEP 01</span>
            <h3 className="mt-6 text-xl font-black tracking-tight text-stone-900 dark:text-white">Choose Your Perspective</h3>
            <p className="mt-3 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
              Select what you want for your own future, or switch to what you value in a romantic partner. Keep ratings isolated or merge in Couples Mode.
            </p>
          </div>

          <div className="rounded-3xl border border-stone-200 bg-white p-7 shadow-sm transition hover:shadow-md dark:border-stone-800 dark:bg-stone-900/60">
            <span className="text-xs font-black text-amber-700 dark:text-amber-400">STEP 02</span>
            <h3 className="mt-6 text-xl font-black tracking-tight text-stone-900 dark:text-white">Trust Your Gut Reaction</h3>
            <p className="mt-3 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
              Pick whichever option wins on first impression. Pairwise automatically presents non-dominated pairs so no question is ever trivially simple.
            </p>
          </div>

          <div className="rounded-3xl border border-stone-200 bg-white p-7 shadow-sm transition hover:shadow-md dark:border-stone-800 dark:bg-stone-900/60">
            <span className="text-xs font-black text-amber-700 dark:text-amber-400">STEP 03</span>
            <h3 className="mt-6 text-xl font-black tracking-tight text-stone-900 dark:text-white">Watch Ratings Converge</h3>
            <p className="mt-3 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
              See your personal preference hierarchy lock in. Pairwise displays explicit confidence bounds so you know when a pattern is mathematically backed.
            </p>
          </div>
        </div>
      </section>

      {/* The Science & Math Section */}
      <section id="science" className="scroll-mt-20 border-y border-stone-200 bg-stone-100/70 dark:border-stone-800 dark:bg-stone-950/60">
        <div className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <span className="text-xs font-black uppercase tracking-widest text-amber-800 dark:text-amber-400">
                Rigorous Methodology
              </span>
              <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
                Powered by Glicko-2 & Bradley-Terry Models
              </h2>
              <p className="mt-5 text-base leading-relaxed text-stone-700 dark:text-stone-300">
                Pairwise doesn’t use arbitrary point totals. It employs the same rating algorithms used in competitive chess and decision science to calculate precise strength ratings and confidence intervals for your preferences.
              </p>

              <div className="mt-8 space-y-4">
                <div className="flex gap-4 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900/80">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-lg text-amber-800 dark:text-amber-400">
                    🏆
                  </div>
                  <div>
                    <h4 className="font-bold text-stone-900 dark:text-white">Discrete Items: Glicko-2 Engine</h4>
                    <p className="mt-1 text-xs text-stone-700 dark:text-stone-300">
                      Tracks both rating strength and rating deviation (RD) per respondent. One person’s choices never distort another’s baseline.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900/80">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-lg text-amber-800 dark:text-amber-400">
                    ⚖️
                  </div>
                  <div>
                    <h4 className="font-bold text-stone-900 dark:text-white">Continuous Attributes: Bradley-Terry Logit</h4>
                    <p className="mt-1 text-xs text-stone-700 dark:text-stone-300">
                      Evaluates financial & lifestyle trade-offs (income vs hours, upside vs stability) using Davidson tie-extended models solved via Newton-Raphson.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive Rating Convergence Simulator */}
            <ConvergenceVisualizer />
          </div>
        </div>
      </section>

      {/* Couples Mode Section */}
      <section id="couples" className="scroll-mt-20 mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 p-8 text-stone-950 shadow-2xl sm:p-12 lg:p-16">
          <div className="relative z-10 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-stone-950/20 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-stone-950">
                <HeartIcon /> Designed for Couples
              </span>
              <h2 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">
                Uncover shared ground without awkward interrogation.
              </h2>
              <p className="mt-5 text-base leading-relaxed text-stone-950">
                Answer independently on your own schedule. Pairwise aligns your choices into clear visual overlaps, highlighting where your expectations match—and providing constructive prompts where your priorities differ.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/couple"
                  className="group inline-flex items-center gap-2 rounded-2xl bg-stone-950 px-7 py-4 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-stone-900"
                >
                  Explore Couples Mode
                  <span className="transition-transform group-hover:translate-x-1">
                    <ArrowIcon />
                  </span>
                </Link>
              </div>
            </div>

            {/* Couples Overlap Preview Box */}
            <div className="rounded-3xl bg-stone-950 p-6 text-stone-100 shadow-2xl sm:p-8">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-widest text-amber-300">
                  Live Overlap Sync
                </p>
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                  92% Alignment
                </span>
              </div>

              <h3 className="text-lg font-bold">Top Shared Priorities</h3>

              <div className="mt-5 space-y-4">
                <div>
                  <div className="mb-1.5 flex justify-between text-xs font-semibold">
                    <span>A Calm & Grounded Home Life</span>
                    <span className="text-amber-300">Shared Priority #1</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-stone-800">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: "94%" }} />
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex justify-between text-xs font-semibold">
                    <span>Financial Stability & Growth</span>
                    <span className="text-amber-300">Shared Priority #2</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-stone-800">
                    <div className="h-full rounded-full bg-orange-400" style={{ width: "88%" }} />
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex justify-between text-xs font-semibold">
                    <span>Shared Travel & Exploration</span>
                    <span className="text-amber-300">Shared Priority #3</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-stone-800">
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: "82%" }} />
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-stone-800 bg-stone-900/90 p-4 text-xs">
                <p className="font-bold text-amber-300">💬 Conversation Starter:</p>
                <p className="mt-1 text-stone-200">
                  “What does a ‘calm home life’ look like to each of us during a stressful work week?”
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="scroll-mt-20 border-t border-stone-200 bg-stone-50/50 py-24 dark:border-stone-800 dark:bg-stone-950/40">
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8 lg:px-10">
          <div className="text-center">
            <span className="text-xs font-black uppercase tracking-widest text-amber-800 dark:text-amber-400">
              Simple Pricing
            </span>
            <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
              Free while we build it.
            </h2>
            <p className="mt-3 text-stone-700 dark:text-stone-300">
              Everything below works today and costs nothing. Couples sync included — we
              have no way to take payment yet, so nothing here can charge you.
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-2 md:items-stretch lg:max-w-4xl lg:mx-auto">
            {/* Free Tier */}
            <div className="flex flex-col justify-between rounded-3xl border border-stone-200 bg-white p-8 shadow-sm dark:border-stone-800 dark:bg-stone-900/60">
              <div>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-800 dark:bg-stone-800 dark:text-stone-200">
                  Solo Explorer
                </span>
                <h3 className="mt-4 text-2xl font-black text-stone-900 dark:text-white">Free Forever</h3>
                <p className="mt-2 text-3xl font-black text-stone-900 dark:text-white">$0</p>
                <p className="mt-2 text-xs text-stone-600 dark:text-stone-400">Perfect for individual self-discovery.</p>

                <ul className="mt-8 space-y-3 text-sm text-stone-700 dark:text-stone-300">
                  <li className="flex items-center gap-2">✓ Unlimited Pairwise Picks</li>
                  <li className="flex items-center gap-2">✓ Full Glicko-2 Rating Engine</li>
                  <li className="flex items-center gap-2">✓ Personal Preference Rankings</li>
                  <li className="flex items-center gap-2">✓ Rating Deviation Confidence Intervals</li>
                  <li className="flex items-center gap-2">✓ Browser Session Persistence</li>
                </ul>
              </div>

              <Link
                href="/app"
                className="mt-8 block rounded-2xl border border-stone-300 bg-stone-100 py-3.5 text-center text-sm font-bold text-stone-900 transition hover:bg-stone-200 dark:border-stone-700 dark:bg-stone-800 dark:text-white dark:hover:bg-stone-700"
              >
                Start Choosing Free
              </Link>
            </div>

            {/* Pro / Together Tier */}
            <div className="relative flex flex-col justify-between rounded-3xl border-2 border-amber-500 bg-stone-900 p-8 text-white shadow-2xl dark:bg-stone-900">
              <span className="absolute -top-3.5 right-8 rounded-full bg-amber-500 px-3 py-1 text-[11px] font-black uppercase text-stone-950">
                Free while in beta
              </span>

              <div>
                <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300">
                  Pairwise Together
                </span>
                <h3 className="mt-4 text-2xl font-black text-white">Couples & Partners</h3>
                <p className="mt-2 text-3xl font-black text-amber-400">
                  $0 <span className="text-sm font-normal text-stone-300">today</span>
                </p>
                <p className="mt-2 text-xs text-stone-300">
                  Access for 2 partners. The planned price is $9 / month once couples sync
                  leaves beta; you will not be charged, and we cannot charge you.
                </p>

                <ul className="mt-8 space-y-3 text-sm text-stone-200">
                  <li className="flex items-center gap-2">✓ Everything in Free</li>
                  <li className="flex items-center gap-2">✓ Dual Perspective Switching</li>
                  <li className="flex items-center gap-2">✓ Shared Ground Radar & Overlap Sync</li>
                  <li className="flex items-center gap-2">✓ Bradley-Terry Financial Trade-off Models</li>
                  <li className="flex items-center gap-2">✓ Actionable Conversation Prompts</li>
                </ul>
              </div>

              <Link
                href="/couple"
                className="mt-8 block rounded-2xl bg-amber-500 py-3.5 text-center text-sm font-black text-stone-950 shadow-lg transition hover:bg-amber-400"
              >
                Try Couples Mode
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="scroll-mt-20 mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
        <div className="mb-14 text-center">
          <span className="text-xs font-black uppercase tracking-widest text-amber-800 dark:text-amber-400">
            Got Questions?
          </span>
          <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
            Frequently Asked Questions
          </h2>
        </div>

        <FaqSection />
      </section>

      {/* Radiant Footer CTA */}
      <section className="border-t border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-5 py-24 text-center sm:px-8 lg:px-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1.5 text-xs font-bold text-amber-900 dark:bg-amber-950/70 dark:text-amber-300">
            <HeartIcon /> Your next choice awaits
          </div>
          <h2 className="max-w-2xl text-4xl font-black tracking-tight sm:text-5xl">
            Ready to discover what you really value?
          </h2>
          <p className="mt-4 max-w-xl text-stone-700 dark:text-stone-300">
            No long questionnaires. Just instinctive, side-by-side choices that build real statistical clarity.
          </p>
          <Link
            href="/app"
            className="group mt-8 inline-flex min-h-14 items-center gap-3 rounded-2xl bg-amber-500 px-9 py-4 text-base font-black text-stone-950 shadow-[0_12px_32px_rgba(245,158,11,0.3)] transition-all hover:-translate-y-0.5 hover:bg-amber-400"
          >
            Make your first choice
            <span className="transition-transform group-hover:translate-x-1">
              <ArrowIcon />
            </span>
          </Link>

          <div className="mt-16 flex flex-wrap justify-center gap-6 text-xs font-semibold text-stone-600 dark:text-stone-400">
            <Link href="/privacy" className="transition hover:text-stone-900 dark:hover:text-white">Privacy Policy</Link>
            <Link href="/terms" className="transition hover:text-stone-900 dark:hover:text-white">Terms of Service</Link>
            <Link href="/login" className="transition hover:text-stone-900 dark:hover:text-white">Sign In</Link>
            <Link href="/app" className="transition hover:text-stone-900 dark:hover:text-white">Survey App</Link>
          </div>

          <p className="mt-8 text-[11px] text-stone-600 dark:text-stone-400">
            © {new Date().getFullYear()} Pairwise. All rights reserved. Powered by Glicko-2 & Bradley-Terry models.
          </p>
        </div>
      </section>
    </main>
  );
}
