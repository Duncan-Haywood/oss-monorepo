import Link from "next/link";

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

export default function LandingPage() {
  return (
    <main className="overflow-hidden bg-[#fbfaf7] text-[#1f1d1a] dark:bg-[#11100f] dark:text-[#f6f2eb]">
      <nav className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-black tracking-[-0.03em]">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f4b942] text-[#332200] shadow-[0_5px_18px_rgba(244,185,66,0.28)]">
            <HeartIcon />
          </span>
          Pairwise
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/login" className="rounded-full px-3 py-2 text-sm font-semibold text-[#686159] transition hover:bg-black/5 dark:text-[#bdb5aa] dark:hover:bg-white/5">
            Sign in
          </Link>
          <Link href="/app" className="rounded-full bg-[#24211d] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-black dark:bg-[#f4b942] dark:text-[#2a1c00]">
            Start choosing
          </Link>
        </div>
      </nav>

      <section className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-5 pb-20 pt-10 sm:px-8 sm:pt-16 lg:grid-cols-[1.02fr_0.98fr] lg:px-10 lg:pb-28 lg:pt-20">
        <div className="relative z-10 max-w-2xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#e9dfcf] bg-white/80 px-3 py-1.5 text-xs font-bold text-[#645d54] shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-[#d2cabf]">
            <SparkIcon />
            See what your choices say about you
          </div>
          <h1 className="text-[3.25rem] font-black leading-[0.94] tracking-[-0.065em] sm:text-7xl lg:text-[5.1rem]">
            Hard to explain.
            <span className="mt-2 block text-[#b67700] dark:text-[#f4b942]">Easy to choose.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-[#686159] dark:text-[#bdb5aa] sm:text-xl">
            Pick between two good things. Pairwise turns those small, instinctive choices into a clearer picture of what you value in yourself, your life, and your relationship.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/app" className="group inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-[#f4b942] px-7 py-4 text-base font-black text-[#332200] shadow-[0_12px_32px_rgba(185,117,0,0.22)] transition hover:-translate-y-0.5 hover:bg-[#ffc954]">
              Make your first choice
              <span className="transition-transform group-hover:translate-x-1"><ArrowIcon /></span>
            </Link>
            <Link href="#how-it-works" className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-[#dcd4c8] bg-white/60 px-6 py-4 text-base font-bold transition hover:bg-white dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10">
              See how it works
            </Link>
          </div>
          <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-[#7d756b] dark:text-[#9f978d]">
            <span>No account needed</span><span aria-hidden="true">•</span>
            <span>Pause anytime</span><span aria-hidden="true">•</span>
            <span>Answers stay private</span>
          </p>
        </div>

        <ComparisonPreview />

        <div aria-hidden="true" className="pointer-events-none absolute -right-48 top-0 h-[34rem] w-[34rem] rounded-full bg-[#f4b942]/15 blur-3xl dark:bg-[#f4b942]/8" />
        <div aria-hidden="true" className="pointer-events-none absolute -left-64 bottom-0 h-96 w-96 rounded-full bg-[#e4b8a3]/20 blur-3xl dark:bg-[#b9653f]/10" />
      </section>

      <section className="border-y border-[#e7e0d6] bg-white/70 dark:border-white/10 dark:bg-white/[0.025]">
        <div className="mx-auto grid w-full max-w-6xl gap-px px-5 py-8 sm:grid-cols-3 sm:px-8 lg:px-10">
          <ProofPoint value="2 taps" label="to start revealing a preference" />
          <ProofPoint value="Your pace" label="progress saves as you go" />
          <ProofPoint value="No verdicts" label="insights, not compatibility scores" />
        </div>
      </section>

      <section id="how-it-works" className="mx-auto w-full max-w-6xl scroll-mt-10 px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
        <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#a16a00] dark:text-[#f4b942]">A better way to answer</p>
            <h2 className="mt-4 text-4xl font-black leading-tight tracking-[-0.045em] sm:text-5xl">
              Stop trying to know the answer in advance.
            </h2>
            <p className="mt-5 text-base leading-7 text-[#6d665d] dark:text-[#aaa298]">
              Big questions are hard. Small trade-offs are easier—and often more revealing.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Step number="01" title="Pick a focus" body="Explore who you want to become, what you want in a partner, or what you think they value." />
            <Step number="02" title="Trust your reaction" body="Choose the card that wins on first impression. Skip when neither answer feels meaningful." />
            <Step number="03" title="Watch it sharpen" body="See priorities, patterns, and trade-offs emerge—always with uncertainty shown honestly." />
          </div>
        </div>
      </section>

      <section className="bg-[#25211d] text-[#f8f4ed] dark:bg-[#080807]">
        <div className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#f4b942]">The payoff</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] sm:text-6xl">Not a score. Something useful.</h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#bdb5aa]">
              Pairwise surfaces the patterns hidden inside your choices, then waits for enough evidence before calling them insights.
            </p>
          </div>
          <div className="mt-14 grid gap-4 md:grid-cols-3">
            <OutcomeCard eyebrow="Your pattern" title="“You keep choosing steadiness over intensity.”" accent="bg-[#f4b942]" />
            <OutcomeCard eyebrow="Your trade-off" title="“Curiosity wins—until it competes with reliability.”" accent="bg-[#dc8e6b]" />
            <OutcomeCard eyebrow="Your uncertainty" title="“There isn’t enough evidence here yet. Keep choosing.”" accent="bg-[#8ea89b]" />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
        <div className="relative overflow-hidden rounded-[2.25rem] bg-[#f4b942] px-6 py-10 text-[#332200] shadow-[0_24px_70px_rgba(118,76,0,0.16)] sm:px-10 sm:py-14 lg:px-16">
          <div className="relative z-10 grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/45 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em]">
                <HeartIcon /> Better together
              </div>
              <h2 className="mt-5 max-w-2xl text-4xl font-black leading-tight tracking-[-0.045em] sm:text-5xl">
                Learn something about each other you can actually use.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-[#604716]">
                Answer separately, then discover shared ground, meaningful differences, and the places where your guess about your partner missed.
              </p>
              <Link href="/couple" className="group mt-8 inline-flex min-h-14 items-center gap-3 rounded-2xl bg-[#2b2417] px-6 py-4 font-black text-white transition hover:-translate-y-0.5">
                Explore Pairwise for couples
                <span className="transition-transform group-hover:translate-x-1"><ArrowIcon /></span>
              </Link>
            </div>
            <CouplePreview />
          </div>
          <div aria-hidden="true" className="absolute -bottom-36 -right-24 h-80 w-80 rounded-full border-[55px] border-white/15" />
        </div>
      </section>

      <section className="border-t border-[#e7e0d6] dark:border-white/10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-5 py-20 text-center sm:px-8 lg:px-10">
          <h2 className="max-w-2xl text-4xl font-black tracking-[-0.045em] sm:text-5xl">Your next choice is the only one that matters.</h2>
          <p className="mt-4 text-[#6d665d] dark:text-[#aaa298]">Start now. Your first insight builds from there.</p>
          <Link href="/app" className="group mt-8 inline-flex min-h-14 items-center gap-3 rounded-2xl bg-[#f4b942] px-8 py-4 font-black text-[#332200] shadow-[0_12px_32px_rgba(185,117,0,0.2)] transition hover:-translate-y-0.5">
            Make your first choice
            <span className="transition-transform group-hover:translate-x-1"><ArrowIcon /></span>
          </Link>
          <div className="mt-12 flex gap-5 text-xs font-semibold text-[#817970] dark:text-[#9f978d]">
            <Link href="/privacy" className="hover:underline">Privacy</Link>
            <Link href="/terms" className="hover:underline">Terms</Link>
            <Link href="/login" className="hover:underline">Sign in</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function ComparisonPreview() {
  return (
    <div className="relative z-10 mx-auto w-full max-w-[31rem] lg:ml-auto">
      <div className="absolute -left-7 top-24 hidden -rotate-6 rounded-2xl border border-[#e5ddd1] bg-white px-4 py-3 text-sm font-bold shadow-xl sm:block dark:border-white/10 dark:bg-[#25221f]">
        Go with your gut
        <span className="mt-0.5 block text-xs font-medium text-[#8a8278]">There’s no wrong pick</span>
      </div>
      <div className="rotate-[1.5deg] rounded-[2rem] border border-white/80 bg-white/75 p-4 shadow-[0_30px_80px_rgba(71,51,20,0.16)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5 sm:p-5">
        <div className="mb-4 flex items-center justify-between px-1">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#a16a00] dark:text-[#f4b942]">What matters more?</p>
            <p className="mt-1 text-sm font-bold">Choose on first impression</p>
          </div>
          <span className="rounded-full bg-[#f0ece5] px-2.5 py-1 text-xs font-bold text-[#766f66] dark:bg-white/10 dark:text-[#c7bfb5]">12 chosen</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ChoiceCard label="Adventure" detail="A life that keeps surprising you" tone="from-[#e2a676] to-[#b86748]" symbol="↗" />
          <ChoiceCard label="Stability" detail="A life you can build on" tone="from-[#89a99d] to-[#4f766c]" symbol="⌂" selected />
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-[#817970] dark:text-[#aaa298]">
          <span className="h-px w-8 bg-current opacity-30" /> or skip this pair <span className="h-px w-8 bg-current opacity-30" />
        </div>
      </div>
      <div className="absolute -bottom-6 -right-3 rounded-2xl border border-[#eadfcf] bg-[#fffaf0] px-4 py-3 shadow-xl dark:border-[#f4b942]/20 dark:bg-[#2b2518] sm:-right-8">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[#9b6808] dark:text-[#f4b942]">Pattern forming</p>
        <p className="mt-1 text-sm font-bold">Security keeps winning</p>
      </div>
    </div>
  );
}

function ChoiceCard({ label, detail, tone, symbol, selected = false }: { label: string; detail: string; tone: string; symbol: string; selected?: boolean }) {
  return (
    <div className={`relative flex min-h-64 flex-col justify-between overflow-hidden rounded-[1.4rem] bg-gradient-to-br ${tone} p-4 text-white shadow-sm sm:min-h-80 sm:p-5 ${selected ? "bg-gradient-to-br ring-4 ring-[#f4b942] ring-offset-2 ring-offset-white dark:ring-offset-[#1a1816]" : ""}`}>
      <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full border-[28px] border-white/10" />
      <span className="relative text-4xl font-light opacity-90">{symbol}</span>
      <div className="relative">
        {selected ? <span className="mb-2 inline-block rounded-full bg-[#f4b942] px-2 py-1 text-[10px] font-black uppercase tracking-wider text-[#332200]">Your pick</span> : null}
        <h3 className="text-xl font-black tracking-[-0.03em] sm:text-2xl">{label}</h3>
        <p className="mt-1 text-xs leading-5 text-amber-100 sm:text-sm">{detail}</p>
      </div>
    </div>
  );
}

function ProofPoint({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-baseline gap-3 border-[#e7e0d6] py-2 sm:flex-col sm:items-center sm:gap-1 sm:border-l sm:first:border-l-0 dark:border-white/10">
      <strong className="text-xl font-black tracking-[-0.03em]">{value}</strong>
      <span className="text-sm text-[#756e65] dark:text-[#a9a198]">{label}</span>
    </div>
  );
}

function Step({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <article className="rounded-3xl border border-[#e5ddd1] bg-white p-6 shadow-[0_12px_35px_rgba(49,38,24,0.05)] dark:border-white/10 dark:bg-white/[0.035]">
      <span className="text-sm font-black text-[#b67700] dark:text-[#f4b942]">{number}</span>
      <h3 className="mt-8 text-xl font-black tracking-[-0.025em]">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-[#706960] dark:text-[#aaa298]">{body}</p>
    </article>
  );
}

function OutcomeCard({ eyebrow, title, accent }: { eyebrow: string; title: string; accent: string }) {
  return (
    <article className="flex min-h-64 flex-col justify-between rounded-3xl border border-white/10 bg-white/[0.055] p-6">
      <div className={`h-2 w-12 rounded-full ${accent}`} />
      <div>
        <p className="text-xs font-black uppercase tracking-[0.15em] text-[#a9a198]">{eyebrow}</p>
        <h3 className="mt-3 text-2xl font-black leading-snug tracking-[-0.035em]">{title}</h3>
      </div>
    </article>
  );
}

function CouplePreview() {
  return (
    <div className="relative mx-auto w-full max-w-sm rounded-3xl bg-[#fff8e8] p-5 shadow-[0_22px_50px_rgba(83,53,0,0.16)] sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#8b620e]">Shared ground</p>
      <h3 className="mt-2 text-xl font-black">You both keep choosing…</h3>
      <div className="mt-5 space-y-3">
        <SharedRow label="Feeling understood" you={92} partner={88} />
        <SharedRow label="A calm home life" you={84} partner={91} />
        <SharedRow label="Trying new things" you={76} partner={72} />
      </div>
      <p className="mt-5 rounded-2xl bg-[#f4b942]/25 px-4 py-3 text-sm font-bold leading-5">
        A conversation worth having: what does “feeling understood” look like on a difficult day?
      </p>
    </div>
  );
}

function SharedRow({ label, you, partner }: { label: string; you: number; partner: number }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs font-bold">
        <span>{label}</span>
        <span className="text-[#7b6a49]">Both high</span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <div className="h-2 overflow-hidden rounded-full bg-[#e9dfca]"><div className="h-full rounded-full bg-[#bf7d00]" style={{ width: `${you}%` }} /></div>
        <div className="h-2 overflow-hidden rounded-full bg-[#e9dfca]"><div className="h-full rounded-full bg-[#6e8c7e]" style={{ width: `${partner}%` }} /></div>
      </div>
    </div>
  );
}
