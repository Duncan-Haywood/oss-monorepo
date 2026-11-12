/**
 * The database step of the stored survey prior (src/lib/surveyPrior.ts):
 * read the stored estimate, and recompute it from the survey's most recent
 * respondents when it is missing or stale. The insights route reads the
 * stored value inline and runs the refresh after its response is sent
 * (next/server `after`), so no respondent waits for the pooled search.
 */

import { prisma } from "./prisma";
import type { RefitAnswer } from "./btRefit";
import { needsRefresh, POOL_MAX_RESPONDENTS, surveyPriorPhi, type PoolPerson, type StoredPrior } from "./surveyPrior";

/** Answers read for a refresh, most recent first: enough for 40 respondents at a few dozen answers each. */
const REFRESH_MAX_TRIALS = 6000;

export async function storedSurveyPrior(surveyId: string): Promise<StoredPrior> {
  const s = await prisma.survey.findUnique({
    where: { id: surveyId },
    select: { setPriorPhi: true, setPriorRespondents: true, setPriorAnswers: true },
  });
  return { phi: s?.setPriorPhi ?? null, respondents: s?.setPriorRespondents ?? null, answers: s?.setPriorAnswers ?? null };
}

// One refresh per survey at a time in this process; a second request while one runs skips.
const inFlight = new Set<string>();

/**
 * Recomputes and stores the survey's pooled prior sd if `needsRefresh` says
 * so. Returns what is stored afterwards. The write is conditional on the
 * answer count it read, so a slower concurrent refresh cannot overwrite a
 * newer estimate with an older one.
 */
export async function refreshSurveyPrior(surveyId: string): Promise<StoredPrior> {
  const stored = await storedSurveyPrior(surveyId);
  if (inFlight.has(surveyId)) return stored;
  const answers = await prisma.trial.count({ where: { participant: { surveyId }, result: { in: ["A", "B", "EQUAL"] } } });
  if (!needsRefresh(stored, answers)) return stored;
  inFlight.add(surveyId);
  try {
    const trials = await prisma.trial.findMany({
      where: { participant: { surveyId }, result: { in: ["A", "B", "EQUAL"] } },
      orderBy: { answeredAt: "desc" },
      take: REFRESH_MAX_TRIALS,
      select: { participantId: true, itemAId: true, itemBId: true, result: true },
    });
    // Respondents in order of their latest answer; each one's answers and answered items.
    const people = new Map<string, { ids: Set<string>; answers: RefitAnswer[] }>();
    for (const t of trials) {
      let p = people.get(t.participantId);
      if (!p) {
        if (people.size >= POOL_MAX_RESPONDENTS * 3) continue;
        people.set(t.participantId, (p = { ids: new Set(), answers: [] }));
      }
      p.ids.add(t.itemAId);
      p.ids.add(t.itemBId);
      p.answers.push(t.result === "B" ? { winner: t.itemBId, loser: t.itemAId } : { winner: t.itemAId, loser: t.itemBId, tie: t.result === "EQUAL" });
    }
    const pool: PoolPerson[] = [...people.values()].map((p) => ({ ids: [...p.ids], answers: p.answers }));
    const est = await surveyPriorPhi(pool);
    const next: StoredPrior = { phi: est?.phi ?? null, respondents: est?.respondents ?? null, answers };
    const written = await prisma.survey.updateMany({
      where: { id: surveyId, OR: [{ setPriorAnswers: null }, { setPriorAnswers: { lt: answers } }] },
      data: { setPriorPhi: next.phi, setPriorRespondents: next.respondents, setPriorAnswers: answers, setPriorAt: new Date() },
    });
    return written.count > 0 ? next : await storedSurveyPrior(surveyId);
  } finally {
    inFlight.delete(surveyId);
  }
}
