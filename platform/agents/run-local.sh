#!/bin/bash

# Local test runner for Repo Advancement Agent
# Usage: ./run-local.sh [--dry-run] [--max-items N]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel)"

DRY_RUN=false
MAX_ITEMS=3

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --max-items)
      MAX_ITEMS="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "🚀 Repo Advancement Agent - Local Runner"
echo "📂 Repository: $REPO_ROOT"
echo "🔧 Max items: $MAX_ITEMS"
echo "🧪 Dry run: $DRY_RUN"
echo ""

# Check API keys
if [[ -z "$DEEPSEEK_API_KEY" ]]; then
  echo "⚠️  DEEPSEEK_API_KEY is not set"
  echo "   Set it with: export DEEPSEEK_API_KEY='your-key'"
  exit 1
fi

if [[ -z "$OPENCODE_API_KEY" ]]; then
  echo "⚠️  OPENCODE_API_KEY is not set"
  echo "   Set it with: export OPENCODE_API_KEY='your-key'"
  exit 1
fi

# Create a test branch
TEST_BRANCH="agent/advancement-test-$(date +%s)"
echo "Creating test branch: $TEST_BRANCH"
git checkout -b "$TEST_BRANCH" || git checkout "$TEST_BRANCH"

# Run the agent
echo ""
echo "Running agent..."
export REPO_ROOT="$REPO_ROOT"
node "$SCRIPT_DIR/repo-advancement.js"

# Show results
echo ""
echo "✅ Agent run complete"
echo ""
echo "Changed files:"
git status --short || echo "  (none)"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
  echo "🧪 DRY RUN - Resetting changes"
  git reset --hard HEAD
  git checkout - 2>/dev/null || true
  git branch -D "$TEST_BRANCH" 2>/dev/null || true
else
  echo "📝 To review changes:"
  echo "   git diff"
  echo ""
  echo "📤 To push and create PR:"
  echo "   git push -u origin $TEST_BRANCH"
  echo ""
  echo "🔙 To discard and switch back:"
  echo "   git checkout -"
  echo "   git branch -D $TEST_BRANCH"
fi
