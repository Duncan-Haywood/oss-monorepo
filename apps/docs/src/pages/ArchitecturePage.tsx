import { Link } from "react-router-dom";
import { Card, Diagram } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";

const diagram = `┌─────────────────────────────────────────────────────────────┐
│                        STORE (Italy)                         │
│  ┌──────────┐   ┌──────────────┐   ┌─────────┐   ┌────────┐ │
│  │ Door cam │──►│ Edge runtime │──►│ Local   │──►│Dashboard│ │
│  │ (RTSP)   │   │ CV + rules   │   │ store   │   │ (LAN)  │ │
│  └──────────┘   └──────┬───────┘   └────▲────┘   └────────┘ │
│  ┌──────────┐          │          ┌──────┴───────┐           │
│  │ Scanners │──────────┼─────────►│  Analytics   │           │
│  └──────────┘          │          └──────▲───────┘           │
│  ┌──────────┐          │          ┌──────┴───────┐           │
│  │   POS    │──export──┴─────────►│ POS connector │           │
│  └──────────┘                     └───────────────┘           │
└─────────────────────────────────────────────────────────────┘`;

export function ArchitecturePage() {
  return (
    <DocLayout
      title="System architecture"
      subtitle="Edge-first pipeline: sense → aggregate → join POS → recommend"
      footer={<Link to="/metrics">Next: Metrics →</Link>}
    >
      <p>
        Components are built in <Link to="/priorities">ROI order</Link>: POS +
        door first; zones and outdoor cameras only after conversion baseline is
        trusted.
      </p>

      <h2>High-level diagram</h2>
      <Diagram>{diagram}</Diagram>

      <h2>Components</h2>
      <h3>Edge vision (packages/edge)</h3>
      <ul>
        <li>RTSP ingest; person detection; line-crossing</li>
        <li>Emit AggregateEvent JSON — no face embeddings</li>
      </ul>
      <h3>POS connector (packages/pos)</h3>
      <ul>
        <li>Vendor adapter → SaleEvent normalization</li>
      </ul>
      <h3>Analytics (packages/analytics)</h3>
      <ul>
        <li>SQLite rollups, funnel joins, experiment registry (later)</li>
      </ul>
      <h3>Docs & dashboard (apps/docs)</h3>
      <ul>
        <li>TSX site built by Vite; CI publishes dist artifact</li>
      </ul>

      <h2>Event contracts</h2>
      <pre>{`packages/schemas/json/aggregate_event.schema.json
packages/schemas/json/sale_event.schema.json`}</pre>

      <h2>Deployment</h2>
      <Card>
        <p>
          Linux edge PC; optional Docker Compose. Camera on isolated VLAN;
          outbound internet disabled by default.
        </p>
      </Card>
    </DocLayout>
  );
}
