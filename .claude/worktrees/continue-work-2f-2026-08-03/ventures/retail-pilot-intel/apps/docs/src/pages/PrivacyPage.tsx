import { Link } from "react-router-dom";
import { Card, DataTable } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";

export function PrivacyPage() {
  return (
    <DocLayout
      title="Privacy & GDPR (Italy / EU)"
      subtitle="Technical and organizational controls — not legal advice"
      footer={<Link to="/roadmap">Next: Roadmap →</Link>}
    >
      <Card variant="warn">
        <p>
          <strong>Important:</strong> Store video analytics typically processes
          personal data. This system minimizes risk via on-device aggregation and
          purpose limitation; controllers still need lawful basis, transparency,
          and often a DPIA. Consult qualified counsel and the Garante where
          required.
        </p>
      </Card>

      <h2>Design principles</h2>
      <ol>
        <li>Data minimization — counts in DB, not faces</li>
        <li>Purpose limitation — operations analytics only</li>
        <li>Storage limitation — no raw video by default</li>
        <li>Integrity & confidentiality — LAN segmentation, encryption</li>
      </ol>

      <h2>Prohibited</h2>
      <ul>
        <li>Facial recognition or persistent shopper ID</li>
        <li>Biometric profiling for marketing</li>
        <li>Sharing identifiable imagery without DPA</li>
      </ul>

      <h2>Technical controls</h2>
      <DataTable
        headers={["Control", "Implementation"]}
        rows={[
          ["On-device CV", "Inference on edge PC; RTSP not on internet"],
          ["Aggregation at source", "AggregateEvent only"],
          ["No identity linkage", "No join to loyalty/cardholder"],
          ["Signage", "Italian Art. 13 notice at entrance"],
        ]}
      />

      <h2>POS data</h2>
      <p>
        Operational fields only. No PAN; pseudonymous basket_id for funnel joins.
      </p>
    </DocLayout>
  );
}
