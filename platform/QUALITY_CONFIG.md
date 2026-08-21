# Platform Quality Configuration Guide

This document provides standardized quality tooling and CI/CD templates for all ventures to adopt.

## Shared Quality Standards

All ventures should inherit these baseline quality standards from the platform:

### Code Quality Tools

#### ESLint Configuration (JavaScript/TypeScript)
```json
// .eslintrc.json
{
  "extends": [
    "eslint:recommended"
  ],
  "parserOptions": {
    "ecmaVersion": 2020,
    "sourceType": "module"
  },
  "env": {
    "node": true,
    "es2020": true
  },
  "rules": {
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "no-unused-vars": "error",
    "eqeqeq": "error",
    "curly": "error"
  }
}
```

#### Prettier Configuration (Code Formatting)
```json
// .prettierrc.json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2
}
```

#### TypeScript Configuration (Type Safety)
```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Testing Standards

#### Jest Configuration (JavaScript/TypeScript)
```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/**/*.d.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)'
  ]
};
```

### CI/CD Templates

#### GitHub Actions Workflow Template
```yaml
# .github/workflows/venture-quality.yml
name: Quality Checks

on:
  push:
    branches: [main]
    paths:
      - 'ventures/YOUR_VENTURE/**'
  pull_request:
    branches: [main]
    paths:
      - 'ventures/YOUR_VENTURE/**'

jobs:
  quality:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ventures/YOUR_VENTURE
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Lint
        run: npm run lint
      
      - name: Type check
        run: npm run type-check
      
      - name: Test
        run: npm run test:cov
      
      - name: Build
        run: npm run build
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          flags: ${{ matrix.venture }}
```

## Per-Venture Implementation Guide

### Step 1: Audit Current State
```bash
# Check what's currently in place
./scripts/venture-audit.sh ventures/YOUR_VENTURE
```

### Step 2: Apply Template Configuration
```bash
# Copy platform standards to venture
cp platform/templates/.eslintrc.json ventures/YOUR_VENTURE/
cp platform/templates/.prettierrc.json ventures/YOUR_VENTURE/
cp platform/templates/tsconfig.json ventures/YOUR_VENTURE/
```

### Step 3: Install Dependencies
```bash
cd ventures/YOUR_VENTURE
npm install --save-dev eslint prettier jest @types/jest typescript
```

### Step 4: Add Package.json Scripts
```json
{
  "scripts": {
    "lint": "eslint src --ext .js,.ts,.jsx,.tsx",
    "format": "prettier --write src",
    "type-check": "tsc --noEmit",
    "test": "jest",
    "test:cov": "jest --coverage",
    "build": "tsc",
    "dev": "your-dev-command"
  }
}
```

### Step 5: Create Tests Directory
```bash
mkdir -p ventures/YOUR_VENTURE/src/__tests__
# Add example test file
cat > ventures/YOUR_VENTURE/src/__tests__/example.test.ts << 'EOF'
describe('Example', () => {
  test('works', () => {
    expect(true).toBe(true);
  });
});
EOF
```

### Step 6: Configure CI/CD
```bash
# Create venture-specific workflow
cp platform/templates/venture-quality.yml .github/workflows/YOUR_VENTURE-quality.yml
# Edit to replace YOUR_VENTURE with actual name
sed -i 's/YOUR_VENTURE/your-venture/g' .github/workflows/YOUR_VENTURE-quality.yml
```

## Pre-commit Hooks Setup

All ventures should use pre-commit hooks to catch issues before commits:

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.0.1
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
      - id: check-json
      - id: check-merge-conflict
  
  - repo: https://github.com/charliermarsh/ruff-pre-commit
    rev: v0.1.0
    hooks:
      - id: ruff
        args: [--fix, --exit-zero]
      - id: ruff-format
  
  - repo: https://github.com/pre-commit/mirrors-prettier
    rev: v3.0.0
    hooks:
      - id: prettier
        types_or: [javascript, typescript, json, markdown, yaml]
```

Install with:
```bash
pip install pre-commit
pre-commit install
pre-commit run --all-files  # Test on existing code
```

## Security Scanning

### Dependency Scanning
```bash
# npm
npm audit

# pip
pip audit

# Cargo
cargo audit
```

### Secret Scanning
```bash
# Using truffleHog
trufflehog filesystem . --json

# Using detect-secrets
detect-secrets scan
```

### SAST (Static Application Security Testing)
For JavaScript/TypeScript:
```bash
npm install --save-dev semgrep
semgrep --config=p/owasp-top-ten --config=p/security-audit
```

## Documentation Standards

Every venture should have:

### 1. README.md
- Project description and purpose
- Technology stack
- Quick start guide
- Development setup
- Testing instructions
- Deployment process
- Contributing guidelines

### 2. Architecture.md
- High-level system design
- Component/module overview
- Key design decisions (ADRs)
- Data flow diagrams
- API specification

### 3. SETUP.md (or Development section in README)
- Prerequisites
- Installation steps
- Environment variables
- Running locally
- Debugging tips

### 4. API.md (for web/backend services)
- Endpoint documentation
- Request/response formats
- Authentication details
- Error codes
- Rate limiting (if applicable)

## Quality Metrics & Reporting

### Coverage Reporting
```bash
# Generate coverage report
npm run test:cov

# Upload to Codecov
bash <(curl -s https://codecov.io/bash)
```

### Code Metrics Dashboard
Ventures can track:
- Test coverage %
- Linting score
- Build time
- Bundle size
- Performance metrics

Use `codecov`, `sonarqube`, or simple CI output for reporting.

## Continuous Improvement Process

### Weekly Quality Reviews
```bash
# Generate venture quality report
python3 platform/scripts/quality-report.py ventures/YOUR_VENTURE
```

### Monthly Portfolio Assessment
- Review quality metrics across all ventures
- Identify common issues
- Update standards based on lessons learned
- Share best practices

## Troubleshooting Common Issues

### TypeScript Errors
```bash
# Strict mode too strict? Update tsconfig.json
# But first try to fix the errors rather than relax rules
tsc --noEmit --pretty
```

### Test Coverage Issues
```bash
# See what's not covered
npm run test:cov -- --collectCoverageFrom='src/**' --verbose
```

### Large Bundle Size
```bash
# Analyze what's in the bundle
npm install -D webpack-bundle-analyzer
# Add to build process and check output
```

## Templates Directory

The `platform/templates/` directory contains:

```
platform/templates/
├── .eslintrc.json          # ESLint config
├── .prettierrc.json        # Prettier config
├── tsconfig.json           # TypeScript config
├── jest.config.js          # Jest config
├── .pre-commit-config.yaml # Pre-commit hooks
└── workflows/
    └── venture-quality.yml # GitHub Actions template
```

These can be copied into each venture and customized as needed.

## Advanced Configurations

### Monorepo-specific Setup (if venture has sub-packages)
Use workspace configuration in package.json:
```json
{
  "workspaces": [
    "packages/*"
  ]
}
```

### Docker-based Quality Checks
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run lint
RUN npm run test:cov
RUN npm run build
```

## Compliance & Auditing

### Quarterly Audits
- Review all ventures for compliance with Tier requirements
- Update VENTURE_QUALITY_STATUS.md
- Create improvement tickets for gaps

### Annual Assessment
- Full security audit
- Dependency analysis
- Architecture review
- User feedback integration

---

**Last Updated**: 2026-08-21  
**Maintained By**: Development Team  
**Review Frequency**: Quarterly
