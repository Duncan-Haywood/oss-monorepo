import Link from "next/link";

export const metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-5 py-8 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold">Privacy policy</h1>
      <p className="text-xs text-neutral-500">Last updated: 28 July 2026</p>

      <p>
        This is a small personal project, not a company. It is written plainly because you should be
        able to tell exactly what happens to your data without a lawyer.
      </p>

      <H>What is collected</H>
      <ul className="list-disc pl-5">
        <li>
          <strong>Your answers.</strong> Which option you picked, when it was shown, and how long you
          took. This is the whole point of the app.
        </li>
        <li>
          <strong>Account details</strong>, if you create one: your email, a first name, and a hashed
          password. Passwords are hashed with bcrypt and are never stored or recoverable in plain text.
        </li>
        <li>
          <strong>Optional profile details</strong> you choose to enter: last name, age, sex, ethnicity,
          country. Every one of these is optional and can be left blank. They exist only to tell one
          person&apos;s answers apart from another&apos;s.
        </li>
        <li>
          <strong>Technical basics</strong> needed to run the service: your IP address is used to rate-limit
          sign-in attempts and is not used to build a profile of you.
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
        Ethnicity and sex are treated as sensitive. They are optional, they are never shown to a
        linked partner, and they are used only to distinguish respondents. If you would rather not
        provide them, leave them blank — nothing in the app behaves differently.
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

      <Link href="/" className="mt-4 text-amber-600 underline underline-offset-2 dark:text-amber-400">
        ← Back
      </Link>
    </main>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-3 text-base font-semibold">{children}</h2>;
}
