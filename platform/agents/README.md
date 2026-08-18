# Repo Advancement Agent

An automated agent that continuously improves the repository using Deepseek Flash V4 for planning and OpenCode for implementation.

## Overview

The Repo Advancement Agent:
- Analyzes repository state (ventures, tests, recent changes)
- Uses **Deepseek Flash V4** to plan specific, actionable improvements
- Uses **OpenCode** to implement the changes
- Creates pull requests with the improvements

## Setup

### 1. Add GitHub Secrets

Add the following secrets to your GitHub repository settings:

#### DEEPSEEK_API_KEY
- Get from: https://platform.deepseek.com/api_keys
- Add to: Repository Settings → Secrets and variables → Actions

#### OPENCODE_API_KEY
- Get from: https://api.opencode.dev (when available)
- Add to: Repository Settings → Secrets and variables → Actions

### 2. Workflow Configuration

The agent runs via GitHub Actions on two triggers:

**Scheduled (Default)**
- Runs every Monday at 9 AM UTC
- Can be customized in `.github/workflows/repo-advancement-agent.yml`

**Manual Trigger**
- Go to Actions → Repo Advancement Agent → Run workflow
- Optionally specify max work items to implement (default: 3)

## How It Works

### Phase 1: Planning (Deepseek)
1. Analyzes current repository state
2. Scans ventures, tests, recent changes
3. Uses Deepseek Flash V4 to generate 5-10 specific work items
4. Prioritizes by impact and effort

### Phase 2: Implementation (OpenCode)
1. Selects top N work items (default: 3)
2. For each item, sends implementation request to OpenCode API
3. OpenCode generates code changes
4. Changes are committed and pushed

### Phase 3: Pull Request
1. Creates PR with all changes
2. Includes agent output in PR description
3. Ready for review and approval

## Work Item Types

The agent identifies opportunities in several categories:

- **test**: Add missing tests, improve test coverage
- **refactor**: Code quality, simplification, technical debt
- **docs**: Documentation gaps, README updates
- **fix**: Bug fixes identified through code analysis
- **feature**: Small feature additions or improvements

## Configuration

### Environment Variables

```bash
DEEPSEEK_API_KEY      # Required: Deepseek API key
OPENCODE_API_KEY      # Required: OpenCode API key
REPO_ROOT             # Optional: Repository root (default: cwd)
```

### Customization

Edit `.github/workflows/repo-advancement-agent.yml`:

- Change cron schedule: `- cron: '0 9 * * 1'`
- Adjust PR creation logic
- Modify max items: `max_items` input parameter

## Agent Implementation

The agent is implemented in `platform/agents/repo-advancement.js`:

```javascript
const agent = new RepoAdvancementAgent();
await agent.run();
```

### Key Methods

- `planWork()`: Uses Deepseek to identify improvements
- `implementWork(items)`: Implements selected items via OpenCode
- `analyzeRepoState()`: Scans repository structure and status

## Monitoring

Check the workflow runs:
1. Go to Actions → Repo Advancement Agent
2. View logs for detailed output
3. Review generated PRs for changes

## Best Practices

1. **Review PRs carefully** - Always review the agent's work before merging
2. **Monitor for patterns** - If the agent keeps suggesting the same thing, consider fixing the underlying issue
3. **Adjust priorities** - If results aren't meeting expectations, adjust the planning prompt in the agent code
4. **Rate limiting** - Be aware of API rate limits for Deepseek and OpenCode
5. **Branch protection** - Consider requiring reviews before merging agent PRs

## Troubleshooting

### Agent fails with API error
- Verify API keys are set correctly in GitHub Secrets
- Check API key has proper permissions
- Ensure API endpoints are accessible from GitHub Actions runners

### No work items identified
- Repository might already be well-maintained
- Adjust the planning prompt to look for different types of improvements
- Check recent commits - agent skips duplicate work

### OpenCode errors
- Verify OpenCode API endpoint is correct
- Check request format matches API expectations
- Review OpenCode API documentation

## API Integration Notes

### Deepseek API
- Endpoint: https://api.deepseek.com/chat/completions
- Model: deepseek-chat
- Temperature: 0.7 (configurable)
- Response: JSON with work items list

### OpenCode API
- Endpoint: https://api.opencode.dev/v1/generate
- Method: POST with task details
- Response: Generated code changes

## Future Enhancements

- [ ] Support for multiple ventures prioritization
- [ ] Integration with project management tools
- [ ] Cost tracking per work item
- [ ] Feedback loop to improve planning
- [ ] Support for other coding agents (Claude Code, etc.)
- [ ] Automatic testing of generated code
- [ ] Merge conflict resolution

## Notes

- The agent creates branches with timestamp: `agent/advancement-{timestamp}`
- Commits use configured bot user: `Repo Advancement Agent`
- All PRs are marked as ready for review (not draft)
- Changes are backwards compatible and follow existing code style
