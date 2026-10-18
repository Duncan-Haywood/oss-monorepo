// DOM wiring for the browser evidence tool. Depends on evidence.js's globals
// (buildReport, toMarkdown, toJson) and usage.js's (recordUsage, isUsageEnabled,
// setUsageEnabled) being loaded first via plain <script> tags — no bundler, no
// build step, no upload: pasted text never leaves this tab.

function track(eventName) {
  if (typeof recordUsage === "function") recordUsage(eventName);
}

function statusLabel(status) {
  if (status === "changed") return "changed";
  if (status === "inconclusive") return "inconclusive";
  return "unchanged";
}

function renderReport(container, report) {
  const changeRows = report.changes
    .map((change) => `<li><code>${change.kind}</code></li>`)
    .join("");

  container.innerHTML = `
    <div class="summary-card">
      <div class="summary-stat">
        <span class="summary-number ${statusLabel(report.status)}">${report.status}</span>
        <span class="summary-label">status</span>
      </div>
      <div class="summary-stat">
        <span class="summary-number ${report.review_required ? "build-only" : "production"}">${report.review_required ? "yes" : "no"}</span>
        <span class="summary-label">review required</span>
      </div>
    </div>
    <div class="report-actions">
      <button type="button" id="download-md">Download Markdown</button>
      <button type="button" id="download-json">Download JSON</button>
    </div>
    <div class="table-wrap">
      <p><strong>Before:</strong> ${report.metadata.url_before} — captured ${report.metadata.captured_before} (fetch: ${report.metadata.fetch_status_before})</p>
      <p><strong>After:</strong> ${report.metadata.url_after} — captured ${report.metadata.captured_after} (fetch: ${report.metadata.fetch_status_after})</p>
      <h3>Changes</h3>
      <ul class="change-list">${changeRows || "<li>none observed</li>"}</ul>
      <p class="reason">${report.evidence_boundary}</p>
    </div>
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
    download(toMarkdown(report), "text/markdown", "vendor-change-evidence.md", "markdown_downloaded");
  });
  container.querySelector("#download-json")?.addEventListener("click", () => {
    download(toJson(report), "application/json", "vendor-change-evidence.json", "json_downloaded");
  });
}

function initApp() {
  const beforeArea = document.getElementById("before-paste");
  const afterArea = document.getElementById("after-paste");
  const compareButton = document.getElementById("compare-button");
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

  function runReport(beforeText, afterText) {
    errorBox.hidden = true;
    try {
      const report = buildReport(beforeText, afterText);
      renderReport(results, report);
      track("snapshot_compared");
    } catch (err) {
      showError(err.message || "Could not compare those snapshots.");
      track("compare_failed");
    }
  }

  compareButton?.addEventListener("click", () => {
    const beforeText = beforeArea?.value?.trim();
    const afterText = afterArea?.value?.trim();
    if (!beforeText || !afterText) {
      showError("Paste both a before and an after snapshot first.");
      return;
    }
    runReport(beforeText, afterText);
  });

  // This tool's own example pair — lets a first visit see a real report
  // before assembling snapshots of their own, on the same code path a pasted
  // pair would take (not a separate hard-coded result).
  exampleButton?.addEventListener("click", async () => {
    try {
      const [beforeRes, afterRes] = await Promise.all([
        fetch("examples/before.json"),
        fetch("examples/after.json"),
      ]);
      if (!beforeRes.ok || !afterRes.ok) throw new Error("example unavailable");
      const [beforeText, afterText] = await Promise.all([beforeRes.text(), afterRes.text()]);
      if (beforeArea) beforeArea.value = beforeText.trim();
      if (afterArea) afterArea.value = afterText.trim();
      runReport(beforeText, afterText);
      track("example_used");
    } catch {
      showError("Could not load the bundled example. Paste your own before/after snapshots instead.");
    }
  });
}

if (typeof window !== "undefined") {
  document.addEventListener("DOMContentLoaded", initApp);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { renderReport, statusLabel };
}
