import { useState } from "react";
import { useLocation } from "react-router-dom";
import { demoTalkingPoints } from "../data/demoStore";

export function DemoGuide() {
  const { pathname } = useLocation();
  const guide = demoTalkingPoints[pathname] ?? demoTalkingPoints["/"];
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button
        type="button"
        className="demo-guide-collapsed"
        onClick={() => setOpen(true)}
        aria-label="Open demo presenter guide"
      >
        Presenter guide
      </button>
    );
  }

  return (
    <aside className="demo-guide" aria-label="Sales demo talking points">
      <header>
        <span className="pill pill-demo">Presenter</span>
        <button
          type="button"
          className="link-btn"
          onClick={() => setOpen(false)}
          aria-label="Hide demo guide"
        >
          Hide
        </button>
      </header>
      <h2>{guide.title}</h2>
      <ul>
        {guide.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </aside>
  );
}
