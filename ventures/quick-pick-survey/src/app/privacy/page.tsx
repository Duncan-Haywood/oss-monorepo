import Link from "next/link";

export const metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-5 py-8 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold">Privacy policy</h1>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">Last updated: 29 July 2026</p>

      <p>
        This is a small personal project, not a company. It is written plainly because you should be
        able to tell exactly what happens to your data without a lawyer.
      </p>

      <H>What is collected</H>
      <ul className="list-disc pl-5">
        <li>
          <strong>Your answers.</strong> Which option you picked, when it was shown, how long you
          took, and whether you chose by swiping, tapping a card, using a button, or marking a tie.
          This helps calculate your ranking and identify places where the experience slows people down.
        </li>
        <li>
          <strong>Account details</strong>, if you create one: your email, a first name, and a hashed
          password. Passwords are hashed with bcrypt and are never stored or recoverable in plain text.
        </li>
        <li>
          <strong>A first name</strong> if you answer without an account, so your answers can be told
          apart from your partner&apos;s on a shared device. Nothing else.
        </li>
        <li>
          <strong>Anything you write to us</strong>: a bug report, confusing experience, question/content concern, idea, a rating of whether an
          insight was useful, why it missed, and any note you leave with it. Feedback also includes
          the page, survey mode, impact you selected, and how many answers you had completed so we can identify where the
          experience needs work. If you send a bug report we also record
          which page you were on and your browser&apos;s user-agent string, because that is what makes
          a bug findable. You can leave an email address so we can reply; it is optional.
        </li>
        <li>
          <strong>Technical basics</strong> needed to run the service: a server-keyed digest of your IP
          address is recorded when you sign in, start answering without an account, or send feedback.
          The raw address is not stored. The digest is used only to stop one address doing any of those
          thousands of times over and is deleted on a short retention schedule.
        </li>
        <li>
          <strong>Limited first-party usage events</strong> used to find where people get held up:
          page visits and time on page, self/partner mode, survey topic, core actions, their order, operation
          duration, and whether an operation succeeded. A random browser-session identifier is stored
          only as a one-way digest. Events use a fixed vocabulary, never include your card choices or
          feedback text, and are deleted after 30 days.
        </li>
      </ul>

      <H>What is not collected</H>
      <p>
        No third-party analytics, no advertising trackers, no cookies beyond the single sign-in cookie
        that keeps you logged in. Your data is not sold, rented, or shared with advertisers.
      </p>

      <H>If you link with a partner</H>
      <p>
        Linking two accounts shares <em>aggregate comparisons only</em> — how closely your rankings
        correlate, and which items align or diverge most. Your partner never sees your individual
        answers, your response times, or your profile details. The same is true in reverse.
      </p>

      <H>Sensitive details</H>
      <p>
        The app does not ask for your age, sex, ethnicity or country. It used to, on a form that has
        since been removed, and there is no longer any way to enter them. Nothing in the app reads
        them and no screen displays them. If you gave any of these earlier, email the address below
        and they will be deleted.
      </p>

      <H>Where it lives</H>
      <p>
        Data is stored in a Postgres database hosted by Vercel, and the app runs on Vercel&apos;s
        infrastructure. It is retained until you ask for it to be deleted.
      </p>

      <H>Your choices</H>
      <p>
        You can use the app without an account at all — answers then live only in your own browser.
        You can ask for your data to be exported or permanently deleted at any time by emailing the
        address below, and it will be done.
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
