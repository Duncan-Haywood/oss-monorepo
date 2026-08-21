# Quality Improvement Quick Start

A practical, step-by-step guide to bringing your venture to Tier 2 (Maturity) quality standards in 2-3 weeks.

## Before You Start

1. Read [DEVELOPMENT_QUALITY.md](DEVELOPMENT_QUALITY.md) - understand the framework
2. Check [VENTURE_QUALITY_STATUS.md](VENTURE_QUALITY_STATUS.md) - see your venture's current status
3. Review [platform/QUALITY_CONFIG.md](platform/QUALITY_CONFIG.md) - copy templates from here

## Week 1: Foundation Polish

### Day 1: Clean Up Documentation (2 hours)
- [ ] Ensure VENTURE.yaml is valid and complete
- [ ] Review README.md - add missing sections (setup, testing, deployment)
- [ ] Add CONTRIBUTING.md with development guidelines
- [ ] Verify .gitignore is comprehensive (use templates online)

**Commit**: `docs: improve VENTURE.yaml and README completeness`

### Day 2: Set Up Linting (2 hours)
For **JavaScript/TypeScript**:
```bash
npm install --save-dev eslint prettier
npx eslint --init  # Choose 'recommended' preset
cp platform/templates/.eslintrc.json .
cp platform/templates/.prettierrc.json .
npm run lint
npm run format
```

For **Python**:
```bash
pip install pylint black isort
# Create .pylintrc and pyproject.toml
```

**Commit**: `chore: add ESLint and Prettier configuration`

### Day 3: Set Up Type Checking (2 hours)
For **TypeScript** ventures:
- [ ] Copy `platform/templates/tsconfig.json` to your venture
- [ ] Update package.json: `"type-check": "tsc --noEmit"`
- [ ] Run `npm run type-check` and fix errors
- [ ] Add TypeScript to CI workflow

For **JavaScript** with JSDoc:
- [ ] Enable type checking in .eslintrc
- [ ] Add JSDoc comments to key functions
- [ ] Run type checking tool (e.g., `dtslint`)

**Commit**: `chore: enable TypeScript strict mode`

### Day 4-5: Fix Code Quality Issues (3 hours)
```bash
npm run lint -- --fix  # Auto-fix fixable issues
npm run format         # Format all files
npm run type-check     # Fix remaining issues manually
git diff               # Review changes
git add .
git commit -m "fix: resolve linting and type errors"
```

## Week 2: Testing Infrastructure

### Day 1: Set Up Testing (2 hours)
For **JavaScript/TypeScript**:
```bash
npm install --save-dev jest @types/jest ts-jest
cp platform/templates/jest.config.js .
mkdir -p src/__tests__
# Create first test file
cat > src/__tests__/example.test.ts << 'EOF'
describe('My Module', () => {
  test('does what I expect', () => {
    expect(1 + 1).toBe(2);
  });
});
EOF
```

For **Python**:
```bash
pip install pytest pytest-cov
mkdir -p tests
cat > tests/test_example.py << 'EOF'
def test_example():
    assert 1 + 1 == 2
EOF
```

**Commit**: `test: set up Jest testing framework`

### Day 2: Write Core Tests (4 hours)
- [ ] Test core business logic (not UI/presentation)
- [ ] Aim for 50%+ coverage on critical paths
- [ ] Write 5-10 tests covering:
  - Happy path / normal usage
  - Edge cases
  - Error conditions
  - Data validation

```bash
npm run test:cov  # Check coverage
```

**Commit**: `test: add core unit tests`

### Day 3: Integrate Tests in CI/CD (2 hours)
Create `.github/workflows/YOUR_VENTURE-quality.yml`:
```yaml
name: Quality Checks
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm run test:cov
      - uses: codecov/codecov-action@v3
```

**Commit**: `ci: add GitHub Actions workflow for quality checks`

## Week 3: Documentation & Polish

### Day 1: API & Architecture Documentation (2 hours)
Create `docs/ARCHITECTURE.md`:
```markdown
# Architecture

## Overview
[Brief description of your system]

## Components
- Component A: [Purpose]
- Component B: [Purpose]

## Data Flow
[Diagram or description]

## Key Dependencies
[List important libraries and why]
```

Add JSDoc/docstrings to all public functions:
```typescript
/**
 * Calculates the sum of two numbers
 * @param a First number
 * @param b Second number
 * @returns The sum of a and b
 */
export function add(a: number, b: number): number {
  return a + b;
}
```

**Commit**: `docs: add architecture documentation and API docs`

### Day 2: Testing Documentation (1 hour)
Create `docs/TESTING.md`:
```markdown
# Testing Guide

## Running Tests
\`\`\`bash
npm run test        # Run all tests
npm run test:cov    # Run with coverage
npm run test -- --watch  # Watch mode
\`\`\`

## Writing Tests
1. Place in `src/__tests__/` or `src/**/*.test.ts`
2. Use descriptive test names
3. Follow AAA pattern: Arrange, Act, Assert

## Coverage Goals
- Target: >50% coverage
- Critical paths: >80% coverage
```

**Commit**: `docs: add testing documentation`

### Day 3: Final Polish & Review (2 hours)
- [ ] Run full quality check: `npm run lint && npm run type-check && npm run test:cov && npm run build`
- [ ] Fix any remaining issues
- [ ] Review git log: `git log --oneline | head -10`
- [ ] Verify all commits are descriptive

**Commit**: `chore: final quality improvements`

## Validation Checklist

Before considering your venture "Tier 2 ready", verify:

**Foundation (Tier 1):**
- [ ] VENTURE.yaml is complete and valid
- [ ] README.md has all sections
- [ ] .gitignore is configured
- [ ] No credentials in version control

**Maturity (Tier 2):**
- [ ] ✅ Linting passing: `npm run lint`
- [ ] ✅ Type checking passing: `npm run type-check`
- [ ] ✅ Tests passing: `npm run test`
- [ ] ✅ Build succeeds: `npm run build`
- [ ] ✅ >50% test coverage
- [ ] ✅ API/architecture documented
- [ ] ✅ CI/CD workflow configured

Run this command to verify everything:
```bash
npm run lint && npm run type-check && npm run test:cov && npm run build && echo "✅ All checks passed!"
```

## Common Patterns by Venture Type

### Web Applications (Next.js/React)
**Priority order:**
1. TypeScript setup (tsconfig.json)
2. ESLint + Prettier
3. Jest + React Testing Library
4. API documentation (REST endpoints)
5. E2E tests (optional but recommended)

**Recommended packages:**
```bash
npm install --save-dev typescript @typescript-eslint/eslint-plugin eslint-config-next
npm install --save-dev jest @testing-library/react @testing-library/jest-dom
```

### CLI/Utility Tools
**Priority order:**
1. Type checking (TypeScript or JSDoc)
2. Unit tests for core logic
3. CLI argument validation
4. Exit code documentation
5. Error message clarity

**Recommended packages:**
```bash
npm install --save-dev jest ts-jest commander zod
```

### Data Processing / Batch Jobs
**Priority order:**
1. Input validation
2. Error handling tests
3. Performance benchmarks
4. Data quality checks
5. Logging/observability

**Recommended packages:**
```bash
npm install --save-dev jest ts-jest pino joi
```

## Troubleshooting

### "Too many linting errors to fix"
```bash
# Fix in stages
npm run lint -- --fix              # Auto-fix what's fixable
npm run lint -- --max-warnings 50  # Gradually reduce threshold
# Or selectively disable for now and plan fixes
```

### "Can't reach 50% test coverage"
- [ ] Focus on core logic, not UI
- [ ] Test one function thoroughly before moving on
- [ ] Use `npm run test:cov -- --verbose` to see what's uncovered
- [ ] Some code (util files, etc) can have lower coverage

### "Build fails unexpectedly"
```bash
npm run build -- --verbose  # See detailed error
npm run type-check          # Find type errors
npm run lint                # Check for issues
```

## Next Steps After Tier 2

Once Tier 2 is achieved:
1. Review and plan Tier 3 improvements
2. Collect user feedback on quality
3. Set up error tracking (Sentry)
4. Plan security audit
5. Plan performance optimization

See [DEVELOPMENT_QUALITY.md](DEVELOPMENT_QUALITY.md#tier-3-excellence-production-ready) for Tier 3 requirements.

## Get Help

### Resources
- ESLint: https://eslint.org/docs/rules/
- Jest: https://jestjs.io/docs/getting-started
- TypeScript: https://www.typescriptlang.org/docs/

### Questions
1. Check platform/QUALITY_CONFIG.md for detailed setup
2. Review examples in other ventures (local-site-studio, print-atelier)
3. Open an issue with your specific question

---

**Estimated Time**: 2-3 weeks per venture  
**Expected Outcome**: Tier 2 (Maturity) quality level  
**Success Criteria**: All Tier 2 checkboxes complete ✅
