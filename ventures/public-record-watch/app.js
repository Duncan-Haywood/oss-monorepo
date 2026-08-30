// DOM wiring for the browser evidence tool. Depends on evidence.js's globals
// (buildReport, toMarkdown, toJson) and usage.js's (recordUsage, isUsageEnabled,
// setUsageEnabled) being loaded first via plain <script> tags — no bundler, no
// build step, no upload: pasted text never leaves this tab.

function track(eventName) {
  if (typeof recordUsage === "function") recordUsage(eventName);
}

function renderReport(container, report) {
  const rows = report.findings
    .map((finding) => `<tr><td><code>${finding.id}</code></td><td class="status-${finding.status}">${finding.status}</td></tr>`)
    .join("");

  container.innerHTML = `
    <div class="summary-card">
      <div class="summary-stat">
        <span class="summary-number ${report.review_required ? "build-only" : "production"}">${report.review_required ? "yes" : "no"}</span>
        <span class="summary-label">review required</span>
      </div>
      <div class="summary-stat">
        <span class="summary-number">${report.findings.length}</span>
        <span class="summary-label">records compared</span>
      </div>
    </div>
    <div class="report-actions">
      <button type="button" id="download-md">Download Markdown</button>
      <button type="button" id="download-json">Download JSON</button>
    </div>
    <div class="table-wrap">
      <p><strong>Register:</strong> ${report.register}</p>
      <p><strong>Source:</strong> ${report.source_url}</p>
      <p><strong>Captured:</strong> ${report.before_captured_at || "unknown"} &rarr; ${report.after_captured_at || "unknown"}</p>
      <h3>Records</h3>
      <table class="change-table">
        <thead><tr><th>Record</th><th>Status</th></tr></thead>
        <tbody>${rows || "<tr><td colspan=\"2\">no records in either snapshot</td></tr>"}</tbody>
      </table>
      <p class="reason">${report.limitations[0]}</p>
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
    download(toMarkdown(report), "text/markdown", "public-record-watch.md", "markdown_downloaded");
  });
  container.querySelector("#download-json")?.addEventListener("click", () => {
    download(toJson(report), "application/json", "public-record-watch.json", "json_downloaded");
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
  module.exports = { renderReport };
}
