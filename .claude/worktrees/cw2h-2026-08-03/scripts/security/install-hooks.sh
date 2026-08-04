#!/usr/bin/env bash
# Install Git Security & Quality Pre-Push Hook

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOK_DIR="$ROOT_DIR/.git/hooks"
PRE_PUSH_HOOK="$HOOK_DIR/pre-push"

if [ ! -d "$HOOK_DIR" ]; then
  echo "Git directory not found at $HOOK_DIR. Run this script inside a valid Git repository."
  exit 1
fi

cat << 'EOF' > "$PRE_PUSH_HOOK"
#!/usr/bin/env bash
# Automated Monorepo Pre-Push Quality & Security Hook

set -e

echo "🔍 Running pre-push security & quality verification..."
bash scripts/dev-verify.sh

EOF

chmod +x "$PRE_PUSH_HOOK"
echo "✅ Git pre-push hook installed successfully at $PRE_PUSH_HOOK."
