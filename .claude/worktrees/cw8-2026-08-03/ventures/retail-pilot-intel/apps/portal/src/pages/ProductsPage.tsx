import { PortalShell } from "../components/PortalShell";
import { skuInsights } from "../data/demoStore";

export function ProductsPage() {
  return (
    <PortalShell
      title="Product intelligence"
      subtitle="SKU-level attention vs conversion — the desirability gap operators care about."
    >
      <div className="table-wrap">
        <table className="sku-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th>Touches</th>
              <th>Sales</th>
              <th>Conv.</th>
              <th>Gap</th>
              <th>Insight</th>
            </tr>
          </thead>
          <tbody>
            {skuInsights.map((row) => (
              <tr key={row.sku} className={`gap-${row.gap}`}>
                <td>
                  <code>{row.sku}</code>
                </td>
                <td>{row.name}</td>
                <td>{row.touches}</td>
                <td>{row.purchases}</td>
                <td>{row.conversionPct}%</td>
                <td>
                  <span className={`gap-pill ${row.gap}`}>{row.gap}</span>
                </td>
                <td className="note-cell">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="panel callout">
        <h2>Why this matters for margin</h2>
        <p>
          Micro-format boutiques cannot afford blind merchandising. High-touch / low-close SKUs
          tie up scarce floor space; pairing and script experiments (see Experiments) turn
          attention into margin without discounting hero lines.
        </p>
      </section>
    </PortalShell>
  );
}
