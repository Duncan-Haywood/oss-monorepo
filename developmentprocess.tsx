/**
 * How Quick pick gets built.
 *
 * This is the front door to the development process. It is a component
 * rather than a markdown file on purpose: the process is defined as typed
 * data in `src/lib/developmentProcess.ts`, guarded by
 * `src/lib/developmentProcess.test.ts`, and rendered here. A claim in this
 * document that stops being true fails the test run rather than sitting
 * quietly in a file nobody opens.
 *
 * Read this first if you are about to change anything in this repo. The
 * long-form companions live in `docs/`:
 *
 *   docs/PRODUCT-GOALS.md        what the app is for, and what it deliberately is not
 *   docs/ARCHITECTURE.md         how the measurement actually works
 *   docs/DATA-COLLECTION.md      every field the app stores about a person, and
 *                                what a linked partner can and cannot see
 *   docs/QUALITY-BAR.md          the gates, and what each one is protecting
 *   docs/STATISTICAL-INTEGRITY.md  what has to be true before a number is shown
 *                                to a couple, and how to check a new one
 *   docs/CONVERGENCE.md          how many answers clearing that bar actually
 *                                costs, and how to measure a pairing change
 *   docs/TESTING.md              what is covered, what is not, and how to add to it
 *   docs/UNATTENDED-SESSIONS.md  how to work here when nobody is watching, and
 *                                what happens when several sessions forget to
 *   IMPROVEMENT-PLAN.md          the live backlog, ordered by priority
 *
 * The component is not routed. Internal process notes are not something to
 * serve to people answering the survey; import it into a scratch page if
 * you want to read it rendered.
 */

import {
  DEFINITION_OF_DONE,
  GATES,
  GOALS,
  PRINCIPLES,
  PRIORITIES,
  PRIORITY_MEANING,
  STAGES,
  WORKSTREAMS,
  type Priority,
} from "@/lib/developmentProcess";

const STATUS_LABEL: Record<string, string> = {
  done: "Done",
  "in-progress": "In progress",
  next: "Next",
  later: "Later",
};

function Section({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-50">{title}</h2>
      {lead && <p className="text-sm text-neutral-600 dark:text-neutral-400">{lead}</p>}
      {children}
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      {children}
    </div>
  );
}

export function DevelopmentProcess() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-5 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">How this gets built</h1>
        <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          Quick pick tells couples something true about each other. Every rule below exists because
          a plausible-looking shortcut would have made the output confidently wrong, and nobody
          would have gone back to check.
        </p>
      </header>

      <Section
        title="What it is for"
        lead="A change that serves none of these needs a reason for existing."
      >
        {GOALS.map((g) => (
          <Card key={g.id}>
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{g.statement}</p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              <span className="font-medium">You would know because:</span> {g.signal}
            </p>
          </Card>
        ))}
      </Section>

      <Section title="Principles" lead="The reasoning, so the rules survive contact with a case they did not anticipate.">
        {PRINCIPLES.map((p) => (
          <Card key={p.id}>
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{p.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">{p.why}</p>
          </Card>
        ))}
      </Section>

      <Section title="The loop" lead="What one change goes through, start to finish.">
        <ol className="flex flex-col gap-3">
          {STAGES.map((s, i) => (
            <li key={s.id}>
              <Card>
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {i + 1}. {s.title}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">{s.work}</p>
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-xs text-neutral-500 dark:text-neutral-400">
                  {s.exit.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        title="Gates"
        lead="npm run verify runs the blocking ones — and is currently the only thing that does. The CI workflow exists but has never started a runner, so nothing is checked after a push."
      >
        {GATES.map((g) => (
          <Card key={g.id}>
            <p className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-semibold dark:bg-neutral-800">
                {g.command}
              </code>
              <span
                className={
                  g.blocking
                    ? "text-xs font-semibold text-amber-600 dark:text-amber-400"
                    : "text-xs font-semibold text-neutral-500 dark:text-neutral-400"
                }
              >
                {g.blocking ? "blocking" : "before deploy"}
              </span>
            </p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">{g.catches}</p>
          </Card>
        ))}
      </Section>

      <Section title="Done means" lead="Read this before saying a change is finished.">
        <Card>
          <ul className="flex flex-col gap-2">
            {DEFINITION_OF_DONE.map((d) => (
              <li key={d.id} className="flex items-start gap-2 text-xs">
                <span aria-hidden="true" className="text-neutral-400">
                  ☐
                </span>
                <span className="text-neutral-700 dark:text-neutral-300">
                  {d.check}{" "}
                  <span className="text-neutral-400 dark:text-neutral-500">({d.defends})</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      <Section title="Priorities" lead="What each level actually commits you to.">
        <Card>
          <dl className="flex flex-col gap-2 text-xs">
            {PRIORITIES.map((p: Priority) => (
              <div key={p} className="flex gap-2">
                <dt className="w-8 shrink-0 font-bold text-neutral-900 dark:text-neutral-100">{p}</dt>
                <dd className="text-neutral-600 dark:text-neutral-400">{PRIORITY_MEANING[p]}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </Section>

      <Section title="Workstreams" lead="Individual items live in IMPROVEMENT-PLAN.md; these are what they hang off.">
        {WORKSTREAMS.map((w) => (
          <Card key={w.id}>
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{w.title}</span>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {w.priority}
              </span>
              <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                {STATUS_LABEL[w.status] ?? w.status}
              </span>
            </p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">{w.note}</p>
          </Card>
        ))}
      </Section>
    </main>
  );
}

export default DevelopmentProcess;
