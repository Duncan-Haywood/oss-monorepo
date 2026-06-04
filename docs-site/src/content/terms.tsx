import { Callout } from "@/components/Prose";

export function TermsContent() {
  return (
    <>
      <Callout title="Draft only" tone="warn">
        This page summarizes an internal working draft. It is not legal advice and is not
        published for customers until counsel review.
      </Callout>

      <section>
        <h2>Scope</h2>
        <p>
          ShootFlow software is provided for professional media workflow automation.
          Users retain ownership of source media. The system is designed not to delete
          ingest sources or overwrite destination files with different bytes without
          explicit operator action outside default automation paths.
        </p>
      </section>

      <section>
        <h2>Automation boundaries</h2>
        <ul>
          <li>Observe-only JSON handoffs do not grant file-mutation authority.</li>
          <li>Operators must review ingest routes before copy execution.</li>
          <li>Cloud processing, when offered, requires explicit enablement and billing terms.</li>
        </ul>
      </section>

      <section>
        <h2>Full draft</h2>
        <p>
          The canonical markdown draft remains at{" "}
          <code>docs/TERMS_AND_CONDITIONS_DRAFT.md</code> in the repository for legal review.
        </p>
      </section>
    </>
  );
}
