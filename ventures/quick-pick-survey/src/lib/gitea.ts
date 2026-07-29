/**
 * Helper to submit user bug reports and feature requests directly to
 * Gitea repository issues so autonomous agents (Antigravity, Claude Code, Grok, Codex)
 * can pick them up and work on them.
 */
export async function createGiteaIssue(params: {
  kind: "bug" | "confusing" | "question" | "idea" | "other";
  message: string;
  email?: string | null;
  path?: string | null;
  impact?: string | null;
  perspective?: string | null;
  reference?: string;
}) {
  const giteaUrl = process.env.GITEA_URL;
  const token = process.env.GITEA_TOKEN;
  if (!giteaUrl || !token) return null;

  const title = `[${params.kind.toUpperCase()}] ${params.message.slice(0, 70)}${params.message.length > 70 ? "..." : ""}`;
  const body = `### User Feedback Report (${params.kind})

**Message:**
${params.message}

---
- **Path:** \`${params.path || "N/A"}\`
- **Impact:** \`${params.impact || "Not specified"}\`
- **Mode:** \`${params.perspective || "Unknown"}\`
- **Reference:** \`${params.reference || "N/A"}\`
- **Contact Email:** \`${params.email || "Anonymous"}\`
- **Submitted At:** ${new Date().toISOString()}

*Reported via Pairwise App feedback button — ready for agent resolution.*`;

  try {
    const res = await fetch(`${giteaUrl}/api/v1/repos/admin/monorepo-projects/issues`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `token ${token}`,
      },
      signal: AbortSignal.timeout(5_000),
      body: JSON.stringify({
        title,
        body,
        labels: [params.kind === "bug" ? "bug" : params.kind === "idea" ? "enhancement" : "user-feedback"],
      }),
    });

    if (res.ok) {
      const issue = await res.json();
      console.log(`Successfully created Gitea issue #${issue.number} for user ${params.kind}`);
      return issue;
    } else {
      console.warn("Gitea issue creation returned status:", res.status);
    }
  } catch (err) {
    console.error("Failed to post issue to Gitea:", err);
  }
  return null;
}
