// DOM wiring for the browser evidence tool. Depends on evidence.js's globals
// (buildReport, toMarkdown, toJson) and usage.js's (recordUsage, isUsageEnabled,
// setUsageEnabled) being loaded first via plain <script> tags — no bundler, no
// build step, no upload: the file never leaves this tab.

function track(eventName) {
  if (typeof recordUsage === "function") recordUsage(eventName);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderReport(container, report) {
  const rows = report.components
    .map(
      (row) => `
      <tr class="surface-${row.surface}">
        <td><code>${escapeHtml(row.name)}</code></td>
        <td>${escapeHtml(row.versions.join(", "))}</td>
        <td><span class="badge ${row.surface}">${row.surface}</span></td>
        <td class="reason">${escapeHtml(row.reason)}</td>
      </tr>`,
    )
    .join("");

  container.innerHTML = `
    <div class="summary-card">
      <div class="summary-stat">
        <span class="summary-number">${report.componentCount}</span>
        <span class="summary-label">components checked</span>
      </div>
      <div class="summary-stat">
        <span class="summary-number production">${report.counts.production || 0}</span>
        <span class="summary-label">production-path</span>
      </div>
      <div class="summary-stat">
        <span class="summary-number build-only">${report.counts["build-only"] || 0}</span>
        <span class="summary-label">build-only</span>
      </div>
    </div>
    <div class="report-actions">
      <button type="button" id="download-md">Download Markdown</button>
      <button type="button" id="download-json">Download JSON</button>
    </div>
    <div class="table-wrap">
      <table class="component-table">
        <thead>
          <tr><th>Package</th><th>Version(s)</th><th>Surface</th><th>Evidence</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
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
    download(toMarkdown(report), "text/markdown", "npm-deployment-evidence.md", "markdown_downloaded");
  });
  container.querySelector("#download-json")?.addEventListener("click", () => {
    download(toJson(report), "application/json", "npm-deployment-evidence.json", "json_downloaded");
  });
}

function initApp() {
  const fileInput = document.getElementById("lockfile-input");
  const pasteArea = document.getElementById("lockfile-paste");
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
      showError("Paste the contents of package-lock.json first.");
      return;
    }
    runReport(text, "package-lock.json");
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

  // This tool's own lockfile — lets a first visit see a real report before
  // hunting down a package-lock.json of their own, on the same code path a
  // pasted file would take (not a separate hard-coded result).
  exampleButton?.addEventListener("click", async () => {
    try {
      const res = await fetch("example-package-lock.json");
      if (!res.ok) throw new Error("example unavailable");
      const text = await res.text();
      runReport(text, "example-package-lock.json");
      track("example_used");
    } catch {
      showError("Could not load the bundled example. Paste or drop your own package-lock.json instead.");
    }
  });
}

if (typeof window !== "undefined") {
  document.addEventListener("DOMContentLoaded", initApp);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { renderReport, escapeHtml };
}
