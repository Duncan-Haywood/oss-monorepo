"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Row = { label: string; a: number; b: number; gap: number };
type Comparison = {
  overlap: number;
  agreement: number | null;
  /** 0–1: how much of the spread in these rankings is preference, not noise. */
  reliability?: number;
  aligned: Row[];
  diverged: Row[];
};

type ActionItem = { label: string; rating: number; rd: number; category: string | null };
type SharedValue = { label: string; aStrength: number; bStrength: number; combined: number };
/** `gap` is a difference of within-person positions, in points out of 100. */
type Asymmetry = { label: string; theirStrength: number; myStrength: number; gap: number };
type Readiness = {
  ready: boolean;
  mine: number | null;
  theirs: number | null;
  needed: number;
  waitingOn: "you" | "them" | "both" | null;
};

type CompareData = {
  couple: { inviteCode: string; partner: { id: string; firstName: string } | null } | null;
  fit?: Comparison;
  theirFit?: Comparison;
  mirror?: Comparison;
  blindSpots?: Comparison;
  makeThemHappy?: ActionItem[];
  makeYouHappy?: ActionItem[];
  shared?: SharedValue[];
  mattersMoreToThem?: Asymmetry[];
  readiness?: {
    makeThemHappy: Readiness;
    makeYouHappy: Readiness;
    shared: Readiness;
    mattersMoreToThem: Readiness;
  };
  counts?: Record<string, number>;
};

export function CoupleView() {
  const [data, setData] = useState<CompareData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "signedout" | "error">("loading");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/couple/compare");
      if (res.status === 401) return setState("signedout");
      if (!res.ok) return setState("error");
      setData(await res.json());
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    // `load` is async and its first statement is an await, so nothing is set
    // synchronously here. The rule can't see across the async boundary and
    // flags every fetch-on-mount; this is the shape React's own docs give.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function createInvite() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/couple/create", { method: "POST" });
      if (!res.ok) setError((await res.json())?.error ?? "Couldn't create an invite.");
      else await load();
    } catch {
      setError("Couldn't create an invite.");
    }
    setBusy(false);
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/couple/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: code }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d?.error ?? "Couldn't join.");
      else {
        setCode("");
        await load();
      }
    } catch {
      setError("Couldn't join.");
    }
    setBusy(false);
  }

  if (state === "loading") return <Shell><p className="text-neutral-500 dark:text-neutral-400">Loading…</p></Shell>;

  if (state === "signedout") {
    return (
      <Shell>
        <p className="text-neutral-600 dark:text-neutral-400">
          Comparing needs an account for each of you.
        </p>
        <Link href="/login" className="rounded-2xl bg-amber-500 px-5 py-3 text-sm font-semibold text-neutral-950">
          Sign in
        </Link>
      </Shell>
    );
  }

  if (state === "error" || !data) {
    return (
      <Shell>
        <p role="alert" className="text-red-600 dark:text-red-400">Couldn&apos;t load this.</p>
        {/* A dropped request on a phone is the ordinary case here, and going
            back to the cards is not what someone who came to read this
            wants. Retrying in place is. */}
        <button
          onClick={() => {
            setState("loading");
            load();
          }}
          className="rounded-xl border-2 border-neutral-300 px-4 py-2 text-sm font-semibold dark:border-neutral-700"
        >
          Try again
        </button>
        <Link href="/" className="text-sm underline underline-offset-2">Back</Link>
      </Shell>
    );
  }

  // Not linked yet — show invite + join.
  if (!data.couple || !data.couple.partner) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-10">
        <div className="text-center">
          <div className="text-4xl">💛</div>
          <h1 className="mt-2 text-2xl font-bold">Compare with your partner</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            You both answer on your own. Then you see where you line up — and where you were wrong
            about each other.
          </p>
        </div>

        {data.couple?.inviteCode ? (
          <div className="rounded-2xl border-2 border-amber-300/70 bg-amber-50 p-4 text-center dark:border-amber-400/30 dark:bg-amber-950/40">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Send them this code</p>
            <p className="mt-1 select-all font-mono text-2xl font-bold tracking-widest text-amber-900 dark:text-amber-200">
              {data.couple.inviteCode}
            </p>
            <p className="mt-2 text-xs text-amber-800/80 dark:text-amber-300/70">
              Waiting for them to join…
            </p>
          </div>
        ) : (
          <button
            onClick={createInvite}
            disabled={busy}
            className="rounded-2xl bg-amber-500 px-4 py-4 text-base font-semibold text-neutral-950 disabled:opacity-50"
          >
            Create an invite code
          </button>
        )}

        <form onSubmit={join} className="flex flex-col gap-2">
          <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Or enter their code
          </label>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD-EFGH"
              className="flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-3 font-mono text-base uppercase tracking-widest outline-none focus:border-amber-500 dark:border-neutral-700 dark:bg-neutral-900"
              maxLength={20}
            />
            <button
              type="submit"
              disabled={busy || !code.trim()}
              className="rounded-xl border-2 border-neutral-300 px-4 font-semibold disabled:opacity-40 dark:border-neutral-700"
            >
              Join
            </button>
          </div>
        </form>

        {error && <p className="text-center text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
        <Link href="/" className="text-center text-xs text-neutral-500 dark:text-neutral-400 underline underline-offset-2">
          Back to swiping
        </Link>
      </main>
    );
  }

  const partnerName = data.couple.partner.firstName;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">You &amp; {partnerName}</h1>
        <Link href="/" className="text-sm font-semibold text-amber-700 underline underline-offset-2 dark:text-amber-400">
          Swipe →
        </Link>
      </div>

      <section className="rounded-2xl border-2 border-amber-300/70 bg-amber-50 p-4 dark:border-amber-400/30 dark:bg-amber-950/30">
        <h2 className="font-bold text-amber-900 dark:text-amber-200">
          What actually makes {partnerName} happy
        </h2>
        <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-300/70">
          Their highest-rated things you can actually do. Start at the top.
        </p>
        {data.makeThemHappy && data.makeThemHappy.length > 0 ? (
          <ol className="mt-3 flex flex-col gap-2">
            {data.makeThemHappy.map((r, i) => (
              <li key={r.label} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-neutral-950">
                  {i + 1}
                </span>
                <span className="font-medium text-amber-900 dark:text-amber-100">{r.label}</span>
              </li>
            ))}
          </ol>
        ) : (
          <Locked
            readiness={data.readiness?.makeThemHappy}
            partnerName={partnerName}
            unlocks="there is anything worth telling you to do"
          />
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold">Matters more to them than to you</h2>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          Not a fault — just where a small effort from you goes further than it would for you.
        </p>
        {data.mattersMoreToThem && data.mattersMoreToThem.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {data.mattersMoreToThem.map((r) => (
              <li key={r.label} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{r.label}</span>
                  <span className="shrink-0 text-[11px] text-neutral-500 dark:text-neutral-400">
                    {describeGap(r.gap)}
                  </span>
                </div>
                <div className="mt-1 flex h-1.5 gap-1">
                  <span className="flex-1 rounded-full bg-neutral-200 dark:bg-neutral-800">
                    <span
                      className="block h-full rounded-full bg-amber-500"
                      style={{ width: `${Math.min(100, Math.max(4, r.gap))}%` }}
                    />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Locked
            readiness={data.readiness?.mattersMoreToThem}
            partnerName={partnerName}
            unlocks="a difference between you means more than a difference in how much you each answered"
          />
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold">What you both want</h2>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          Common ground — the things you&apos;re already aligned on.
        </p>
        {data.shared && data.shared.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {data.shared.map((r) => (
              <li
                key={r.label}
                className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"
              >
                {r.label}
              </li>
            ))}
          </ul>
        ) : (
          <Locked
            readiness={data.readiness?.shared}
            partnerName={partnerName}
            unlocks="common ground can be told apart from coincidence"
          />
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold">What {partnerName} could do for you</h2>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          Your own top answers — worth saying out loud, since they can&apos;t see this list.
        </p>
        {data.makeYouHappy && data.makeYouHappy.length > 0 ? (
          <ol className="mt-2 flex flex-col gap-1 text-sm">
            {data.makeYouHappy.map((r, i) => (
              <li key={r.label}>
                {i + 1}. {r.label}
              </li>
            ))}
          </ol>
        ) : (
          <Locked
            readiness={data.readiness?.makeYouHappy}
            partnerName={partnerName}
            unlocks="there is anything here worth asking them for"
          />
        )}
      </section>

      <Section
        title="Are you what they want?"
        subtitle={`What ${partnerName} wants in a partner vs. what you want for yourself`}
        comparison={data.fit}
        needs={`Needs answers from both of you — you on “for myself”, ${partnerName} on “in a partner”.`}
        alignedLabel="Where you're already aligned"
        divergedLabel="Where you're pulling apart"
      />

      <Section
        title="Your blind spots"
        subtitle={`What you GUESSED ${partnerName} wants vs. what they actually want`}
        comparison={data.blindSpots}
        needs={`Answer a round in “guess what they want” mode to unlock this.`}
        alignedLabel="You read them well here"
        divergedLabel="You were most wrong here"
        highlightDiverged
      />

      <Section
        title="Shared taste"
        subtitle={`What you each want in a partner`}
        comparison={data.mirror}
        needs="Both of you need to answer the “in a partner” questions."
        alignedLabel="You agree most on"
        divergedLabel="You disagree most on"
      />

      <Link
        href="/"
        className="mt-1 rounded-2xl bg-amber-500 px-4 py-4 text-center text-base font-semibold text-neutral-950"
      >
        Answer more to sharpen this
      </Link>
    </main>
  );
}

/**
 * The gap is a difference of within-person positions out of 100. Printing it
 * as a number would imply a precision a few dozen swipes can't support, so
 * the bar carries the magnitude and the words stay honest.
 */
function describeGap(gap: number): string {
  if (gap >= 50) return "far higher for them";
  if (gap >= 30) return "much higher for them";
  return "higher for them";
}

/**
 * The honest version of an empty section.
 *
 * These four sit behind a confidence floor a couple does not reach for
 * several hundred answers — measured, not guessed: after ~90 answers across
 * two real accounts, exactly one item had come under it. Rendering them only
 * when non-empty meant the most useful half of this screen silently vanished,
 * with nothing saying it existed or how much further there was to go. That is
 * the opposite of making the next question worth answering.
 *
 * Do not fix this by lowering the floor. Advising someone confidently off four
 * swipes is the failure mode the whole project exists to avoid.
 */
function Locked({
  readiness,
  partnerName,
  unlocks,
}: {
  readiness?: Readiness;
  partnerName: string;
  unlocks: string;
}) {
  // Enough data, but nothing rose above the bar — a real answer, and a
  // different one from "keep going".
  if (readiness?.ready) {
    return (
      <p className="mt-3 rounded-xl bg-black/5 px-3 py-2.5 text-xs text-neutral-600 dark:bg-white/10 dark:text-neutral-300">
        Nothing stands out here yet. More answers will sharpen it.
      </p>
    );
  }

  // No readiness in the payload means an older response shape; "both" is the
  // safe assumption because it never tells one partner the other is holding
  // things up when they aren't.
  const waitingOn = readiness?.waitingOn ?? "both";
  const who =
    waitingOn === "both"
      ? `You and ${partnerName} both need`
      : waitingOn === "them"
        ? `${partnerName} needs`
        : "You need";

  return (
    <div className="mt-3 rounded-xl bg-black/5 px-3 py-2.5 dark:bg-white/10">
      <p className="text-xs text-neutral-600 dark:text-neutral-300">
        <span aria-hidden="true">🔒 </span>
        {who} to answer more before {unlocks}.
      </p>
      {readiness && (
        <div className="mt-2 flex flex-col gap-1.5">
          {readiness.mine !== null && (
            <ReadinessBar label="You" value={readiness.mine} needed={readiness.needed} />
          )}
          {readiness.theirs !== null && (
            <ReadinessBar label={partnerName} value={readiness.theirs} needed={readiness.needed} />
          )}
        </div>
      )}
    </div>
  );
}

/** Progress toward a threshold, in items the model is confident about. */
function ReadinessBar({ label, value, needed }: { label: string; value: number; needed: number }) {
  const done = Math.min(value, needed);
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px] text-neutral-600 dark:text-neutral-400">
        <span>{label}</span>
        <span>
          {done} of {needed} settled
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label}: ${done} of ${needed} answers settled enough to use`}
        aria-valuemin={0}
        aria-valuemax={needed}
        aria-valuenow={done}
        className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
      >
        <div
          className="h-full rounded-full bg-amber-500"
          style={{ width: `${Math.max((done / needed) * 100, 3)}%` }}
        />
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  comparison,
  needs,
  alignedLabel,
  divergedLabel,
  highlightDiverged,
}: {
  title: string;
  subtitle: string;
  comparison?: Comparison;
  needs: string;
  alignedLabel: string;
  divergedLabel: string;
  highlightDiverged?: boolean;
}) {
  // Matches MIN_OVERLAP_FOR_ROWS in lib/couples — below it the server sends
  // no rows at all, so the locked state is the honest thing to show.
  const enough = comparison && comparison.overlap >= 5;
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</p>

      {!enough ? (
        <p className="mt-3 rounded-xl bg-neutral-100 px-3 py-2 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
          🔒 {needs}
        </p>
      ) : (
        <>
          {comparison.agreement === null ? (
            <p className="mt-3 text-[11px] text-neutral-500 dark:text-neutral-400">
              Early days — there aren&apos;t enough shared answers yet for an overall match
              score to mean anything. A number here now would mostly be measuring how much
              you&apos;ve each answered.
            </p>
          ) : (
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-neutral-600 dark:text-neutral-400">Overall match</span>
                <span className="font-bold">{Math.round(((comparison.agreement + 1) / 2) * 100)}%</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500"
                  style={{ width: `${Math.max(((comparison.agreement + 1) / 2) * 100, 3)}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">Across {comparison.overlap} shared items</p>
            </div>
          )}

          <RowList
            label={alignedLabel}
            rows={comparison.aligned}
            tone="good"
            empty="Nothing is measured finely enough yet to say the two of you agree on it."
          />
          <RowList
            label={divergedLabel}
            rows={comparison.diverged}
            tone={highlightDiverged ? "alert" : "muted"}
            empty="No difference here is bigger than the uncertainty around it yet. Keep answering and real ones will surface."
          />
        </>
      )}
    </section>
  );
}

function RowList({
  label,
  rows,
  tone,
  empty,
}: {
  label: string;
  rows: Row[];
  tone: "good" | "muted" | "alert";
  empty: string;
}) {
  const dot = tone === "good" ? "bg-emerald-500" : tone === "alert" ? "bg-rose-500" : "bg-neutral-400";
  // An empty list is a finding too: saying nothing at all here is what made
  // the screen look finished when it was still waiting. See `absence-is-a-claim`.
  if (!rows.length) {
    return (
      <div className="mt-3">
        <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">{label}</p>
        <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">{empty}</p>
      </div>
    );
  }
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">{label}</p>
      <ul className="mt-1 flex flex-col gap-1">
        {rows.slice(0, 4).map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-sm">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            <span className="flex-1 truncate">{r.label}</span>
            <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
              #{r.a} vs #{r.b}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-5 py-10 text-center">
      {children}
    </main>
  );
}
