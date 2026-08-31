// DOM wiring for the browser evidence tool. Depends on evidence.js's globals
// (buildReport, toMarkdown, toJson, describeObservation) and usage.js's
// (recordUsage, isUsageEnabled, setUsageEnabled) being loaded first via plain
// <script> tags -- no bundler, no build step, no upload: the CSV never leaves
// this tab.

function track(eventName) {
  if (typeof recordUsage === "function") recordUsage(eventName);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

const KIND_LABELS = {
  "missing-data": "missing data",
  "invalid-timestamp": "invalid timestamp",
  "time-order": "time order",
  "fifo-exception": "FIFO exception",
};

function renderReport(container, report) {
  const rowsHtml = report.observations
    .map(
      (obs) => `
      <tr class="kind-${obs.kind}">
        <td>${obs.row}</td>
        <td><span class="badge ${obs.kind}">${escapeHtml(KIND_LABELS[obs.kind] || obs.kind)}</span></td>
        <td class="reason">${escapeHtml(describeObservation(obs))}</td>
      </tr>`,
    )
    .join("");

  const emptyState = `<p class="empty-state">No observations -- nothing in this pick log needed a closer look.</p>`;

  container.innerHTML = `
    <div class="summary-card">
      <div class="summary-stat">
        <span class="summary-number">${report.rowsChecked}</span>
        <span class="summary-label">rows checked</span>
      </div>
      <div class="summary-stat">
        <span class="summary-number ${report.observations.length ? "build-only" : "production"}">${report.observations.length}</span>
        <span class="summary-label">observations</span>
      </div>
    </div>
    <div class="report-actions">
      <button type="button" id="download-md">Download Markdown</button>
      <button type="button" id="download-json">Download JSON</button>
    </div>
    ${
      report.observations.length
        ? `<div class="table-wrap">
      <table class="component-table">
        <thead>
          <tr><th>Row</th><th>Kind</th><th>Detail</th></tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`
        : emptyState
    }
  `;

  const download = (blobText, mime, filename, eventName) => {
    const blob = new Blob([blobText], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    track(eventName);
  };

  container.querySelector("#download-md")?.addEventListener("click", () => {
    download(toMarkdown(report), "text/markdown", "fifo-pick-evidence.md", "markdown_downloaded");
  });
  container.querySelector("#download-json")?.addEventListener("click", () => {
    download(toJson(report), "application/json", "fifo-pick-evidence.json", "json_downloaded");
  });
}

function initApp() {
  const fileInput = document.getElementById("csv-input");
  const pasteArea = document.getElementById("csv-paste");
  const parseButton = document.getElementById("parse-pasted");
  const dropZone = document.getElementById("drop-zone");
  const errorBox = document.getElementById("error");
  const results = document.getElementById("results");
  const optout = document.getElementById("optout");
  const exampleButton = document.getElementById("load-example");

  if (optout && typeof isUsageEnabled === "function" && typeof setUsageEnabled === "function") {
    optout.checked = !isUsageEnabled();
    optout.addEventListener("change", () => setUsageEnabled(!optout.checked));
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    results.innerHTML = "";
  }

  function runReport(text, fileName) {
    errorBox.hidden = true;
    try {
      const report = buildReport(text, fileName);
      renderReport(results, report);
      track("report_generated");
    } catch (err) {
      showError(err.message || "Could not read that file.");
      track("report_failed");
    }
  }

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    file.text().then((text) => runReport(text, file.name)).catch(() => showError("Could not read that file."));
  });

  parseButton?.addEventListener("click", () => {
    const text = pasteArea?.value?.trim();
    if (!text) {
      showError("Paste the pick-log CSV first.");
      return;
    }
    runReport(text, "picks.csv");
  });

  if (dropZone) {
    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.remove("dragover");
      });
    });
    dropZone.addEventListener("drop", (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      file.text().then((text) => runReport(text, file.name)).catch(() => showError("Could not read that file."));
    });
  }

  // This tool's own bundled example -- a real pick log with one deliberate
  // FIFO exception -- lets a first visit see a real report before hunting
  // down a warehouse export, on the same code path a pasted file would take.
  exampleButton?.addEventListener("click", async () => {
    try {
      const res = await fetch("examples/picks.csv");
      if (!res.ok) throw new Error("example unavailable");
      const text = await res.text();
      runReport(text, "examples/picks.csv");
      track("example_used");
    } catch {
      showError("Could not load the bundled example. Paste or drop your own pick-log CSV instead.");
    }
  });
}

if (typeof window !== "undefined") {
  document.addEventListener("DOMContentLoaded", initApp);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { renderReport, escapeHtml, KIND_LABELS };
}
