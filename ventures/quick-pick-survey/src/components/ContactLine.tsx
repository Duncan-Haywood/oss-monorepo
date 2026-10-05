// Where people reach the operator, including to export or delete their data.
// The address comes from NEXT_PUBLIC_CONTACT_EMAIL in the deployment, so the
// public repository carries no personal address. Without it, the pages point
// at the repository's issue tracker, which is public: say so, so nobody posts
// personal details there.
export const ISSUES_URL = "https://github.com/Duncan-Haywood/fp-monorepo/issues";

export function contactEmail(): string {
  return (process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "").trim();
}

export default function ContactLine() {
  const email = contactEmail();
  if (email) {
    return (
      <p>
        <a href={`mailto:${email}`} className="underline underline-offset-2">
          {email}
        </a>
      </p>
    );
  }
  return (
    <p>
      Open an issue at{" "}
      <a href={ISSUES_URL} className="underline underline-offset-2">
        {ISSUES_URL.replace("https://", "")}
      </a>
      . Issues are public, so don&apos;t include personal details in one. Ask
      for a private channel instead.
    </p>
  );
}
