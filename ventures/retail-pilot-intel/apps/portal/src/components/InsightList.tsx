import type { insights } from "../data/demoStore";

type Insight = (typeof insights)[number];

export function InsightList({ items }: { items: Insight[] }) {
  return (
    <ul className="insight-list">
      {items.map((item) => (
        <li key={item.title} className={`insight-card priority-${item.priority}`}>
          <span className={`priority-tag ${item.priority}`}>{item.priority}</span>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
          <p className="impact">{item.impact}</p>
        </li>
      ))}
    </ul>
  );
}
