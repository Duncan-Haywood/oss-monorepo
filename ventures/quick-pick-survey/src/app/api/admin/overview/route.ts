import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "@/lib/adminAuth";
import { median, percentile } from "@/lib/stats";
import { summariseConversion } from "@/lib/inviteConversion";

/** A pause long enough that they almost certainly left and came back. */
const SESSION_GAP_MS = 10 * 60 * 1000;
/** Answers slower than this are "hard" — a real deliberation, not a reflex. */
const SLOW_MS = 6000;

export async function GET() {
  const store = await cookies();
  if (!verifySessionToken(store.get(ADMIN_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  try {
    const [participants, trials, financialTrials, feedback, users, couples, usageEvents, coupleInvites, coupleChallenges] = await Promise.all([
      prisma.participant.findMany({
        select: {
          id: true, firstName: true, lastName: true, email: true, sex: true, age: true,
          ethnicity: true, countryOfResidence: true, perspective: true, userId: true,
          createdAt: true, lastSeenAt: true, survey: { select: { slug: true, title: true, kind: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.trial.findMany({
        select: {
          participantId: true, result: true, shownAt: true, answeredAt: true,
          msToAnswer: true, msSincePrevAnswer: true, clientMsToAnswer: true, interactionMethod: true,
          itemA: { select: { label: true, category: true } },
          itemB: { select: { label: true, category: true } },
        },
        orderBy: { shownAt: "desc" },
        take: 5000,
      }),
      prisma.financialTrial.count({ where: { result: { not: null } } }),
      prisma.insightFeedback.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
      prisma.user.count(),
      prisma.couple.count({ where: { joinerId: { not: null } } }),
      prisma.usageEvent.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        select: { event: true, sessionKeyHash: true, sequence: true, occurredAt: true, domain: true, durationMs: true, statusCode: true, success: true },
        orderBy: { createdAt: "desc" },
        take: 20_000,
      }),
      // The referral denominator. `couples` above counts only the invites that
      // converted; on its own that number can only ever go up and says nothing
      // about whether inviting works. These rows carry the invite and its
      // outcome together, so the rate is per-invite and attributable.
      prisma.couple.findMany({
        select: { createdAt: true, joinerId: true, joinedAt: true },
        orderBy: { createdAt: "desc" },
        take: 5000,
      }),
      prisma.coupleChallenge.findMany({
        select: { createdAt: true, challengedCoupleId: true },
        orderBy: { createdAt: "desc" },
        take: 5000,
      }),
    ]);

    const reports = await prisma.userReport.findMany({
      orderBy: [{ resolved: "asc" }, { createdAt: "desc" }],
      take: 100,
    });

    const answered = trials.filter((t) => t.result);
    const timings = answered
      .map((t) => t.clientMsToAnswer ?? t.msToAnswer ?? 0)
      .filter((m) => m > 0 && m < 120_000);
    const methodCounts = new Map<string, number>();
    for (const t of answered) {
      const method = t.interactionMethod ?? "legacy";
      methodCounts.set(method, (methodCounts.get(method) ?? 0) + 1);
    }

    // --- Drop rate, done honestly ---------------------------------------
    // A trial row is created the moment a pair is SHOWN, so unanswered rows
    // include refreshes and bots, not just genuine abandonment. The only
    // one that plausibly represents someone walking away is the LAST trial
    // of a participant's session — earlier unanswered rows are almost
    // always a reload. So we count abandoned sessions, not abandoned rows.
    const byParticipant = new Map<string, typeof trials>();
    for (const t of trials) {
      const arr = byParticipant.get(t.participantId) ?? [];
      arr.push(t);
      byParticipant.set(t.participantId, arr);
    }
    let sessionsStarted = 0;
    let sessionsAbandoned = 0;
    for (const [, ts] of byParticipant) {
      const sorted = [...ts].sort((a, b) => a.shownAt.getTime() - b.shownAt.getTime());
      sessionsStarted++;
      const last = sorted[sorted.length - 1];
      if (!last.result) sessionsAbandoned++;
    }

    // --- Which items slow people down -----------------------------------
    // Attributed to both items in the pair: a slow answer means THIS pairing
    // was hard, and we can't tell which side caused it.
    const perItem = new Map<string, { label: string; times: number[] }>();
    for (const t of answered) {
      const ms = t.clientMsToAnswer ?? t.msToAnswer ?? 0;
      if (ms <= 0 || ms > 120_000) continue;
      for (const item of [t.itemA, t.itemB]) {
        const e = perItem.get(item.label) ?? { label: item.label, times: [] };
        e.times.push(ms);
        perItem.set(item.label, e);
      }
    }
    const itemTiming = [...perItem.values()]
      .filter((e) => e.times.length >= 3)
      .map((e) => ({ label: e.label, medianMs: median(e.times)!, n: e.times.length }));
    const slowest = [...itemTiming].sort((a, b) => b.medianMs - a.medianMs).slice(0, 10);
    const fastest = [...itemTiming].sort((a, b) => a.medianMs - b.medianMs).slice(0, 10);

    // --- Velocity over the session --------------------------------------
    // Bucketed by how deep into their own session each answer was, to show
    // whether people speed up (learning the UI) or slow down (fatigue).
    const depthBuckets = new Map<number, number[]>();
    for (const [, ts] of byParticipant) {
      const sorted = [...ts].filter((t) => t.result).sort((a, b) => a.shownAt.getTime() - b.shownAt.getTime());
      sorted.forEach((t, idx) => {
        const ms = t.clientMsToAnswer ?? t.msToAnswer ?? 0;
        if (ms <= 0 || ms > 120_000) return;
        const bucket = Math.floor(idx / 10) * 10;
        const arr = depthBuckets.get(bucket) ?? [];
        arr.push(ms);
        depthBuckets.set(bucket, arr);
      });
    }
    const velocity = [...depthBuckets.entries()]
      .map(([bucket, times]) => ({ from: bucket, medianMs: median(times)!, n: times.length }))
      .sort((a, b) => a.from - b.from)
      .slice(0, 12);

    // --- Return / re-engagement -----------------------------------------
    const returns = answered.filter((t) => (t.msSincePrevAnswer ?? 0) > SESSION_GAP_MS).length;

    // --- Feedback --------------------------------------------------------
    const useful = feedback.filter((f) => f.usefulness !== null);
    const enjoy = feedback.filter((f) => f.enjoyment !== null);
    const bySubject = new Map<string, { up: number; down: number }>();
    const negativeReasons = new Map<string, number>();
    for (const f of useful) {
      const e = bySubject.get(f.subject) ?? { up: 0, down: 0 };
      if ((f.usefulness ?? 0) >= 3) e.up++;
      else e.down++;
      bySubject.set(f.subject, e);
      if ((f.usefulness ?? 0) < 3 && f.reason) {
        negativeReasons.set(f.reason, (negativeReasons.get(f.reason) ?? 0) + 1);
      }
    }

    // --- Per-participant summary ----------------------------------------
    const answeredByParticipant = new Map<string, number>();
    for (const t of answered) {
      answeredByParticipant.set(t.participantId, (answeredByParticipant.get(t.participantId) ?? 0) + 1);
    }
    const people = participants
      .map((p) => ({
        ...p,
        answered: answeredByParticipant.get(p.id) ?? 0,
      }))
      .filter((p) => p.answered > 0)
      .slice(0, 100);

    const usageByEvent = new Map<string, typeof usageEvents>();
    for (const event of usageEvents) {
      const rows = usageByEvent.get(event.event) ?? [];
      rows.push(event);
      usageByEvent.set(event.event, rows);
    }
    const funnelEvents = ["route_view", "survey_start", "question_load", "answer_save", "insight_view", "feedback_open"];
    const transitionPairs = [
      ["survey_start", "question_load"],
      ["question_load", "answer_save"],
      ["answer_save", "insight_view"],
      ["feedback_open", "feedback_submit"],
    ] as const;
    const eventsBySession = new Map<string, typeof usageEvents>();
    for (const event of usageEvents) {
      const rows = eventsBySession.get(event.sessionKeyHash) ?? [];
      rows.push(event);
      eventsBySession.set(event.sessionKeyHash, rows);
    }
    const transitionTimes = transitionPairs.map(([from, to]) => {
      const durations: number[] = [];
      for (const rows of eventsBySession.values()) {
        const ordered = [...rows].sort((a, b) => a.sequence - b.sequence);
        const start = ordered.find((row) => row.event === from && row.success !== false);
        if (!start) continue;
        const finish = ordered.find((row) => row.sequence > start.sequence && row.event === to && row.success !== false);
        if (!finish) continue;
        const elapsed = finish.occurredAt.getTime() - start.occurredAt.getTime();
        if (elapsed >= 0 && elapsed <= 30 * 60 * 1000) durations.push(elapsed);
      }
      return { from, to, n: durations.length, medianMs: median(durations), p95Ms: percentile(durations, 0.95) };
    });
    const feedbackSubjects = new Set(
      usageEvents
        .filter((event) => ["feedback_prompt", "feedback_dismiss", "feedback_submit", "nps_submitted"].includes(event.event))
        .map((event) => event.domain)
        .filter((domain): domain is string => domain !== null),
    );
    const feedbackResponse = [...feedbackSubjects].map((subject) => {
      const rows = usageEvents.filter((event) => event.domain === subject);
      const sessionCount = (eventName: string) => new Set(
        rows.filter((row) => row.event === eventName && row.success !== false).map((row) => row.sessionKeyHash),
      ).size;
      const prompted = sessionCount("feedback_prompt");
      const submitted = subject === "session" ? sessionCount("nps_submitted") : sessionCount("feedback_submit");
      return {
        subject,
        prompted,
        submitted,
        dismissed: sessionCount("feedback_dismiss"),
        responseRate: prompted ? submitted / prompted : null,
      };
    }).sort((a, b) => b.prompted - a.prompted);
    const usage = {
      uniqueSessions: new Set(usageEvents.map((event) => event.sessionKeyHash)).size,
      funnel: funnelEvents.map((event) => ({
        event,
        sessions: new Set((usageByEvent.get(event) ?? []).filter((row) => row.success !== false).map((row) => row.sessionKeyHash)).size,
      })),
      operations: [...usageByEvent.entries()].map(([event, rows]) => {
        const durations = rows.map((row) => row.durationMs).filter((value): value is number => value !== null);
        return {
          event,
          count: rows.length,
          failures: rows.filter((row) => row.success === false).length,
          failureStatuses: [...new Set(rows.filter((row) => row.success === false).map((row) => row.statusCode).filter((value): value is number => value !== null))].sort(),
          medianMs: median(durations),
          p95Ms: percentile(durations, 0.95),
        };
      }).sort((a, b) => b.count - a.count),
      transitions: transitionTimes,
      feedbackResponse,
    };

    // Referral conversion is deliberately NOT computed from `usageEvents`.
    // `couple_invite_created` and `couple_joined` come from two different
    // people in two different sessions, and everything in `usage` above groups
    // by `sessionKeyHash` — a transition row for that pair would sit at n = 0
    // forever and read as "invites never convert". See `lib/inviteConversion`.
    const now = new Date();
    const referral = {
      invites: summariseConversion(
        coupleInvites.map((row) => ({
          createdAt: row.createdAt,
          converted: row.joinerId !== null,
          convertedAt: row.joinedAt,
        })),
        now,
      ),
      // The challenge table records no acceptance timestamp, so every latency
      // here is null and `maturityAdequate` cannot be judged. The rate is still
      // sound; the nulls say plainly which parts are not measured rather than
      // implying a validated window.
      challenges: summariseConversion(
        coupleChallenges.map((row) => ({
          createdAt: row.createdAt,
          converted: row.challengedCoupleId !== null,
          convertedAt: null,
        })),
        now,
      ),
    };

    return NextResponse.json({
      totals: {
        users,
        linkedCouples: couples,
        participants: participants.length,
        answeredItemTrials: answered.length,
        answeredFinancialTrials: financialTrials,
        tiedAnswers: answered.filter((t) => t.result === "EQUAL").length,
      },
      engagement: {
        medianMsToAnswer: median(timings),
        slowAnswerShare: timings.length ? timings.filter((m) => m > SLOW_MS).length / timings.length : null,
        sessionsStarted,
        sessionsAbandoned,
        abandonRate: sessionsStarted ? sessionsAbandoned / sessionsStarted : null,
        returnsAfterBreak: returns,
        velocity,
        interactionMethods: [...methodCounts.entries()]
          .map(([method, count]) => ({ method, count }))
          .sort((a, b) => b.count - a.count),
      },
      usage,
      referral,
      hardest: slowest,
      easiest: fastest,
      feedback: {
        usefulUp: useful.filter((f) => (f.usefulness ?? 0) >= 3).length,
        usefulDown: useful.filter((f) => (f.usefulness ?? 0) < 3).length,
        medianEnjoyment: median(enjoy.map((f) => f.enjoyment ?? 0)),
        bySubject: [...bySubject.entries()].map(([subject, v]) => ({ subject, ...v })),
        negativeReasons: [...negativeReasons.entries()]
          .map(([reason, count]) => ({ reason, count }))
          .sort((a, b) => b.count - a.count),
        notes: feedback.filter((f) => f.note).slice(0, 30).map((f) => ({
          subject: f.subject,
          note: f.note,
          reason: f.reason,
          answerCount: f.answerCount,
          perspective: f.perspective,
          path: f.path,
          at: f.createdAt,
        })),
      },
      people,
      reports: reports.map((r) => ({
        id: r.id,
        kind: r.kind,
        impact: r.impact,
        perspective: r.perspective,
        reference: r.id.slice(-8).toUpperCase(),
        message: r.message,
        email: r.email,
        path: r.path,
        resolved: r.resolved,
        createdAt: r.createdAt,
      })),
      openReports: reports.filter((r) => !r.resolved).length,
    });
  } catch (err) {
    console.error("admin overview failed", err);
    return NextResponse.json({ error: "Could not build the overview" }, { status: 500 });
  }
}
