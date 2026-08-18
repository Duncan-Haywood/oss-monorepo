#!/usr/bin/env node

/**
 * Continuous Repo Advancement Agent
 *
 * Uses Deepseek Flash V4 for planning and OpenCode for implementation.
 * Identifies work to be done, plans it, and implements changes via OpenCode.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY;
const REPO_ROOT = process.env.REPO_ROOT || process.cwd();

class RepoAdvancementAgent {
  constructor() {
    this.deepseekModel = 'deepseek-chat';
    this.deepseekBaseUrl = 'https://api.deepseek.com';
    this.opencodeBaseUrl = 'https://api.opencode.dev';
  }

  async planWork() {
    console.log('📋 Planning work with Deepseek Flash V4...');

    const repoState = this.analyzeRepoState();
    const prompt = this.buildPlanningPrompt(repoState);

    try {
      const response = await fetch(`${this.deepseekBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: `You are a code advancement agent. Analyze the repository state and identify specific, actionable work that can be done to improve the codebase. Focus on:
- Missing tests
- Code quality improvements
- Documentation gaps
- Performance optimizations
- Bug fixes based on code analysis
- Dependency updates

Respond with a JSON object containing:
{
  "work_items": [
    {
      "id": "unique-id",
      "title": "Short description",
      "description": "Detailed explanation",
      "type": "test|refactor|docs|fix|feature",
      "priority": "high|medium|low",
      "estimated_effort": "small|medium|large",
      "files_to_modify": ["relative/path"],
      "implementation_notes": "How to implement this"
    }
  ],
  "rationale": "Why these items were selected"
}`,
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 4000,
        }),
      });

      if (!response.ok) {
        throw new Error(`Deepseek API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      try {
        return JSON.parse(content);
      } catch (e) {
        console.log('Raw response from Deepseek:', content);
        throw new Error('Failed to parse work plan from Deepseek response');
      }
    } catch (error) {
      console.error('❌ Error planning work:', error.message);
      throw error;
    }
  }

  async implementWork(workItems, maxItems = 3) {
    console.log(`\n🛠️  Implementing top ${Math.min(maxItems, workItems.length)} work items...`);

    const selected = workItems
      .sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const effortOrder = { small: 0, medium: 1, large: 2 };
        return (priorityOrder[a.priority] - priorityOrder[b.priority]) ||
               (effortOrder[a.estimated_effort] - effortOrder[b.estimated_effort]);
      })
      .slice(0, maxItems);

    const results = [];

    for (const item of selected) {
      try {
        console.log(`\n  📝 ${item.title}`);
        const result = await this.implementItem(item);
        results.push({ item, result, success: true });
      } catch (error) {
        console.error(`  ❌ Failed: ${error.message}`);
        results.push({ item, result: error.message, success: false });
      }
    }

    return results;
  }

  async implementItem(workItem) {
    console.log(`  Calling OpenCode API for: ${workItem.title}`);

    const prompt = this.buildImplementationPrompt(workItem);

    try {
      const response = await fetch(`${this.opencodeBaseUrl}/v1/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENCODE_API_KEY}`,
        },
        body: JSON.stringify({
          task: workItem.title,
          description: workItem.description,
          implementation_notes: workItem.implementation_notes,
          files: workItem.files_to_modify,
          context: 'monorepo-advancement',
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenCode API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return {
        status: 'completed',
        changes: data.changes || [],
        message: data.message || 'Implementation generated',
      };
    } catch (error) {
      throw new Error(`OpenCode implementation failed: ${error.message}`);
    }
  }

  analyzeRepoState() {
    const state = {
      ventures: [],
      totalTests: 0,
      buildStatus: 'unknown',
      lastCommit: this.getLastCommit(),
      recentChanges: this.getRecentChanges(),
    };

    // Scan ventures for basic metrics
    const venturesDir = path.join(REPO_ROOT, 'ventures');
    if (fs.existsSync(venturesDir)) {
      state.ventures = fs.readdirSync(venturesDir)
        .filter(f => fs.statSync(path.join(venturesDir, f)).isDirectory())
        .map(venture => ({
          name: venture,
          hasTests: fs.existsSync(path.join(venturesDir, venture, '__tests__')) ||
                   fs.existsSync(path.join(venturesDir, venture, 'tests')),
          hasPackageJson: fs.existsSync(path.join(venturesDir, venture, 'package.json')),
        }));
    }

    return state;
  }

  getLastCommit() {
    try {
      const commit = execSync('git log -1 --oneline', {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
      }).trim();
      return commit;
    } catch {
      return 'unknown';
    }
  }

  getRecentChanges() {
    try {
      const changes = execSync('git diff --name-only HEAD~5..HEAD', {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
      }).trim().split('\n').filter(Boolean);
      return changes;
    } catch {
      return [];
    }
  }

  buildPlanningPrompt(repoState) {
    return `Analyze this repository state and propose specific work:

Repository State:
${JSON.stringify(repoState, null, 2)}

Last commit: ${repoState.lastCommit}
Recent changes: ${repoState.recentChanges.join(', ')}

Ventures: ${repoState.ventures.map(v => `${v.name} (tests: ${v.hasTests ? 'yes' : 'no'}, package: ${v.hasPackageJson ? 'yes' : 'no'})`).join(', ')}

Identify 5-10 specific work items that would improve the codebase. Focus on high-impact, achievable items that can be completed in a single PR.`;
  }

  buildImplementationPrompt(workItem) {
    return `Implement the following work item in the monorepo:

Title: ${workItem.title}
Type: ${workItem.type}
Priority: ${workItem.priority}
Effort: ${workItem.estimated_effort}

Description:
${workItem.description}

Files to modify:
${workItem.files_to_modify.join('\n')}

Implementation notes:
${workItem.implementation_notes}

Generate the code changes needed to complete this work item. Ensure changes are backward compatible and follow the existing code style.`;
  }

  async run() {
    try {
      if (!DEEPSEEK_API_KEY) {
        throw new Error('DEEPSEEK_API_KEY environment variable is not set');
      }
      if (!OPENCODE_API_KEY) {
        throw new Error('OPENCODE_API_KEY environment variable is not set');
      }

      console.log('🚀 Starting Repo Advancement Agent');
      console.log(`📂 Working directory: ${REPO_ROOT}`);

      const plan = await this.planWork();
      console.log(`\n✅ Generated plan with ${plan.work_items.length} items`);
      console.log(`   Rationale: ${plan.rationale}`);

      const implementations = await this.implementWork(plan.work_items);

      console.log('\n📊 Summary:');
      console.log(`   Total items planned: ${plan.work_items.length}`);
      console.log(`   Items implemented: ${implementations.filter(r => r.success).length}`);
      console.log(`   Failed items: ${implementations.filter(r => !r.success).length}`);

      process.exit(implementations.some(r => !r.success) ? 1 : 0);
    } catch (error) {
      console.error('❌ Agent failed:', error.message);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  const agent = new RepoAdvancementAgent();
  agent.run();
}

module.exports = RepoAdvancementAgent;
