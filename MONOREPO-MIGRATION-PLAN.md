# Flatten Monorepo: Git Subtree → True Monorepo

**Goal:** Convert from git subtree-based monorepo to a unified monorepo with shared tooling.

**Timeline:** ~5-6 hours, with a 1-2 hour window where `main` is locked.

**Reversibility:** Yes, if you follow the backup steps.

---

## Pre-Migration Checklist

- [ ] All team members notified (no merges during migration window)
- [ ] Scheduled agents paused (no autonomous PRs during migration)
- [ ] CI/CD jobs paused or set to manual-only
- [ ] Local working directories clean (`git status` shows nothing)
- [ ] Main branch fully up-to-date locally (`git pull origin main`)

---

## Phase 1: Backup & Preparation (30 min)

### Step 1a: Create Safety Branches

```bash
# Create throwaway test branch (for dry-run)
git checkout -b migration/test-flatten

# Create safety backup of current main
git checkout main
git pull origin main
git push origin main:backup/pre-flatten-2026-08-19
git checkout migration/test-flatten
```

### Step 1b: Verify Structure

```bash
# List current ventures
ls -1 ventures/

# Verify all have VENTURE.yaml or NOT-A-VENTURE
for dir in ventures/*/; do
  if [[ ! -f "${dir}VENTURE.yaml" && ! -f "${dir}NOT-A-VENTURE" ]]; then
    echo "❌ Missing marker: $dir"
  fi
done
```

### Step 1c: Install git-filter-repo (if needed)

```bash
# macOS
brew install git-filter-repo

# Linux (Ubuntu/Debian)
sudo apt-get install git-filter-repo

# Verify installation
git filter-repo --version
```

---

## Phase 2: Git History Flattening (45 min)

**WARNING:** This rewrites git history. Do this on `migration/test-flatten` first, verify, then on `main`.

### Step 2a: Test Run on Throwaway Branch

```bash
# Already on migration/test-flatten
# This is just to verify the commands work

# Flatten the history (remove git-subtree metadata)
git filter-repo --force

# Verify
git log --oneline | head -20
echo "✅ Test flatten succeeded"

# Don't push this; just verify locally
```

### Step 2b: Real Flatten on Main

```bash
# Go back to main and reset to latest
git checkout main
git reset --hard origin/main
git clean -fd

# Run the actual flatten
git filter-repo --force

# This will rewrite all history
# Takes 1-2 minutes depending on repo size
```

### Step 2c: Verify Flatten

```bash
# Check that history looks normal
git log --oneline -20

# Verify all files are intact
ls -la ventures/ | head -5
ls -la platform/ | head -5
ls -la portfolio/ | head -5

# Verify commit count hasn't exploded
git rev-list --all --count

# All should look normal (slight commit count change is OK)
```

---

## Phase 3: Setup Shared Tooling (2 hours)

### Step 3a: Create Root pnpm-workspace.yaml

Create `.pnpmrc` and `pnpm-workspace.yaml`:

```bash
cat > .ppmrc << 'EOF'
# pnpm configuration
shamefully-hoist=true
strict-peer-dependencies=false
EOF

cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'ventures/*'
  - 'platform/*'

# Exclude non-package directories
ignore:
  - 'portfolio/**'
EOF
```

### Step 3b: Create Root Base Configs

**Root `tsconfig.json` (base that ventures extend):**

```bash
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "build", ".next"]
}
EOF
```

**Root `eslint.config.mjs` (base that ventures extend):**

```bash
cat > eslint.config.mjs << 'EOF'
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['node_modules', 'dist', 'build', '.next', 'coverage'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
EOF
```

**Root `.prettierrc`:**

```bash
cat > .prettierrc << 'EOF'
{
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true
}
EOF
```

**Root `package.json` (updated):**

```bash
cat > package.json << 'EOF'
{
  "name": "monorepo-projects",
  "version": "1.0.0",
  "description": "Portfolio monorepo: ventures + shared platform + router",
  "private": true,
  "workspaces": ["ventures/*", "platform/*"],
  "scripts": {
    "install": "pnpm install",
    "lint": "eslint .",
    "format": "prettier --write .",
    "type-check": "tsc --noEmit",
    "test": "pnpm -r test",
    "build": "pnpm -r build",
    "validate": "python3 portfolio/router/validate.py"
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^16.3.1",
    "prettier": "^3.0.0",
    "typescript": "^5.3.0"
  }
}
EOF
```

### Step 3c: Update Venture package.json Files

Each venture's `package.json` should extend the root config:

**Example: `ventures/local-site-studio/package.json`**

```bash
# For each venture with a package.json, ensure it has:
# - Venture-specific dependencies only
# - Scripts that run venture-specific commands
# - Optional tsconfig.json that extends root

# Don't duplicate root devDependencies
```

**Example: `ventures/local-site-studio/tsconfig.json` (if it has one):**

```bash
cat > ventures/local-site-studio/tsconfig.json << 'EOF'
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src", "tests"]
}
EOF
```

### Step 3d: Create Root `.gitignore` (if needed)

```bash
cat >> .gitignore << 'EOF'
# Node
node_modules/
pnpm-lock.yaml
package-lock.json
npm-shrinkwrap.json

# Build outputs
dist/
build/
.next/
*.tsbuildinfo

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Environment
.env
.env.local
.env.*.local
EOF
```

---

## Phase 4: Update CI/CD (1 hour)

### Step 4a: Update Workflow to Use pnpm Workspaces

**Example: `.github/workflows/test.yml` (new file)**

```bash
cat > .github/workflows/test.yml << 'EOF'
name: Test all ventures

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: 'pnpm'
      
      - run: pnpm install
      
      - run: pnpm type-check
      
      - run: pnpm lint
      
      - run: pnpm test
      
      - run: python3 portfolio/router/validate.py
EOF
```

### Step 4b: Update Venture-Specific CI

Each venture's CI should continue to work (pnpm filters by workspace):

```bash
# Example: run tests for only one venture
pnpm -r --filter local-site-studio test
```

### Step 4c: Update Agent Prompts (Minimal)

The agent prompts can mostly stay the same, but update to reference:
- Root `pnpm-workspace.yaml` for workspace management
- Shared configs for linting/types
- Example: `.github/prompts/agent-entrypoint.md` stays unchanged (router still works)

---

## Phase 5: Testing & Verification (1 hour)

### Step 5a: Local Verification

```bash
# Install dependencies
pnpm install

# Run workspace commands
pnpm type-check
pnpm lint
pnpm test

# Verify router still works
python3 portfolio/router/validate.py

# Run a single venture's tests
pnpm -r --filter local-site-studio test
```

### Step 5b: Verify Git History

```bash
# Check total commits (should be similar to before)
git rev-list --all --count

# Sample commit log
git log --oneline | head -50

# Verify all branches exist
git branch -r | grep -E 'claude|opencode' | wc -l
```

### Step 5c: Dry-Run on Test Branch

```bash
# Create a test PR branch to ensure everything works
git checkout -b test/migration-validation
git push origin test/migration-validation

# Wait for CI to pass (should be quick, just linting/types/tests)
# If CI passes: ✅ Ready to push to main
# If CI fails: fix config issues before proceeding
```

---

## Phase 6: Go Live (15 min)

### Step 6a: Force-Push to Main

```bash
# ⚠️  POINT OF NO RETURN

# Pause scheduled agents (optional but recommended)
# Disable CI auto-run on main (optional)

# Final check: working directory is clean
git status

# Force-push the flattened history
git push --force-with-lease origin main

# Verify remote updated
git fetch origin main
git log origin/main --oneline | head -5
```

### Step 6b: Re-enable Automation

```bash
# Re-enable CI
# Re-enable scheduled agents
# Re-enable normal PR workflows

# Verify first PR/merge succeeds
```

### Step 6c: Notify Team

```
✅ Monorepo flattened successfully!

- Git history compressed (no subtree metadata)
- pnpm workspaces configured
- Shared configs (tsconfig, eslint, prettier) at root
- All ventures working with unified tooling
- Router continues to work unchanged

All future development uses: pnpm install, pnpm test, pnpm lint
```

---

## Phase 7: Cleanup (15 min, can defer)

### Step 7a: Delete Backup Branch (after 1 week)

```bash
# After verifying everything works for a week:
git push origin --delete backup/pre-flatten-2026-08-19
```

### Step 7b: Update Documentation

Update `README.md` and `CLAUDE.md`:
- Remove references to git subtree
- Document how to use pnpm workspaces
- Link to this migration plan for reference

### Step 7c: Update Agent Prompts (Minimal)

Update agent prompts to mention pnpm if relevant:
- `.github/prompts/agent-entrypoint.md` (no changes needed; router-based)
- `.github/prompts/claude-code-agents.md` (mention pnpm workspace as context)
- `.github/prompts/cursor-agents.md` (mention pnpm workspace as context)

---

## Rollback Plan (If Needed)

If something goes catastrophically wrong:

```bash
# Reset to pre-migration state
git fetch origin backup/pre-flatten-2026-08-19
git reset --hard origin/backup/pre-flatten-2026-08-19
git push --force-with-lease origin main

# This restores the entire repo to pre-migration state
# All PRs opened after migration will need to be rebased
```

---

## Troubleshooting

### "git filter-repo: command not found"
→ Install it: `brew install git-filter-repo` (macOS) or `sudo apt-get install git-filter-repo` (Linux)

### "Can't push to main (not fast-forward)"
→ Use `--force-with-lease` not `--force` (safer, fails if remote changed)

### "CI fails after migration"
→ Check `.github/workflows/*.yml` paths; pnpm might be filtering differently
→ Run `pnpm -r --filter <venture> <command>` locally to debug

### "pnpm install fails"
→ Delete `pnpm-lock.yaml` and retry: `pnpm install`
→ Ensure all ventures have `package.json` files

### "Ventures can't find shared deps"
→ Check `.ppmrc` has `shamefully-hoist=true`
→ Run `pnpm install` again from root

---

## Success Criteria

- [ ] All commits preserved (git log shows expected history)
- [ ] All files intact (ventures/, platform/, portfolio/ all present)
- [ ] pnpm workspace recognized (`pnpm list` shows all packages)
- [ ] Root config files work (`pnpm lint`, `pnpm type-check` pass)
- [ ] Router validates (`python3 portfolio/router/validate.py` passes)
- [ ] CI passes on a test PR
- [ ] Team can develop normally (pnpm install → pnpm lint → pnpm test works)

---

## Timeline Summary

| Phase | Task | Duration |
|---|---|---|
| 1 | Backup & prep | 30 min |
| 2 | Git flattening | 45 min |
| 3 | Config setup | 2 hours |
| 4 | CI/CD updates | 1 hour |
| 5 | Testing & verify | 1 hour |
| 6 | Go live | 15 min |
| 7 | Cleanup | 15 min (later) |
| **Total** | | **~5.5 hours** |

**Main lock window:** ~2 hours (phases 2-3, until first successful CI pass)

---

## Next Steps

1. Pick a time when no one is actively merging
2. Run through phases 1-5 on your machine first (don't push yet)
3. When confident, follow phase 6 to go live
4. Monitor CI and team feedback for the first day
5. Do phase 7 cleanup after one week of stability
