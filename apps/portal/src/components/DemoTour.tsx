import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { demoTourSteps } from "../data/demoStore";

const STORAGE_KEY = "rpi-demo-tour";

function readTourEnabled(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) !== "dismissed";
  } catch {
    return true;
  }
}

function readTourStep(): number {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_KEY}-step`);
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? Math.min(Math.max(0, n), demoTourSteps.length - 1) : 0;
  } catch {
    return 0;
  }
}

export function DemoTour() {
  const location = useLocation();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(readTourEnabled);
  const [stepIndex, setStepIndex] = useState(readTourStep);

  const step = demoTourSteps[stepIndex];
  const isLast = stepIndex >= demoTourSteps.length - 1;

  const persistStep = useCallback((index: number) => {
    setStepIndex(index);
    try {
      sessionStorage.setItem(`${STORAGE_KEY}-step`, String(index));
    } catch {
      /* ignore */
    }
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      sessionStorage.setItem(STORAGE_KEY, "dismissed");
    } catch {
      /* ignore */
    }
  }, []);

  const goToStep = useCallback(
    (index: number) => {
      const next = demoTourSteps[index];
      if (!next) return;
      persistStep(index);
      if (location.pathname !== next.path) {
        navigate(next.path);
      }
    },
    [location.pathname, navigate, persistStep],
  );

  useEffect(() => {
    const match = demoTourSteps.findIndex((s) => s.path === location.pathname);
    if (match >= 0 && match !== stepIndex) {
      persistStep(match);
    }
  }, [location.pathname, persistStep, stepIndex]);

  if (!visible || !step) return null;

  return (
    <aside className="demo-tour" aria-label="Sales demo walkthrough">
      <div className="demo-tour-header">
        <span className="demo-tour-badge">Demo script</span>
        <span className="demo-tour-progress">
          Step {stepIndex + 1} of {demoTourSteps.length} · {step.duration}
        </span>
        <button type="button" className="demo-tour-close" onClick={dismiss} aria-label="Dismiss tour">
          ×
        </button>
      </div>
      <h3 className="demo-tour-title">{step.title}</h3>
      <p className="demo-tour-point">{step.talkingPoint}</p>
      <div className="demo-tour-actions">
        <button
          type="button"
          className="btn-ghost"
          disabled={stepIndex === 0}
          onClick={() => goToStep(stepIndex - 1)}
        >
          Back
        </button>
        {isLast ? (
          <button type="button" className="btn-primary btn-compact" onClick={dismiss}>
            Finish demo
          </button>
        ) : (
          <button type="button" className="btn-primary btn-compact" onClick={() => goToStep(stepIndex + 1)}>
            Next →
          </button>
        )}
      </div>
    </aside>
  );
}
